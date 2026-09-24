const express = require('express');
const router  = express.Router();
const Bill    = require('../models/Bill');
const Inventory = require('../models/Inventory');
const StockTransaction = require('../models/StockTransaction');
const { protect, getBranchFilter } = require('../middleware/auth');

// ── Stock deduction & return helpers ─────────────────────────
async function deductStockForBill(bill, userName) {
  try {
    if (!bill.items || !bill.items.length) return;
    for (const item of bill.items) {
      if (!item.productCode && !item.productName) continue;
      const inv = await Inventory.findOne({
        isActive: true,
        $and: [
          {
            $or: [
              ...(item.productCode ? [{ itemCode: item.productCode.toUpperCase() }] : []),
              { itemName: { $regex: `^${item.productName}$`, $options: 'i' } },
            ],
          },
          {
            $or: [
              { branch: bill.branch },
              { branch: null },
            ],
          },
        ],
      });

      if (inv && inv.autoDeductOnBill !== false) {
        const prevStock = inv.currentStock || 0;
        const qty = item.qty || 1;
        const newStock = Math.max(0, prevStock - qty);
        inv.currentStock = newStock;
        await inv.save();

        await StockTransaction.create({
          type: 'SALE_OUT',
          inventoryItem: inv._id,
          itemCode: inv.itemCode,
          itemName: inv.itemName,
          qty: qty,
          unit: inv.unit || 'PCS',
          unitCost: inv.costPrice || 0,
          totalCost: qty * (inv.costPrice || 0),
          previousStock: prevStock,
          newStock: newStock,
          billRef: bill._id,
          billNo: bill.billNo,
          reason: `POS Sale on Bill #${bill.billNo}`,
          branch: bill.branch,
          performedBy: userName || 'POS Cashier',
        });
      }
    }
  } catch (err) {
    console.error('Error in deductStockForBill:', err.message);
  }
}

async function restoreStockForBill(bill, userName) {
  try {
    if (!bill.items || !bill.items.length) return;
    for (const item of bill.items) {
      if (!item.productCode && !item.productName) continue;
      const inv = await Inventory.findOne({
        isActive: true,
        $and: [
          {
            $or: [
              ...(item.productCode ? [{ itemCode: item.productCode.toUpperCase() }] : []),
              { itemName: { $regex: `^${item.productName}$`, $options: 'i' } },
            ],
          },
          {
            $or: [
              { branch: bill.branch },
              { branch: null },
            ],
          },
        ],
      });

      if (inv && inv.autoDeductOnBill !== false) {
        const prevStock = inv.currentStock || 0;
        const qty = item.qty || 1;
        const newStock = prevStock + qty;
        inv.currentStock = newStock;
        await inv.save();

        await StockTransaction.create({
          type: 'RETURN_IN',
          inventoryItem: inv._id,
          itemCode: inv.itemCode,
          itemName: inv.itemName,
          qty: qty,
          unit: inv.unit || 'PCS',
          unitCost: inv.costPrice || 0,
          totalCost: qty * (inv.costPrice || 0),
          previousStock: prevStock,
          newStock: newStock,
          billRef: bill._id,
          billNo: bill.billNo,
          reason: `Restocked from Cancelled Bill #${bill.billNo}`,
          branch: bill.branch,
          performedBy: userName || 'System',
        });
      }
    }
  } catch (err) {
    console.error('Error in restoreStockForBill:', err.message);
  }
}

// GET /api/bills
router.get('/', protect, async (req, res) => {
  try {
    const q = { ...getBranchFilter(req.user) };
    if (req.query.status)   q.status   = req.query.status;
    if (req.query.billType) q.billType = req.query.billType;
    if (req.query.date) {
      const d = new Date(req.query.date);
      q.date = { $gte: new Date(d.setHours(0,0,0,0)), $lte: new Date(d.setHours(23,59,59,999)) };
    }
    if (req.query.today === 'true') {
      const s = new Date(); s.setHours(0,0,0,0);
      const e = new Date(); e.setHours(23,59,59,999);
      q.date = { $gte: s, $lte: e };
    }
    if (req.query.isDuplicated === 'true') {
      q.printCount = { $gt: 1 };
    }
    if (req.query.hasDiscount === 'true') {
      q.$or = [{ discount: { $gt: 0 } }, { reduction: { $gt: 0 } }];
    }
    res.json(await Bill.find(q).sort({ seqNo:-1 }).limit(200).lean());
  } catch (e) { res.status(500).json({ message: e.message }); }
});


// GET /api/bills/today — today's bills with optional filters
router.get('/today', protect, async (req, res) => {
  try {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const end   = new Date(); end.setHours(23, 59, 59, 999);
    const q = { ...getBranchFilter(req.user), date: { $gte: start, $lte: end } };
    if (req.query.status      && req.query.status      !== 'all') q.status      = req.query.status;
    if (req.query.billType    && req.query.billType    !== 'all') q.billType    = req.query.billType;
    if (req.query.paymentMode && req.query.paymentMode !== 'all') q.paymentMode = req.query.paymentMode;
    if (req.query.salesMode   && req.query.salesMode   !== 'all') q.salesMode   = req.query.salesMode;
    res.json(await Bill.find(q).sort({ seqNo: -1 }).limit(500).lean());
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// GET /api/bills/sales-modes — distinct sales modes from bills in branch
router.get('/sales-modes', protect, async (req, res) => {
  try {
    const branchFilter = getBranchFilter(req.user);
    const modes = await Bill.distinct('salesMode', branchFilter);
    res.json(modes.filter(Boolean).sort());
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// GET /api/bills/:id

router.get('/:id', protect, async (req, res) => {
  try {
    const b = await Bill.findById(req.params.id);
    if (!b) return res.status(404).json({ message: 'Not found' });

    // Branch-level access check: non-root/admin can only view their branch bills
    const branchFilter = getBranchFilter(req.user);
    if (branchFilter.branch && b.branch && b.branch.toString() !== branchFilter.branch.toString()) {
      return res.status(403).json({ message: 'Access denied: bill belongs to another branch' });
    }

    res.json(b);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// POST /api/bills — create
router.post('/', protect, async (req, res) => {
  try {
    // Auto-attach branch from user's active session
    const userBranch = req.user.activeBranch?._id || req.user.activeBranch || req.user.branch?._id || req.user.branch || null;
    const data = { ...req.body, createdBy: req.user._id, cashier: req.user.name, branch: userBranch };

    if (!data.netAmount || data.netAmount === 0) {
      const sub   = data.subtotal || 0;
      const gst   = (data.cgstTotal||0) + (data.sgstTotal||0);
      const extra = data.extraCharges || 0;
      const disc  = (data.discount||0) + (data.reduction||0);
      const gross = sub + gst + extra - disc;
      data.netAmount = Math.round(gross + (Math.round(gross) - gross));
    }
    const bill = await Bill.create(data);

    // If bill status is billed, deduct stock for matching inventory items
    if (bill.status === 'billed') {
      await deductStockForBill(bill, req.user.name);
    }

    res.status(201).json(bill);
  } catch (e) { res.status(400).json({ message: e.message }); }
});

// PUT /api/bills/:id/duplicate — mark duplicated
router.put('/:id/duplicate', protect, async (req, res) => {
  try {
    const bill = await Bill.findByIdAndUpdate(req.params.id, { $inc: { printCount: 1 } }, { new: true });
    res.json(bill);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// PUT /api/bills/:id/cancel — cancel bill with reason
router.put('/:id/cancel', protect, async (req, res) => {
  try {
    const allowedRoles = ['root', 'admin', 'branch_admin'];
    if (!allowedRoles.includes(req.user.role) && !req.user.permissions?.allowBillCancel) {
      return res.status(403).json({ message: 'You do not have permission to cancel bills' });
    }

    const existing = await Bill.findById(req.params.id);
    if (!existing) return res.status(404).json({ message: 'Not found' });

    const branchFilter = getBranchFilter(req.user);
    if (branchFilter.branch && existing.branch && existing.branch.toString() !== branchFilter.branch.toString()) {
      return res.status(403).json({ message: 'Access denied: bill belongs to another branch' });
    }

    const wasBilled = existing.status === 'billed' || existing.status === 'edited';
    const bill = await Bill.findByIdAndUpdate(
      req.params.id,
      { status: 'cancelled', cancelReason: req.body?.reason || 'Cancelled' },
      { new: true }
    );

    if (wasBilled) {
      await restoreStockForBill(existing, req.user.name);
    }

    res.json(bill);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// PUT /api/bills/:id — update (edit with history)
router.put('/:id', protect, async (req, res) => {
  try {
    const existing = await Bill.findById(req.params.id);
    if (!existing) return res.status(404).json({ message: 'Not found' });

    // Branch access check
    const branchFilter = getBranchFilter(req.user);
    if (branchFilter.branch && existing.branch && existing.branch.toString() !== branchFilter.branch.toString()) {
      return res.status(403).json({ message: 'Access denied: bill belongs to another branch' });
    }

    const data = { ...req.body };

    // Recompute netAmount
    const sub   = data.subtotal || existing.subtotal || 0;
    const gst   = (data.cgstTotal||existing.cgstTotal||0) + (data.sgstTotal||existing.sgstTotal||0);
    const extra = data.extraCharges || existing.extraCharges || 0;
    const disc  = (data.discount||existing.discount||0) + (data.reduction||existing.reduction||0);
    const gross = sub + gst + extra - disc;
    data.netAmount = Math.round(gross + (Math.round(gross) - gross));

    // If changing from draft to billed, deduct stock
    if (existing.status !== 'billed' && data.status === 'billed') {
      const updatedMock = { ...existing.toObject(), ...data };
      await deductStockForBill(updatedMock, req.user.name);
    }

    // If changing to cancelled, restore stock
    if (existing.status === 'billed' && data.status === 'cancelled') {
      await restoreStockForBill(existing, req.user.name);
    }

    // If editing a billed bill, save edit history
    if (existing.status === 'billed' && data.status !== 'cancelled') {
      data.isEdited = true;
      const historyEntry = {
        editedAt:     new Date(),
        editedBy:     req.user.name,
        reason:       data.editReason || '',
        prevItems:    existing.items,
        prevSubtotal: existing.subtotal,
        prevNetAmount:existing.netAmount,
        prevDiscount: existing.discount,
      };
      data.editHistory = [...(existing.editHistory || []), historyEntry];
      if (data.status !== 'cancelled') data.status = 'edited';
    }

    const bill = await Bill.findByIdAndUpdate(req.params.id, data, { new: true });
    res.json(bill);
  } catch (e) { res.status(400).json({ message: e.message }); }
});

// DELETE /api/bills/:id — cancel
router.delete('/:id', protect, async (req, res) => {
  try {
    // Only root, admin, branch_admin can cancel bills; others need permission
    const allowedRoles = ['root', 'admin', 'branch_admin'];
    if (!allowedRoles.includes(req.user.role)) {
      if (!req.user.permissions?.allowBillCancel) {
        return res.status(403).json({ message: 'You do not have permission to cancel bills' });
      }
    }

    const existing = await Bill.findById(req.params.id);
    if (!existing) return res.status(404).json({ message: 'Not found' });

    // Branch access check
    const branchFilter = getBranchFilter(req.user);
    if (branchFilter.branch && existing.branch && existing.branch.toString() !== branchFilter.branch.toString()) {
      return res.status(403).json({ message: 'Access denied: bill belongs to another branch' });
    }

    const wasBilled = existing.status === 'billed' || existing.status === 'edited';
    const bill = await Bill.findByIdAndUpdate(req.params.id,
      { status:'cancelled', cancelReason: req.body?.reason || 'Cancelled' },
      { new: true });

    if (wasBilled) {
      await restoreStockForBill(existing, req.user.name);
    }

    res.json(bill);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

module.exports = router;
