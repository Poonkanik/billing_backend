const express = require('express');
const router = express.Router();
const Company = require('../models/Company');
const Branch = require('../models/Branch');
const Group = require('../models/Group');
const Department = require('../models/Department');

const Product = require('../models/Product');
const { Table, Customer } = require('../models/TableCustomer');
const { protect, authorize } = require('../middleware/auth');

const { Waiter, Captain, RateInfo, SalesMode } = require('../models/StaffModes');

// Management roles that can modify master data
const MGMT_ROLES = ['root', 'admin', 'branch_admin'];

// ── Generic CRUD helper ──────────────────────────────────────
function crud(path, Model) {
  router.get(`/${path}`, protect, async (req, res) => {
    try { res.json(await Model.find({ isActive: true }).sort({ code: 1 }).lean()); }
    catch (e) { res.status(500).json({ message: e.message }); }
  });
  router.post(`/${path}`, protect, authorize(...MGMT_ROLES), async (req, res) => {
    try { res.status(201).json(await Model.create(req.body)); }
    catch (e) { res.status(400).json({ message: e.message }); }
  });
  router.put(`/${path}/:id`, protect, authorize(...MGMT_ROLES), async (req, res) => {
    try {
      const doc = await Model.findByIdAndUpdate(req.params.id, req.body, { new: true });
      if (!doc) return res.status(404).json({ message: 'Not found' });
      res.json(doc);
    } catch (e) { res.status(400).json({ message: e.message }); }
  });
  router.delete(`/${path}/:id`, protect, authorize(...MGMT_ROLES), async (req, res) => {
    try {
      await Model.findByIdAndUpdate(req.params.id, { isActive: false });
      res.json({ message: 'Deleted' });
    } catch (e) { res.status(500).json({ message: e.message }); }
  });
}

// ===== COMPANY =====
router.get('/company', protect, async (req, res) => {
  try { res.json(await Company.findOne() || {}); }
  catch (e) { res.status(500).json({ message: e.message }); }
});
router.put('/company', protect, authorize('root', 'admin'), async (req, res) => {
  try {
    const c = await Company.findOneAndUpdate({}, req.body, { new: true, upsert: true });
    res.json(c);
  } catch (e) { res.status(400).json({ message: e.message }); }
});

// ===== GROUPS =====
router.get('/groups', protect, async (req, res) => {
  try { res.json(await Group.find({ isActive: true }).sort({ code: 1 }).lean()); }
  catch (e) { res.status(500).json({ message: e.message }); }
});
router.post('/groups', protect, authorize(...MGMT_ROLES), async (req, res) => {
  try { res.status(201).json(await Group.create(req.body)); }
  catch (e) { res.status(400).json({ message: e.message }); }
});
router.put('/groups/:id', protect, authorize(...MGMT_ROLES), async (req, res) => {
  try {
    const g = await Group.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!g) return res.status(404).json({ message: 'Not found' });
    res.json(g);
  } catch (e) { res.status(400).json({ message: e.message }); }
});
router.delete('/groups/:id', protect, authorize(...MGMT_ROLES), async (req, res) => {
  try { await Group.findByIdAndUpdate(req.params.id, { isActive: false }); res.json({ message: 'Deleted' }); }
  catch (e) { res.status(500).json({ message: e.message }); }
});

// ===== DEPARTMENTS =====
router.get('/departments', protect, async (req, res) => {
  try { res.json(await Department.find({ isActive: true }).sort({ code: 1 }).lean()); }
  catch (e) { res.status(500).json({ message: e.message }); }
});
router.post('/departments', protect, authorize(...MGMT_ROLES), async (req, res) => {
  try { res.status(201).json(await Department.create(req.body)); }
  catch (e) { res.status(400).json({ message: e.message }); }
});
router.put('/departments/:id', protect, authorize(...MGMT_ROLES), async (req, res) => {
  try {
    const d = await Department.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!d) return res.status(404).json({ message: 'Not found' });
    res.json(d);
  } catch (e) { res.status(400).json({ message: e.message }); }
});
router.delete('/departments/:id', protect, authorize(...MGMT_ROLES), async (req, res) => {
  try { await Department.findByIdAndUpdate(req.params.id, { isActive: false }); res.json({ message: 'Deleted' }); }
  catch (e) { res.status(500).json({ message: e.message }); }
});
// Department product count summary (must be before :id routes)
router.get('/departments/product-counts', protect, async (req, res) => {
  try {
    const counts = await Product.aggregate([
      { $match: { 'flags.active': true, department: { $ne: null } } },
      { $group: { _id: '$department', count: { $sum: 1 } } },
    ]);
    res.json(counts);
  } catch (e) { res.status(500).json({ message: e.message }); }
});
// Products by department
router.get('/departments/:id/products', protect, async (req, res) => {
  try {
    const products = await Product.find({ department: req.params.id, 'flags.active': true })
      .select('code name rate cgst sgst unitName rates branchRates groupName departmentName flags')
      .sort({ name: 1 })
      .lean();
    res.json(products);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// ===== PRODUCTS =====
router.get('/products', protect, async (req, res) => {
  try {
    const q = { 'flags.active': true };
    if (req.query.group) q.groupName = req.query.group;
    if (req.query.department) q.department = req.query.department;
    if (req.query.search) q.name = { $regex: req.query.search, $options: 'i' };
    res.json(await Product.find(q)
      .select('code name rate cgst sgst unitName rates branchRates groupName departmentName flags department localNames')
      .populate('department', 'name code')
      .populate('rates.salesMode', 'name type')
      .sort({ name: 1 })
      .lean());
  } catch (e) { res.status(500).json({ message: e.message }); }
});
router.post('/products', protect, authorize(...MGMT_ROLES), async (req, res) => {
  try { res.status(201).json(await Product.create(req.body)); }
  catch (e) { res.status(400).json({ message: e.message }); }
});
router.put('/products/rates', protect, authorize(...MGMT_ROLES), async (req, res) => {
  try {
    const updates = req.body; // [{ _id, rates: [{ salesMode, rate }] }]
    for (const update of updates) {
      await Product.findByIdAndUpdate(update._id, { rates: update.rates });
    }
    res.json({ message: 'Rates updated' });
  } catch (e) { res.status(400).json({ message: e.message }); }
});

// ── Branch-specific pricing ──
// GET /api/master/products/branch-rates?branchId=xxx — get all products with branch rate overrides
router.get('/products/branch-rates', protect, async (req, res) => {
  try {
    const products = await Product.find({ 'flags.active': true })
      .select('name code rate branchRates rates')
      .populate('rates.salesMode', 'name')
      .populate('branchRates.branch', 'name code')
      .sort({ name: 1 })
      .lean();
    res.json(products);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// PUT /api/master/products/branch-rates — bulk update branch-specific rates
// Body: { branchId, products: [{ _id, rate, salesModeRates: [{ salesMode, rate }] }] }
router.put('/products/branch-rates', protect, authorize(...MGMT_ROLES), async (req, res) => {
  try {
    const { branchId, products: updates } = req.body;
    if (!branchId) return res.status(400).json({ message: 'branchId is required' });

    for (const upd of updates) {
      const product = await Product.findById(upd._id);
      if (!product) continue;

      let branchRates = product.branchRates || [];
      const existingIdx = branchRates.findIndex(
        br => (br.branch?._id || br.branch)?.toString() === branchId.toString()
      );

      const branchEntry = {
        branch: branchId,
        rate: parseFloat(upd.rate) || 0,
        salesModeRates: (upd.salesModeRates || []).map(smr => ({
          salesMode: smr.salesMode,
          rate: parseFloat(smr.rate) || 0
        }))
      };

      // Check if all rates are 0 — if so, remove the override (use common pricing)
      const hasAnyRate = branchEntry.rate > 0 ||
        branchEntry.salesModeRates.some(smr => smr.rate > 0);

      if (existingIdx >= 0) {
        if (hasAnyRate) {
          branchRates[existingIdx] = branchEntry;
        } else {
          // Remove override — fall back to common pricing
          branchRates.splice(existingIdx, 1);
        }
      } else if (hasAnyRate) {
        branchRates.push(branchEntry);
      }

      await Product.findByIdAndUpdate(upd._id, { branchRates });
    }

    res.json({ message: 'Branch rates updated successfully' });
  } catch (e) { res.status(400).json({ message: e.message }); }
});
router.put('/products/:id', protect, authorize(...MGMT_ROLES), async (req, res) => {
  try {
    const p = await Product.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!p) return res.status(404).json({ message: 'Not found' });
    res.json(p);
  } catch (e) { res.status(400).json({ message: e.message }); }
});
router.delete('/products/:id', protect, authorize(...MGMT_ROLES), async (req, res) => {
  try { await Product.findByIdAndUpdate(req.params.id, { 'flags.active': false }); res.json({ message: 'Deleted' }); }
  catch (e) { res.status(500).json({ message: e.message }); }
});

// ===== TABLES =====
router.get('/tables', protect, async (req, res) => {
  try { res.json(await Table.find({ isActive: true }).sort({ code: 1 })); }
  catch (e) { res.status(500).json({ message: e.message }); }
});
router.post('/tables', protect, authorize(...MGMT_ROLES), async (req, res) => {
  try { res.status(201).json(await Table.create(req.body)); }
  catch (e) { res.status(400).json({ message: e.message }); }
});
router.put('/tables/:id', protect, authorize(...MGMT_ROLES), async (req, res) => {
  try { res.json(await Table.findByIdAndUpdate(req.params.id, req.body, { new: true })); }
  catch (e) { res.status(400).json({ message: e.message }); }
});
router.delete('/tables/:id', protect, authorize(...MGMT_ROLES), async (req, res) => {
  try { await Table.findByIdAndUpdate(req.params.id, { isActive: false }); res.json({ message: 'Deleted' }); }
  catch (e) { res.status(500).json({ message: e.message }); }
});

// ===== CUSTOMERS =====
router.get('/customers', protect, async (req, res) => {
  try { res.json(await Customer.find({ isActive: true }).sort({ name: 1 })); }
  catch (e) { res.status(500).json({ message: e.message }); }
});
router.post('/customers', protect, authorize(...MGMT_ROLES), async (req, res) => {
  try { res.status(201).json(await Customer.create(req.body)); }
  catch (e) { res.status(400).json({ message: e.message }); }
});
router.put('/customers/:id', protect, authorize(...MGMT_ROLES), async (req, res) => {
  try { res.json(await Customer.findByIdAndUpdate(req.params.id, req.body, { new: true })); }
  catch (e) { res.status(400).json({ message: e.message }); }
});
router.delete('/customers/:id', protect, authorize(...MGMT_ROLES), async (req, res) => {
  try { await Customer.findByIdAndUpdate(req.params.id, { isActive: false }); res.json({ message: 'Deleted' }); }
  catch (e) { res.status(500).json({ message: e.message }); }
});

// ===== BRANCHES =====
router.get('/branches', protect, async (req, res) => {
  try {
    // Branch admins can only see their own branch
    if (req.user.role === 'branch_admin' && req.user.branch) {
      const branchId = req.user.branch._id || req.user.branch;
      return res.json(await Branch.find({ _id: branchId, isActive: true }).populate('company').sort({ code: 1 }));
    }
    res.json(await Branch.find({ isActive: true }).populate('company').sort({ code: 1 }));
  } catch (e) { res.status(500).json({ message: e.message }); }
});
router.post('/branches', protect, authorize('root', 'admin'), async (req, res) => {
  try {
    const data = { ...req.body };
    // Auto-link to master company if not provided
    if (!data.company) {
      const company = await Company.findOne();
      if (company) data.company = company._id;
    }
    res.status(201).json(await Branch.create(data));
  } catch (e) { res.status(400).json({ message: e.message }); }
});
router.put('/branches/:id', protect, authorize('root', 'admin'), async (req, res) => {
  try {
    const doc = await Branch.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!doc) return res.status(404).json({ message: 'Not found' });
    res.json(doc);
  } catch (e) { res.status(400).json({ message: e.message }); }
});
router.delete('/branches/:id', protect, authorize('root', 'admin'), async (req, res) => {
  try {
    await Branch.findByIdAndUpdate(req.params.id, { isActive: false });
    res.json({ message: 'Deleted' });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// ===== WAITERS / CAPTAINS / RATES / SALES MODES =====
crud('waiters', Waiter);
crud('captains', Captain);
crud('rates', RateInfo);
crud('salesmodes', SalesMode);

module.exports = router;
