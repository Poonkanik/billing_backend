const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const RegisterSession = require('../models/RegisterSession');
const Bill = require('../models/Bill');
const { protect } = require('../middleware/auth');

const DENOMINATIONS_LIST = [500, 200, 100, 50, 20, 10, 5, 2, 1];

// Helper to normalize denomination inputs into structured array & compute total
const parseDenominations = (input) => {
  let list = [];
  let total = 0;

  if (Array.isArray(input)) {
    list = DENOMINATIONS_LIST.map(d => {
      const found = input.find(item => Number(item.denomination) === d);
      const count = Math.max(0, parseInt(found?.count) || 0);
      const amount = d * count;
      total += amount;
      return { denomination: d, count, amount };
    });
  } else if (typeof input === 'object' && input !== null) {
    list = DENOMINATIONS_LIST.map(d => {
      const count = Math.max(0, parseInt(input[d]) || 0);
      const amount = d * count;
      total += amount;
      return { denomination: d, count, amount };
    });
  } else {
    list = DENOMINATIONS_LIST.map(d => ({ denomination: d, count: 0, amount: 0 }));
  }

  return { list, total };
};

// Helper to compute sales breakdown for a time period
const computeSalesBreakdown = async (startTime, endTime, branchId) => {
  const match = {
    date: { $gte: new Date(startTime), $lte: new Date(endTime) },
    status: { $in: ['billed', 'edited'] },
  };

  if (branchId) {
    match.branch = new mongoose.Types.ObjectId(branchId);
  }

  const bills = await Bill.find(match);

  let totalCashSales = 0;
  let totalUpiSales = 0;
  let totalCardSales = 0;
  let totalOtherSales = 0;
  let totalSales = 0;

  bills.forEach(bill => {
    const amt = Number(bill.netAmount) || 0;
    totalSales += amt;

    const mode = (bill.paymentMode || 'Cash').toLowerCase();
    if (mode === 'cash') {
      totalCashSales += amt;
    } else if (mode.includes('upi') || mode.includes('gpay') || mode.includes('phonepe') || mode.includes('paytm') || mode.includes('qr')) {
      totalUpiSales += amt;
    } else if (mode.includes('card') || mode.includes('credit') || mode.includes('debit') || mode.includes('pos')) {
      totalCardSales += amt;
    } else {
      totalOtherSales += amt;
    }
  });

  return {
    billsCount: bills.length,
    totalSales,
    totalCashSales,
    totalUpiSales,
    totalCardSales,
    totalOtherSales,
  };
};

/**
 * GET /api/cash-register/current
 * Get current open register session with live sales stats
 */
router.get('/current', protect, async (req, res) => {
  try {
    const branchId = req.user.activeBranch?._id || req.user.branch?._id || req.user.branch || null;
    
    // Find latest open session for this branch or user
    const query = { status: 'open' };
    if (branchId) {
      query.branch = branchId;
    }

    const session = await RegisterSession.findOne(query).sort({ openedAt: -1 });

    if (!session) {
      return res.json({ isOpen: false, session: null });
    }

    // Calculate live sales from openedAt till now
    const now = new Date();
    const sales = await computeSalesBreakdown(session.openedAt, now, session.branch);

    let cashIn = 0;
    let cashOut = 0;
    (session.cashMovements || []).forEach(m => {
      if (m.type === 'in') cashIn += Number(m.amount) || 0;
      if (m.type === 'out') cashOut += Number(m.amount) || 0;
    });

    const expectedCash = (Number(session.openingTotal) || 0) + sales.totalCashSales + cashIn - cashOut;

    res.json({
      isOpen: true,
      session,
      liveStats: {
        ...sales,
        cashIn,
        cashOut,
        expectedCash,
        openingTotal: session.openingTotal,
      }
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/**
 * POST /api/cash-register/open
 * Open a new shift/register with opening denominations
 */
router.post('/open', protect, async (req, res) => {
  try {
    const branchId = req.user.activeBranch?._id || req.user.branch?._id || req.user.branch || null;
    
    // Check if there is already an open session
    const existing = await RegisterSession.findOne({ status: 'open', branch: branchId });
    if (existing) {
      return res.status(400).json({ 
        message: 'A register session is already open. Please close the active session before opening a new one.',
        sessionId: existing._id 
      });
    }

    const { denominations, note } = req.body;
    const { list, total } = parseDenominations(denominations);

    const newSession = new RegisterSession({
      branch: branchId,
      openedBy: req.user._id,
      openedByName: req.user.name || 'User',
      openedAt: new Date(),
      status: 'open',
      openingDenominations: list,
      openingTotal: total,
      openingNote: note || '',
      cashMovements: [],
    });

    await newSession.save();
    res.status(201).json({ message: 'Cash register opened successfully', session: newSession });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/**
 * POST /api/cash-register/cash-movement
 * Add Pay In / Pay Out entry to active register
 */
router.post('/cash-movement', protect, async (req, res) => {
  try {
    const { type, amount, reason } = req.body;
    if (!['in', 'out'].includes(type)) {
      return res.status(400).json({ message: 'Type must be "in" or "out"' });
    }
    const numAmt = Math.abs(Number(amount));
    if (!numAmt) {
      return res.status(400).json({ message: 'Valid amount is required' });
    }

    const branchId = req.user.activeBranch?._id || req.user.branch?._id || req.user.branch || null;
    const session = await RegisterSession.findOne({ status: 'open', branch: branchId }).sort({ openedAt: -1 });

    if (!session) {
      return res.status(400).json({ message: 'No open register session found' });
    }

    session.cashMovements.push({
      type,
      amount: numAmt,
      reason: reason || (type === 'in' ? 'Cash In' : 'Cash Expense / Drop'),
      time: new Date(),
      user: req.user.name || 'User',
    });

    await session.save();
    res.json({ message: `Cash ${type === 'in' ? 'added' : 'removed'} successfully`, session });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/**
 * POST /api/cash-register/close
 * Close active register session with closing denominations & compute reconciliation
 */
router.post('/close', protect, async (req, res) => {
  try {
    const branchId = req.user.activeBranch?._id || req.user.branch?._id || req.user.branch || null;
    const session = await RegisterSession.findOne({ status: 'open', branch: branchId }).sort({ openedAt: -1 });

    if (!session) {
      return res.status(400).json({ message: 'No open register session found to close' });
    }

    const { denominations, note } = req.body;
    const { list, total: closingTotal } = parseDenominations(denominations);
    const closedAt = new Date();

    // Compute sales from openedAt to closedAt
    const sales = await computeSalesBreakdown(session.openedAt, closedAt, session.branch);

    let cashIn = 0;
    let cashOut = 0;
    (session.cashMovements || []).forEach(m => {
      if (m.type === 'in') cashIn += Number(m.amount) || 0;
      if (m.type === 'out') cashOut += Number(m.amount) || 0;
    });

    const expectedCash = (Number(session.openingTotal) || 0) + sales.totalCashSales + cashIn - cashOut;
    const cashDifference = closingTotal - expectedCash;

    session.status = 'closed';
    session.closedBy = req.user._id;
    session.closedByName = req.user.name || 'User';
    session.closedAt = closedAt;
    session.closingDenominations = list;
    session.closingTotal = closingTotal;
    session.closingNote = note || '';

    session.totalCashSales = sales.totalCashSales;
    session.totalUpiSales = sales.totalUpiSales;
    session.totalCardSales = sales.totalCardSales;
    session.totalOtherSales = sales.totalOtherSales;
    session.totalSales = sales.totalSales;
    session.billsCount = sales.billsCount;

    session.expectedCash = expectedCash;
    session.cashDifference = cashDifference;

    await session.save();

    res.json({
      message: 'Cash register closed and reconciled successfully',
      session,
      summary: {
        openingTotal: session.openingTotal,
        closingTotal,
        expectedCash,
        cashDifference,
        ...sales,
        cashIn,
        cashOut,
      }
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/**
 * GET /api/cash-register/history
 * Get past shift register sessions
 */
router.get('/history', protect, async (req, res) => {
  try {
    const { from, to, status } = req.query;
    const query = {};

    if (status && status !== 'all') {
      query.status = status;
    }

    if (from && to) {
      query.openedAt = {
        $gte: new Date(new Date(from).setHours(0, 0, 0, 0)),
        $lte: new Date(new Date(to).setHours(23, 59, 59, 999)),
      };
    }

    const branchId = req.user.activeBranch?._id || req.user.branch?._id || req.user.branch || null;
    if (branchId && !['root', 'admin'].includes(req.user.role)) {
      query.branch = branchId;
    }

    const sessions = await RegisterSession.find(query)
      .sort({ openedAt: -1 })
      .limit(100)
      .populate('openedBy', 'name role')
      .populate('closedBy', 'name role');

    res.json(sessions);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/**
 * GET /api/cash-register/:id
 * Get details of a single session
 */
router.get('/:id', protect, async (req, res) => {
  try {
    const session = await RegisterSession.findById(req.params.id)
      .populate('openedBy', 'name role')
      .populate('closedBy', 'name role');

    if (!session) {
      return res.status(404).json({ message: 'Register session not found' });
    }

    res.json(session);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
