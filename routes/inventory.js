const express = require('express');
const router = express.Router();
const Inventory = require('../models/Inventory');
const StockTransaction = require('../models/StockTransaction');
const Supplier = require('../models/Supplier');
const Product = require('../models/Product');
const { protect, authorize, getBranchFilter } = require('../middleware/auth');

const MGMT_ROLES = ['root', 'admin', 'branch_admin'];

// ─────────────────────────────────────────────────────────────
// 1. SUMMARY / METRICS
// ─────────────────────────────────────────────────────────────
router.get('/summary', protect, async (req, res) => {
  try {
    const branchFilter = getBranchFilter(req.user);
    const q = { isActive: true, ...branchFilter };

    // Use aggregation instead of loading all documents into JS memory
    const [summaryResult] = await Inventory.aggregate([
      { $match: q },
      {
        $group: {
          _id: null,
          totalItems: { $sum: 1 },
          totalCostValuation: { $sum: { $multiply: ['$currentStock', '$costPrice'] } },
          totalRetailValuation: { $sum: { $multiply: ['$currentStock', '$sellingPrice'] } },
          outOfStockCount: { $sum: { $cond: [{ $lte: ['$currentStock', 0] }, 1, 0] } },
          lowStockCount: {
            $sum: {
              $cond: [
                { $and: [{ $gt: ['$currentStock', 0] }, { $lte: ['$currentStock', '$minStockAlert'] }] },
                1, 0
              ]
            }
          },
        },
      },
    ]);

    // Today's movements via aggregation
    const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
    const endOfToday   = new Date(); endOfToday.setHours(23, 59, 59, 999);

    const [movementsResult] = await StockTransaction.aggregate([
      { $match: { date: { $gte: startOfToday, $lte: endOfToday }, ...branchFilter } },
      {
        $group: {
          _id: null,
          todayPurchasedValue: { $sum: { $cond: [{ $eq: ['$type', 'PURCHASE_IN'] }, '$totalCost', 0] } },
          todayWastageValue:   { $sum: { $cond: [{ $eq: ['$type', 'WASTAGE_OUT'] }, '$totalCost', 0] } },
          todaySalesUnits:     { $sum: { $cond: [{ $eq: ['$type', 'SALE_OUT'] }, '$qty', 0] } },
        },
      },
    ]);

    const s = summaryResult || { totalItems: 0, totalCostValuation: 0, totalRetailValuation: 0, lowStockCount: 0, outOfStockCount: 0 };
    const m = movementsResult || { todayPurchasedValue: 0, todayWastageValue: 0, todaySalesUnits: 0 };

    res.json({
      totalItems:            s.totalItems,
      totalCostValuation:    Math.round(s.totalCostValuation * 100) / 100,
      totalRetailValuation:  Math.round(s.totalRetailValuation * 100) / 100,
      lowStockCount:         s.lowStockCount,
      outOfStockCount:       s.outOfStockCount,
      todayPurchasedValue:   Math.round(m.todayPurchasedValue * 100) / 100,
      todayWastageValue:     Math.round(m.todayWastageValue * 100) / 100,
      todaySalesUnits:       m.todaySalesUnits,
    });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});


// ─────────────────────────────────────────────────────────────
// 2. GET INVENTORY ITEMS (with filtering)
// ─────────────────────────────────────────────────────────────
router.get('/', protect, async (req, res) => {
  try {
    const branchFilter = getBranchFilter(req.user);
    const q = { isActive: true, ...branchFilter };

    if (req.query.branch && (req.user.role === 'root' || req.user.role === 'admin')) {
      q.branch = req.query.branch === 'all' ? null : req.query.branch;
      if (req.query.branch === 'all') delete q.branch;
    }
    if (req.query.category && req.query.category !== 'all') {
      q.category = req.query.category;
    }
    if (req.query.search) {
      q.$or = [
        { itemName: { $regex: req.query.search, $options: 'i' } },
        { itemCode: { $regex: req.query.search, $options: 'i' } },
      ];
    }

    let items = await Inventory.find(q)
      .populate('supplier', 'name phone')
      .populate('branch', 'name code')
      .populate('product', 'name code rate')
      .sort({ itemName: 1 })
      .lean();

    if (req.query.stockStatus === 'low') {
      items = items.filter(i => i.currentStock > 0 && i.currentStock <= (i.minStockAlert || 5));
    } else if (req.query.stockStatus === 'out') {
      items = items.filter(i => i.currentStock <= 0);
    } else if (req.query.stockStatus === 'normal') {
      items = items.filter(i => i.currentStock > (i.minStockAlert || 5));
    }

    res.json(items);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});


// ─────────────────────────────────────────────────────────────
// 3. LOW STOCK ALERTS
// ─────────────────────────────────────────────────────────────
router.get('/low-stock', protect, async (req, res) => {
  try {
    const branchFilter = getBranchFilter(req.user);
    // Filter at DB level instead of loading all items and filtering in JS
    const lowStockItems = await Inventory.find({
      isActive: true,
      ...branchFilter,
      $expr: { $lte: ['$currentStock', '$minStockAlert'] },
    })
      .populate('supplier', 'name phone')
      .populate('branch', 'name')
      .lean();
    res.json(lowStockItems);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});


// ─────────────────────────────────────────────────────────────
// 4. CREATE INVENTORY ITEM
// ─────────────────────────────────────────────────────────────
router.post('/', protect, authorize(...MGMT_ROLES), async (req, res) => {
  try {
    const userBranch = req.user.activeBranch?._id || req.user.activeBranch || req.user.branch?._id || req.user.branch || null;
    const branchId = req.body.branch !== undefined ? req.body.branch : userBranch;

    const data = {
      ...req.body,
      itemCode: (req.body.itemCode || '').trim().toUpperCase(),
      branch: branchId || null,
    };

    if (!data.itemCode || !data.itemName) {
      return res.status(400).json({ message: 'Item Code and Item Name are required' });
    }

    // Check duplicate
    const existing = await Inventory.findOne({ itemCode: data.itemCode, branch: data.branch, isActive: true });
    if (existing) {
      return res.status(400).json({ message: `Item with code "${data.itemCode}" already exists in this branch` });
    }

    const item = await Inventory.create(data);

    // If opening stock is provided > 0, log opening transaction
    if (item.currentStock > 0) {
      await StockTransaction.create({
        type: 'PURCHASE_IN',
        inventoryItem: item._id,
        itemCode: item.itemCode,
        itemName: item.itemName,
        qty: item.currentStock,
        unit: item.unit,
        unitCost: item.costPrice || 0,
        totalCost: (item.currentStock || 0) * (item.costPrice || 0),
        previousStock: 0,
        newStock: item.currentStock,
        supplier: item.supplier || null,
        reason: 'Opening Stock Entry',
        branch: item.branch,
        performedBy: req.user.name,
      });
    }

    const populated = await Inventory.findById(item._id)
      .populate('supplier', 'name phone')
      .populate('branch', 'name code')
      .populate('product', 'name code rate');

    res.status(201).json(populated);
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
});

// ─────────────────────────────────────────────────────────────
// 5. UPDATE INVENTORY ITEM
// ─────────────────────────────────────────────────────────────
router.put('/:id', protect, authorize(...MGMT_ROLES), async (req, res) => {
  try {
    const item = await Inventory.findById(req.params.id);
    if (!item) return res.status(404).json({ message: 'Item not found' });

    // Protect stock from direct tampering via regular PUT — use adjust/stock-in/stock-out
    const updateData = { ...req.body };
    delete updateData.currentStock; // Prevent direct stock override

    const updated = await Inventory.findByIdAndUpdate(req.params.id, updateData, { new: true })
      .populate('supplier', 'name phone')
      .populate('branch', 'name code')
      .populate('product', 'name code rate');

    res.json(updated);
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
});

// ─────────────────────────────────────────────────────────────
// 6. DELETE (DEACTIVATE) ITEM
// ─────────────────────────────────────────────────────────────
router.delete('/:id', protect, authorize(...MGMT_ROLES), async (req, res) => {
  try {
    const item = await Inventory.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
    if (!item) return res.status(404).json({ message: 'Item not found' });
    res.json({ message: 'Item deleted successfully' });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// ─────────────────────────────────────────────────────────────
// 7. STOCK IN (PURCHASE / INWARD ENTRY)
// ─────────────────────────────────────────────────────────────
router.post('/stock-in', protect, authorize(...MGMT_ROLES), async (req, res) => {
  try {
    const { itemId, qty, unitCost, supplierId, invoiceNo, notes } = req.body;
    const quantity = parseFloat(qty);
    const cost = parseFloat(unitCost) || 0;

    if (!itemId || !quantity || quantity <= 0) {
      return res.status(400).json({ message: 'Valid Item ID and Quantity (> 0) are required' });
    }

    const item = await Inventory.findById(itemId);
    if (!item) return res.status(404).json({ message: 'Inventory item not found' });

    const prevStock = item.currentStock || 0;
    const newStock = prevStock + quantity;

    // Weighted average cost update if cost provided
    let newCostPrice = item.costPrice || 0;
    if (cost > 0) {
      const prevTotalCost = prevStock * (item.costPrice || 0);
      const addedTotalCost = quantity * cost;
      if (newStock > 0) {
        newCostPrice = Math.round(((prevTotalCost + addedTotalCost) / newStock) * 100) / 100;
      }
    }

    item.currentStock = newStock;
    if (cost > 0) item.costPrice = newCostPrice;
    if (supplierId) item.supplier = supplierId;
    await item.save();

    const transaction = await StockTransaction.create({
      type: 'PURCHASE_IN',
      inventoryItem: item._id,
      itemCode: item.itemCode,
      itemName: item.itemName,
      qty: quantity,
      unit: item.unit,
      unitCost: cost > 0 ? cost : item.costPrice,
      totalCost: quantity * (cost > 0 ? cost : item.costPrice),
      previousStock: prevStock,
      newStock: newStock,
      supplier: supplierId || item.supplier || null,
      invoiceNo: invoiceNo || '',
      reason: notes || (invoiceNo ? `Purchase Invoice #${invoiceNo}` : 'Stock In Purchase'),
      branch: item.branch,
      performedBy: req.user.name,
    });

    res.json({
      message: `Successfully received ${quantity} ${item.unit} for ${item.itemName}`,
      item,
      transaction,
    });
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
});

// ─────────────────────────────────────────────────────────────
// 8. STOCK OUT (WASTAGE / DAMAGE / INTERNAL USE)
// ─────────────────────────────────────────────────────────────
router.post('/stock-out', protect, authorize(...MGMT_ROLES), async (req, res) => {
  try {
    const { itemId, qty, reason, category } = req.body; // category: 'Spoilage', 'Expired', 'Damaged', 'Burnt', 'Dropped', 'Staff Meal', 'Testing'
    const quantity = parseFloat(qty);

    if (!itemId || !quantity || quantity <= 0) {
      return res.status(400).json({ message: 'Valid Item ID and Quantity (> 0) are required' });
    }

    const item = await Inventory.findById(itemId);
    if (!item) return res.status(404).json({ message: 'Inventory item not found' });

    const prevStock = item.currentStock || 0;
    const newStock = Math.max(0, prevStock - quantity);

    item.currentStock = newStock;
    await item.save();

    const wastageReason = [category, reason].filter(Boolean).join(' - ') || 'Stock Wastage / Loss';

    const transaction = await StockTransaction.create({
      type: 'WASTAGE_OUT',
      inventoryItem: item._id,
      itemCode: item.itemCode,
      itemName: item.itemName,
      qty: quantity,
      unit: item.unit,
      unitCost: item.costPrice || 0,
      totalCost: quantity * (item.costPrice || 0),
      previousStock: prevStock,
      newStock: newStock,
      reason: wastageReason,
      branch: item.branch,
      performedBy: req.user.name,
    });

    res.json({
      message: `Logged wastage of ${quantity} ${item.unit} for ${item.itemName}`,
      item,
      transaction,
    });
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
});

// ─────────────────────────────────────────────────────────────
// 9. STOCK ADJUSTMENT (MANUAL AUDIT / CORRECTION)
// ─────────────────────────────────────────────────────────────
router.post('/adjust', protect, authorize(...MGMT_ROLES), async (req, res) => {
  try {
    const { itemId, actualCount, reason } = req.body;
    const counted = parseFloat(actualCount);

    if (!itemId || isNaN(counted) || counted < 0) {
      return res.status(400).json({ message: 'Valid Item ID and non-negative Actual Count are required' });
    }

    const item = await Inventory.findById(itemId);
    if (!item) return res.status(404).json({ message: 'Inventory item not found' });

    const prevStock = item.currentStock || 0;
    const delta = counted - prevStock;

    if (delta === 0) {
      return res.json({ message: 'No change in stock quantity', item });
    }

    item.currentStock = counted;
    await item.save();

    const transaction = await StockTransaction.create({
      type: 'ADJUSTMENT',
      inventoryItem: item._id,
      itemCode: item.itemCode,
      itemName: item.itemName,
      qty: Math.abs(delta),
      unit: item.unit,
      unitCost: item.costPrice || 0,
      totalCost: Math.abs(delta) * (item.costPrice || 0),
      previousStock: prevStock,
      newStock: counted,
      reason: reason || `Audit Correction: Changed from ${prevStock} to ${counted} (${delta > 0 ? '+' : ''}${delta} ${item.unit})`,
      branch: item.branch,
      performedBy: req.user.name,
    });

    res.json({
      message: `Adjusted ${item.itemName} stock to ${counted} ${item.unit}`,
      item,
      transaction,
    });
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
});

// ─────────────────────────────────────────────────────────────
// 10. STOCK TRANSFER (BRANCH TO BRANCH)
// ─────────────────────────────────────────────────────────────
router.post('/transfer', protect, authorize(...MGMT_ROLES), async (req, res) => {
  try {
    const { itemId, toBranchId, qty, notes } = req.body;
    const quantity = parseFloat(qty);

    if (!itemId || !toBranchId || !quantity || quantity <= 0) {
      return res.status(400).json({ message: 'Item ID, Destination Branch, and Quantity are required' });
    }

    const sourceItem = await Inventory.findById(itemId).populate('branch');
    if (!sourceItem) return res.status(404).json({ message: 'Source inventory item not found' });

    if (sourceItem.branch?.toString() === toBranchId.toString()) {
      return res.status(400).json({ message: 'Source and Destination branch cannot be the same' });
    }

    if (sourceItem.currentStock < quantity) {
      return res.status(400).json({ message: `Insufficient stock in source branch (${sourceItem.currentStock} available)` });
    }

    // Decrement source item stock
    const srcPrev = sourceItem.currentStock;
    sourceItem.currentStock = srcPrev - quantity;
    await sourceItem.save();

    // Log TRANSFER_OUT
    await StockTransaction.create({
      type: 'TRANSFER_OUT',
      inventoryItem: sourceItem._id,
      itemCode: sourceItem.itemCode,
      itemName: sourceItem.itemName,
      qty: quantity,
      unit: sourceItem.unit,
      unitCost: sourceItem.costPrice || 0,
      totalCost: quantity * (sourceItem.costPrice || 0),
      previousStock: srcPrev,
      newStock: sourceItem.currentStock,
      branch: sourceItem.branch?._id || sourceItem.branch,
      toBranch: toBranchId,
      reason: notes || `Transfer Out to target branch`,
      performedBy: req.user.name,
    });

    // Find or create matching item in destination branch
    let destItem = await Inventory.findOne({ itemCode: sourceItem.itemCode, branch: toBranchId, isActive: true });
    let destPrev = 0;
    if (!destItem) {
      destItem = await Inventory.create({
        itemCode: sourceItem.itemCode,
        itemName: sourceItem.itemName,
        category: sourceItem.category,
        unit: sourceItem.unit,
        currentStock: quantity,
        minStockAlert: sourceItem.minStockAlert,
        costPrice: sourceItem.costPrice,
        sellingPrice: sourceItem.sellingPrice,
        branch: toBranchId,
        product: sourceItem.product,
        location: sourceItem.location,
      });
      destPrev = 0;
    } else {
      destPrev = destItem.currentStock || 0;
      destItem.currentStock = destPrev + quantity;
      await destItem.save();
    }

    // Log TRANSFER_IN
    await StockTransaction.create({
      type: 'TRANSFER_IN',
      inventoryItem: destItem._id,
      itemCode: destItem.itemCode,
      itemName: destItem.itemName,
      qty: quantity,
      unit: destItem.unit,
      unitCost: sourceItem.costPrice || 0,
      totalCost: quantity * (sourceItem.costPrice || 0),
      previousStock: destPrev,
      newStock: destItem.currentStock,
      branch: toBranchId,
      toBranch: sourceItem.branch?._id || sourceItem.branch,
      reason: notes || `Transfer In from source branch`,
      performedBy: req.user.name,
    });

    res.json({
      message: `Successfully transferred ${quantity} ${sourceItem.unit} of ${sourceItem.itemName}`,
      sourceItem,
      destItem,
    });
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
});

// ─────────────────────────────────────────────────────────────
// 11. STOCK TRANSACTIONS / LEDGER
// ─────────────────────────────────────────────────────────────
router.get('/transactions', protect, async (req, res) => {
  try {
    const branchFilter = getBranchFilter(req.user);
    const q = { ...branchFilter };

    if (req.query.type && req.query.type !== 'all') {
      q.type = req.query.type;
    }
    if (req.query.itemId) {
      q.inventoryItem = req.query.itemId;
    }
    if (req.query.search) {
      q.$or = [
        { itemName: { $regex: req.query.search, $options: 'i' } },
        { itemCode: { $regex: req.query.search, $options: 'i' } },
        { invoiceNo: { $regex: req.query.search, $options: 'i' } },
        { billNo: { $regex: req.query.search, $options: 'i' } },
      ];
    }
    if (req.query.startDate && req.query.endDate) {
      const s = new Date(req.query.startDate); s.setHours(0, 0, 0, 0);
      const e = new Date(req.query.endDate); e.setHours(23, 59, 59, 999);
      q.date = { $gte: s, $lte: e };
    }

    const limit = parseInt(req.query.limit) || 150;
    const transactions = await StockTransaction.find(q)
      .populate('supplier', 'name phone')
      .populate('branch', 'name code')
      .populate('toBranch', 'name code')
      .sort({ date: -1, createdAt: -1 })
      .limit(limit);

    res.json(transactions);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// ─────────────────────────────────────────────────────────────
// 12. 1-CLICK SYNC FROM PRODUCTS CATALOG
// ─────────────────────────────────────────────────────────────
router.post('/sync-products', protect, authorize(...MGMT_ROLES), async (req, res) => {
  try {
    const userBranch = req.user.activeBranch?._id || req.user.activeBranch || req.user.branch?._id || req.user.branch || null;
    const targetBranch = req.body.branch !== undefined ? req.body.branch : userBranch;

    const products = await Product.find({ 'flags.active': true });
    let createdCount = 0;
    let existingCount = 0;

    for (const prod of products) {
      const query = { itemCode: prod.code.toUpperCase() };
      if (targetBranch) query.branch = targetBranch;
      else query.branch = null;

      const existing = await Inventory.findOne(query);
      if (existing) {
        // Update product reference and pricing
        existing.product = prod._id;
        existing.sellingPrice = prod.rate || existing.sellingPrice;
        if (!existing.category && prod.groupName) existing.category = prod.groupName;
        await existing.save();
        existingCount++;
      } else {
        await Inventory.create({
          itemCode: prod.code.toUpperCase(),
          itemName: prod.name,
          category: prod.groupName || prod.departmentName || 'Finished Goods',
          unit: prod.unitName || 'PCS',
          currentStock: 0,
          minStockAlert: 5,
          costPrice: 0,
          sellingPrice: prod.rate || 0,
          branch: targetBranch || null,
          product: prod._id,
          location: 'Kitchen Godown',
          autoDeductOnBill: true,
        });
        createdCount++;
      }
    }

    res.json({
      message: `Product sync complete: ${createdCount} new inventory items created, ${existingCount} items updated.`,
      createdCount,
      existingCount,
    });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// ─────────────────────────────────────────────────────────────
// 13. SUPPLIERS CRUD
// ─────────────────────────────────────────────────────────────
router.get('/suppliers', protect, async (req, res) => {
  try {
    const branchFilter = getBranchFilter(req.user);
    const suppliers = await Supplier.find({ isActive: true, ...branchFilter }).sort({ name: 1 });
    res.json(suppliers);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

router.post('/suppliers', protect, authorize(...MGMT_ROLES), async (req, res) => {
  try {
    const userBranch = req.user.activeBranch?._id || req.user.activeBranch || req.user.branch?._id || req.user.branch || null;
    const data = { ...req.body, branch: req.body.branch || userBranch || null };
    const supplier = await Supplier.create(data);
    res.status(201).json(supplier);
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
});

router.put('/suppliers/:id', protect, authorize(...MGMT_ROLES), async (req, res) => {
  try {
    const supplier = await Supplier.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!supplier) return res.status(404).json({ message: 'Supplier not found' });
    res.json(supplier);
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
});

router.delete('/suppliers/:id', protect, authorize(...MGMT_ROLES), async (req, res) => {
  try {
    await Supplier.findByIdAndUpdate(req.params.id, { isActive: false });
    res.json({ message: 'Supplier deleted successfully' });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

module.exports = router;
