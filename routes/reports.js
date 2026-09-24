const express  = require('express');
const router   = express.Router();
const mongoose = require('mongoose');
const Bill     = require('../models/Bill');
const { protect, authorize, getBranchFilter } = require('../middleware/auth');

const getRange = (from, to) => ({
  $gte: new Date(new Date(from).setHours(0,0,0,0)),
  $lte: new Date(new Date(to).setHours(23,59,59,999)),
});

// Only root, admin, branch_admin, sales can access reports
const REPORT_ROLES = ['root', 'admin', 'branch_admin', 'sales'];

/**
 * Build the branch filter for reports.
 * - Root/Admin can pass ?branch=<id> to filter a specific branch, or 'all' for everything.
 * - Other roles are locked to their own branch via getBranchFilter().
 */
const getReportBranchFilter = (req) => {
  const base = getBranchFilter(req.user);
  // If user is root/admin and passes a specific branch, honour it
  if (['root', 'admin'].includes(req.user.role) && req.query.branch && req.query.branch !== 'all') {
    try {
      return { branch: new mongoose.Types.ObjectId(req.query.branch) };
    } catch {
      // Fallback: use string (works with find, may not with aggregate)
      return { branch: req.query.branch };
    }
  }
  return base;
};

// ── Report endpoints ──────────────────────────────────────────
router.get('/bill-wise', protect, authorize(...REPORT_ROLES), async (req, res) => {
  try {
    const { from, to } = req.query;
    const branchFilter = getReportBranchFilter(req);
    res.json(await Bill.find({ ...branchFilter, status:{ $in:['billed','edited','cancelled'] }, date:getRange(from,to) }).sort({ seqNo:-1 }).lean());
  } catch (e) { res.status(500).json({ message:e.message }); }
});

router.get('/item-wise', protect, authorize(...REPORT_ROLES), async (req, res) => {
  try {
    const { from, to } = req.query;
    const branchFilter = getReportBranchFilter(req);
    const r = await Bill.aggregate([
      { $match:{ ...branchFilter, status:{ $in:['billed','edited'] }, date:getRange(from,to) } },
      { $unwind:'$items' },
      { $group:{ _id:'$items.productName', qty:{$sum:'$items.qty'}, amount:{$sum:'$items.amount'}, rate:{$first:'$items.rate'} } },
      { $sort:{ amount:-1 } },
    ]);
    res.json(r.map(x=>({ name:x._id, qty:x.qty, rate:x.rate, amount:x.amount })));
  } catch (e) { res.status(500).json({ message:e.message }); }
});

router.get('/salesman-wise', protect, authorize(...REPORT_ROLES), async (req, res) => {
  try {
    const { from, to } = req.query;
    const branchFilter = getReportBranchFilter(req);
    const r = await Bill.aggregate([
      { $match:{ ...branchFilter, status:{ $in:['billed','edited'] }, date:getRange(from,to) } },
      { $group:{ _id:'$waiter', bills:{$sum:1}, amount:{$sum:'$netAmount'} } },
      { $sort:{ amount:-1 } },
    ]);
    res.json(r.map(x=>({ name:x._id||'Unknown', bills:x.bills, amount:x.amount })));
  } catch (e) { res.status(500).json({ message:e.message }); }
});

router.get('/group-wise', protect, authorize(...REPORT_ROLES), async (req, res) => {
  try {
    const { from, to } = req.query;
    const branchFilter = getReportBranchFilter(req);
    const r = await Bill.aggregate([
      { $match:{ ...branchFilter, status:{ $in:['billed','edited'] }, date:getRange(from,to) } },
      { $unwind:'$items' },
      { $group:{ _id:'$items.group', qty:{$sum:'$items.qty'}, amount:{$sum:'$items.amount'} } },
      { $sort:{ amount:-1 } },
    ]);
    res.json(r.map(x=>({ group:x._id||'Other', qty:x.qty, amount:x.amount })));
  } catch (e) { res.status(500).json({ message:e.message }); }
});

router.get('/time-wise', protect, authorize(...REPORT_ROLES), async (req, res) => {
  try {
    const { from, to } = req.query;
    const branchFilter = getReportBranchFilter(req);
    const r = await Bill.aggregate([
      { $match:{ ...branchFilter, status:{ $in:['billed','edited'] }, date:getRange(from,to) } },
      { $group:{ _id:{ $hour:'$date' }, bills:{$sum:1}, amount:{$sum:'$netAmount'} } },
      { $sort:{ _id:1 } },
    ]);
    res.json(r.map(x=>({ time:`${String(x._id).padStart(2,'0')}:00`, bills:x.bills, amount:x.amount })));
  } catch (e) { res.status(500).json({ message:e.message }); }
});

router.get('/cashier-wise', protect, authorize(...REPORT_ROLES), async (req, res) => {
  try {
    const { from, to } = req.query;
    const branchFilter = getReportBranchFilter(req);
    const r = await Bill.aggregate([
      { $match:{ ...branchFilter, status:{ $in:['billed','edited'] }, date:getRange(from,to) } },
      { $group:{ _id:'$cashier', bills:{$sum:1}, amount:{$sum:'$netAmount'} } },
      { $sort:{ amount:-1 } },
    ]);
    res.json(r.map(x=>({ cashier:x._id||'Unknown', bills:x.bills, amount:x.amount })));
  } catch (e) { res.status(500).json({ message:e.message }); }
});

router.get('/tax-report', protect, authorize(...REPORT_ROLES), async (req, res) => {
  try {
    const { from, to } = req.query;
    const branchFilter = getReportBranchFilter(req);
    const r = await Bill.aggregate([
      { $match:{ ...branchFilter, status:{ $in:['billed','edited'] }, date:getRange(from,to) } },
      { $group:{ _id:null, subtotal:{$sum:'$subtotal'}, cgst:{$sum:'$cgstTotal'}, sgst:{$sum:'$sgstTotal'}, net:{$sum:'$netAmount'}, discount:{$sum:'$discount'}, bills:{$sum:1} } },
    ]);
    res.json(r[0] || { subtotal:0, cgst:0, sgst:0, net:0, discount:0, bills:0 });
  } catch (e) { res.status(500).json({ message:e.message }); }
});


// ── Department Wise Report ──────────────────────────────────
router.get('/department-wise', protect, authorize(...REPORT_ROLES), async (req, res) => {
  try {
    const { from, to } = req.query;
    const branchFilter = getReportBranchFilter(req);
    const r = await Bill.aggregate([
      { $match:{ ...branchFilter, status:{ $in:['billed','edited'] }, date:getRange(from,to) } },
      { $unwind:'$items' },
      { $group:{ _id:'$items.department', qty:{$sum:'$items.qty'}, amount:{$sum:'$items.amount'}, items:{$sum:1} } },
      { $sort:{ amount:-1 } },
    ]);
    res.json(r.map(x=>({ department:x._id||'Unassigned', qty:x.qty, items:x.items, amount:x.amount })));
  } catch (e) { res.status(500).json({ message:e.message }); }
});

// ── Dashboard ──────────────────────────────────────────────
router.get('/dashboard', protect, authorize('root', 'admin', 'branch_admin'), async (req, res) => {
  try {
    const branchFilter = getBranchFilter(req.user);
    const now   = new Date();
    const tS    = new Date(now); tS.setHours(0,0,0,0);
    const tE    = new Date(now); tE.setHours(23,59,59,999);
    const w7    = new Date(tS); w7.setDate(w7.getDate() - 6);

    const baseTodayMatch = { ...branchFilter, status:{ $in:['billed','edited'] }, date:{ $gte:tS, $lte:tE } };
    const baseWeekMatch  = { ...branchFilter, status:{ $in:['billed','edited'] }, date:{ $gte:w7, $lte:tE } };

    const [todaySales, runningBills, totalBillsAll, chart, paymentBreakdown, onlineSales, discountData, cancelledData, editedData, duplicatedData, prebookData] = await Promise.all([
      Bill.aggregate([
        { $match: baseTodayMatch },
        { $group:{ _id:null,
          total:{$sum:'$netAmount'}, count:{$sum:1},
          subtotal:{$sum:'$subtotal'}, cgst:{$sum:'$cgstTotal'}, sgst:{$sum:'$sgstTotal'},
          discount:{$sum:'$discount'},
          cash:{$sum:{ $cond:[{ $eq:['$paymentMode','Cash'] },'$netAmount',0] }},
          upi: {$sum:{ $cond:[{ $eq:['$paymentMode','UPI'] }, '$netAmount',0] }},
          card:{$sum:{ $cond:[{ $eq:['$paymentMode','Card'] },'$netAmount',0] }},
        }}
      ]),
      Bill.countDocuments({ ...branchFilter, status:'kot_saved' }),
      Bill.countDocuments({ ...branchFilter, status:{ $in:['billed','edited'] } }),
      Bill.aggregate([
        { $match: baseWeekMatch },
        { $group:{ _id:{ $dateToString:{ format:'%Y-%m-%d', date:'$date' } }, sales:{$sum:'$netAmount'}, count:{$sum:1} } },
        { $sort:{ _id:1 } }
      ]),
      Bill.aggregate([
        { $match: baseTodayMatch },
        { $group:{ _id:'$paymentMode', amount:{$sum:'$netAmount'}, count:{$sum:1} } }
      ]),
      Bill.aggregate([
        { $match:{ ...branchFilter, status:{ $in:['billed','edited'] }, billType:'online', date:{ $gte:tS, $lte:tE } } },
        { $group:{ _id:'$onlinePlatform', amount:{$sum:'$netAmount'}, count:{$sum:1} } }
      ]),
      Bill.aggregate([
        { $match:{ ...branchFilter, status:{ $in:['billed','edited'] }, $or: [{discount:{ $gt:0 }}, {reduction:{ $gt:0 }}], date:{ $gte:tS, $lte:tE } } },
        { $group:{ _id:null, dSum:{$sum:'$discount'}, rSum:{$sum:'$reduction'}, count:{$sum:1} } }
      ]),
      Bill.aggregate([
        { $match:{ ...branchFilter, status:'cancelled', date:{ $gte:tS, $lte:tE } } },
        { $group:{ _id:null, count:{$sum:1} } }
      ]),
      Bill.aggregate([
        { $match:{ ...branchFilter, isEdited:true, date:{ $gte:tS, $lte:tE } } },
        { $group:{ _id:null, count:{$sum:1} } }
      ]),
      Bill.aggregate([
        { $match:{ ...branchFilter, printCount:{ $gt: 1 }, date:{ $gte:tS, $lte:tE } } },
        { $group:{ _id:null, count:{$sum:1} } }
      ]),
      Bill.aggregate([
        { $match:{ ...branchFilter, billType:'prebooking', date:{ $gte:tS, $lte:tE } } },
        { $group:{ _id:null, count:{$sum:1} } }
      ]),
    ]);

    const ts = todaySales[0] || { total:0,count:0,subtotal:0,cgst:0,sgst:0,discount:0,cash:0,upi:0,card:0 };
    const paymentSplit = [
      { _id:'Cash', amount:ts.cash,  icon:'💵' },
      { _id:'UPI',  amount:ts.upi,   icon:'📱' },
      { _id:'Card', amount:ts.card,  icon:'💳' },
    ];

    res.json({
      todaySales:    ts,
      runningBills,
      totalBillsAll,
      chart,
      paymentBreakdown: paymentSplit,
      onlineSales,
      discountToday:   discountData[0]  || { totalDiscount:0, count:0 },
      cancelledToday:  cancelledData[0] || { count:0 },
      editedToday:     editedData[0]    || { count:0 },
      duplicatedToday: duplicatedData[0] || { count:0 },
      prebookToday:    prebookData[0]   || { count:0 },
    });
  } catch (e) { res.status(500).json({ message:e.message }); }
});

module.exports = router;
