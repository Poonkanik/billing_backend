const express = require('express');
const router = express.Router();
const OnlineOrder = require('../models/OnlineOrder');
const PlatformStatus = require('../models/PlatformStatus');
const Bill = require('../models/Bill');
const Product = require('../models/Product');
const Inventory = require('../models/Inventory');
const StockTransaction = require('../models/StockTransaction');
const FoodDeliveryExtractor = require('../services/foodDeliveryExtractor');
const { protect, getBranchFilter } = require('../middleware/auth');

// Deduct inventory when converting online order to bill
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
          reason: `Online Order ${bill.onlineOrderId || ''} - POS Sale #${bill.billNo}`,
          branch: bill.branch,
          performedBy: userName || 'Online Aggregator Sync',
        });
      }
    }
  } catch (err) {
    console.error('Error in deductStockForBill:', err.message);
  }
}

// ── GET /api/online-orders/platforms/status ──
router.get('/platforms/status', protect, async (req, res) => {
  try {
    const branchFilter = getBranchFilter(req.user);
    const branchId = branchFilter.branch || null;

    let swiggy = await PlatformStatus.findOne({ platform: 'swiggy', branch: branchId });
    if (!swiggy) {
      swiggy = await PlatformStatus.create({
        platform: 'swiggy',
        branch: branchId,
        isOnline: false,
        isLoggedIn: false,
        authType: 'portal_login',
        merchantId: '',
        outletName: '',
        storeStatusMessage: 'Store Logged Out / Disconnected',
        sessionToken: '',
        tokenExpiry: null,
      });
    }

    let zomato = await PlatformStatus.findOne({ platform: 'zomato', branch: branchId });
    if (!zomato) {
      zomato = await PlatformStatus.create({
        platform: 'zomato',
        branch: branchId,
        isOnline: false,
        isLoggedIn: false,
        authType: 'portal_login',
        merchantId: '',
        outletName: '',
        storeStatusMessage: 'Store Logged Out / Disconnected',
        sessionToken: '',
        tokenExpiry: null,
      });
    }

    res.json({ swiggy, zomato });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── POST /api/online-orders/cleanup-mock-data ──
router.post('/cleanup-mock-data', protect, async (req, res) => {
  try {
    const branchFilter = getBranchFilter(req.user);
    const branchId = branchFilter.branch || null;

    // Delete unbilled / test mock orders or all mock orders
    const deleted = await OnlineOrder.deleteMany({
      $or: [
        { isConvertedToBill: false },
        { orderId: { $regex: '^(SW|ZT)-[0-9]{6}$' } }
      ]
    });

    res.json({ message: `Successfully cleared ${deleted.deletedCount} old test / mock orders.`, deletedCount: deleted.deletedCount });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── POST /api/online-orders/platforms/login (Step 1: Login Food Delivery App) ──
router.post('/platforms/login', protect, async (req, res) => {
  try {
    const branchFilter = getBranchFilter(req.user);
    const branchId = branchFilter.branch || null;
    const { platform, ...credentials } = req.body;

    if (!['swiggy', 'zomato'].includes(platform)) {
      return res.status(400).json({ message: 'Invalid platform. Must be swiggy or zomato.' });
    }

    const result = await FoodDeliveryExtractor.login(platform, credentials, branchId);
    res.json({ message: `Successfully logged into ${platform.toUpperCase()} Partner App`, ...result });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// ── POST /api/online-orders/platforms/logout ──
router.post('/platforms/logout', protect, async (req, res) => {
  try {
    const branchFilter = getBranchFilter(req.user);
    const branchId = branchFilter.branch || null;
    const { platform } = req.body;

    const result = await FoodDeliveryExtractor.logout(platform, branchId);
    res.json({ message: `Logged out from ${platform.toUpperCase()}`, result });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// ── POST /api/online-orders/platforms/extract (Step 2: Fetch / Extract Data from App) ──
router.post('/platforms/extract', protect, async (req, res) => {
  try {
    const branchFilter = getBranchFilter(req.user);
    const branchId = branchFilter.branch || null;
    const { platform, count } = req.body;

    if (!['swiggy', 'zomato'].includes(platform)) {
      return res.status(400).json({ message: 'Invalid platform. Must be swiggy or zomato.' });
    }

    const result = await FoodDeliveryExtractor.extractLiveOrders(platform, branchId, { count });
    res.json(result);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// ── POST /api/online-orders/platforms/extract-all (Fetch live from all active platforms) ──
router.post('/platforms/extract-all', protect, async (req, res) => {
  try {
    const branchFilter = getBranchFilter(req.user);
    const branchId = branchFilter.branch || null;

    const [swiggyRes, zomatoRes] = await Promise.allSettled([
      FoodDeliveryExtractor.extractLiveOrders('swiggy', branchId, { count: 1 }),
      FoodDeliveryExtractor.extractLiveOrders('zomato', branchId, { count: 1 }),
    ]);

    const results = {
      swiggy: swiggyRes.status === 'fulfilled' ? swiggyRes.value : { error: swiggyRes.reason?.message },
      zomato: zomatoRes.status === 'fulfilled' ? zomatoRes.value : { error: zomatoRes.reason?.message },
    };

    const totalExtracted = (swiggyRes.value?.extractedCount || 0) + (zomatoRes.value?.extractedCount || 0);
    const isAllLoggedOut = (swiggyRes.status === 'rejected' || swiggyRes.reason) && (zomatoRes.status === 'rejected' || zomatoRes.reason);
    const message = totalExtracted > 0 
      ? `Successfully synchronized ${totalExtracted} live order(s) from delivery partners`
      : (isAllLoggedOut 
          ? 'No food delivery platforms are currently logged in. Please login to Swiggy / Zomato Partner first.' 
          : 'Connected to food delivery platform(s). No new pending orders.');

    res.json({
      message,
      totalExtracted,
      results,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── POST /api/online-orders/platforms/import-payload (Extract from pasted raw JSON or receipt) ──
router.post('/platforms/import-payload', protect, async (req, res) => {
  try {
    const branchFilter = getBranchFilter(req.user);
    const branchId = branchFilter.branch || null;
    const { payload } = req.body;

    if (!payload || typeof payload !== 'string' || !payload.trim()) {
      return res.status(400).json({ message: 'Please provide valid order payload text or JSON.' });
    }

    const order = await FoodDeliveryExtractor.parseAndImportRawPayload(payload.trim(), branchId);
    res.status(201).json({ message: 'Order successfully extracted and imported into POS', order });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// ── POST /api/online-orders/webhook/:platform (Live webhook order push receiver) ──
router.post('/webhook/:platform', async (req, res) => {
  try {
    const { platform } = req.params;
    const rawPayload = JSON.stringify(req.body);
    const order = await FoodDeliveryExtractor.parseAndImportRawPayload(rawPayload, null);
    res.status(200).json({ status: 'success', message: 'Webhook processed', orderId: order.orderId });
  } catch (err) {
    console.error('Webhook processing error:', err.message);
    res.status(400).json({ status: 'error', message: err.message });
  }
});

// ── PUT /api/online-orders/platforms/status ──
router.put('/platforms/status', protect, async (req, res) => {
  try {
    const branchFilter = getBranchFilter(req.user);
    const branchId = branchFilter.branch || null;
    const { platform, isOnline, isLoggedIn, autoAccept, storeStatusMessage } = req.body;

    if (!['swiggy', 'zomato'].includes(platform)) {
      return res.status(400).json({ message: 'Invalid platform name' });
    }

    const updated = await PlatformStatus.findOneAndUpdate(
      { platform, branch: branchId },
      {
        ...(isOnline !== undefined && { isOnline }),
        ...(isLoggedIn !== undefined && { isLoggedIn }),
        ...(autoAccept !== undefined && { autoAccept }),
        ...(storeStatusMessage !== undefined && { storeStatusMessage }),
        lastSync: new Date(),
      },
      { new: true, upsert: true }
    );

    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── GET /api/online-orders/stats ──
router.get('/stats', protect, async (req, res) => {
  try {
    const branchFilter = getBranchFilter(req.user);
    const s = new Date(); s.setHours(0, 0, 0, 0);
    const e = new Date(); e.setHours(23, 59, 59, 999);

    const baseQuery = {
      ...branchFilter,
      placedAt: { $gte: s, $lte: e },
    };

    const orders = await OnlineOrder.find(baseQuery);

    const totalOrders = orders.length;
    const newCount = orders.filter(o => o.status === 'NEW').length;
    const preparingCount = orders.filter(o => ['ACCEPTED', 'PREPARING'].includes(o.status)).length;
    const readyCount = orders.filter(o => o.status === 'FOOD_READY').length;
    const dispatchedCount = orders.filter(o => o.status === 'DISPATCHED').length;
    const deliveredCount = orders.filter(o => o.status === 'DELIVERED').length;
    const cancelledCount = orders.filter(o => ['CANCELLED', 'REJECTED'].includes(o.status)).length;

    const totalRevenue = orders
      .filter(o => !['CANCELLED', 'REJECTED'].includes(o.status))
      .reduce((acc, o) => acc + (o.netAmount || 0), 0);

    const swiggyOrders = orders.filter(o => o.platform === 'swiggy');
    const zomatoOrders = orders.filter(o => o.platform === 'zomato');

    res.json({
      totalOrders,
      newCount,
      preparingCount,
      readyCount,
      dispatchedCount,
      deliveredCount,
      cancelledCount,
      totalRevenue,
      swiggy: {
        count: swiggyOrders.length,
        revenue: swiggyOrders.filter(o => !['CANCELLED', 'REJECTED'].includes(o.status)).reduce((acc, o) => acc + (o.netAmount || 0), 0),
      },
      zomato: {
        count: zomatoOrders.length,
        revenue: zomatoOrders.filter(o => !['CANCELLED', 'REJECTED'].includes(o.status)).reduce((acc, o) => acc + (o.netAmount || 0), 0),
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── GET /api/online-orders ──
router.get('/', protect, async (req, res) => {
  try {
    const q = { ...getBranchFilter(req.user) };
    if (req.query.platform && req.query.platform !== 'all') {
      q.platform = req.query.platform;
    }
    if (req.query.status && req.query.status !== 'all') {
      if (req.query.status === 'ACTIVE') {
        q.status = { $in: ['NEW', 'ACCEPTED', 'PREPARING', 'FOOD_READY', 'DISPATCHED'] };
      } else if (req.query.status === 'PREPARING_ALL') {
        q.status = { $in: ['ACCEPTED', 'PREPARING'] };
      } else {
        q.status = req.query.status;
      }
    }
    if (req.query.today === 'true') {
      const s = new Date(); s.setHours(0, 0, 0, 0);
      const e = new Date(); e.setHours(23, 59, 59, 999);
      q.placedAt = { $gte: s, $lte: e };
    }
    if (req.query.search) {
      const term = req.query.search.trim();
      q.$or = [
        { orderId: { $regex: term, $options: 'i' } },
        { 'customer.name': { $regex: term, $options: 'i' } },
        { 'customer.phone': { $regex: term, $options: 'i' } },
        { 'items.productName': { $regex: term, $options: 'i' } },
      ];
    }

    const orders = await OnlineOrder.find(q).sort({ placedAt: -1 }).limit(100);
    res.json(orders);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── POST /api/online-orders/simulate ── (Simulate incoming Swiggy / Zomato orders)
router.post('/simulate', protect, async (req, res) => {
  try {
    const branchFilter = getBranchFilter(req.user);
    const branchId = branchFilter.branch || null;
    const platform = req.body.platform || (Math.random() > 0.5 ? 'swiggy' : 'zomato');

    // Fetch some real products from database if available
    const existingProducts = await Product.find({ isActive: { $ne: false } }).limit(20);

    const sampleCustomers = [
      { name: 'Priya Patel', phone: '9845123049', address: 'Flat 402, Green Valley Apts, Sector 14', instructions: 'Please don\'t ring bell, baby is sleeping.' },
      { name: 'Rahul Sharma', phone: '9712093845', address: '123, Main Street, MG Road, 2nd Cross', instructions: 'Leave at security gate if not answering.' },
      { name: 'Ananya Iyer', phone: '9820194827', address: 'B-704, Skyline Residency, Outer Ring Road', instructions: 'Extra spicy please, add extra cutlery.' },
      { name: 'Vikram Menon', phone: '9940291847', address: 'Villa 18, Palm Meadows, Whitefield', instructions: 'Call on reaching the gate.' },
      { name: 'Deepak Verma', phone: '9811204859', address: '45/2, 4th Main, Indiranagar', instructions: 'Please deliver hot.' },
      { name: 'Sneha Kulkarni', phone: '9900192837', address: '301, Sunshine Heights, Koramangala', instructions: 'Add extra mint chutney.' },
    ];

    const customer = sampleCustomers[Math.floor(Math.random() * sampleCustomers.length)];
    const riders = [
      { name: 'Manoj Kumar', phone: '9876543210', otp: `${Math.floor(1000 + Math.random() * 9000)}` },
      { name: 'Suresh Babu', phone: '9871122334', otp: `${Math.floor(1000 + Math.random() * 9000)}` },
      { name: 'Abdul Rahman', phone: '9944332211', otp: `${Math.floor(1000 + Math.random() * 9000)}` },
      { name: 'Kiran Gowda', phone: '9844001122', otp: `${Math.floor(1000 + Math.random() * 9000)}` },
    ];
    const rider = riders[Math.floor(Math.random() * riders.length)];

    let items = [];
    if (existingProducts && existingProducts.length >= 2) {
      // Pick 1 to 3 random products
      const count = Math.min(existingProducts.length, Math.floor(Math.random() * 3) + 1);
      const shuffled = [...existingProducts].sort(() => 0.5 - Math.random()).slice(0, count);
      items = shuffled.map(p => {
        const qty = Math.floor(Math.random() * 2) + 1;
        const rate = p.salesRate || p.rate || 150;
        return {
          productCode: p.code || p.itemCode || '',
          productName: p.name || p.itemName || 'Special Dish',
          rate: rate,
          qty: qty,
          amount: rate * qty,
          addons: [],
          notes: '',
        };
      });
    } else {
      // Fallback sample items
      const sampleItemPool = [
        { productCode: 'P001', productName: 'Paneer Butter Masala', rate: 240, qty: 1, amount: 240 },
        { productCode: 'P002', productName: 'Butter Naan', rate: 45, qty: 3, amount: 135 },
        { productCode: 'P003', productName: 'Chicken Biryani (Dum)', rate: 290, qty: 1, amount: 290 },
        { productCode: 'P004', productName: 'Gulab Jamun (2 Pcs)', rate: 80, qty: 1, amount: 80 },
        { productCode: 'P005', productName: 'Veg Fried Rice', rate: 180, qty: 1, amount: 180 },
        { productCode: 'P006', productName: 'Sweet Lassi', rate: 70, qty: 2, amount: 140 },
      ];
      const count = Math.floor(Math.random() * 3) + 1;
      const shuffled = [...sampleItemPool].sort(() => 0.5 - Math.random()).slice(0, count);
      items = shuffled;
    }

    const subtotal = items.reduce((acc, it) => acc + it.amount, 0);
    const gstTotal = Math.round(subtotal * 0.05 * 100) / 100;
    const cgstTotal = Math.round((gstTotal / 2) * 100) / 100;
    const sgstTotal = Math.round((gstTotal / 2) * 100) / 100;
    const packagingCharge = 30;
    const deliveryFee = 40;
    const discount = Math.random() > 0.5 ? 50 : 0;
    const netAmount = subtotal + gstTotal + packagingCharge + deliveryFee - discount;
    const commissionPer = platform === 'swiggy' ? 0.18 : 0.20;
    const payoutAmount = Math.round((subtotal * (1 - commissionPer) + packagingCharge) * 100) / 100;

    const prefix = platform === 'swiggy' ? 'SW' : 'ZT';
    const randNum = Math.floor(100000 + Math.random() * 900000);
    const orderId = `${prefix}-${randNum}`;

    const newOrder = await OnlineOrder.create({
      orderId,
      platform,
      platformOrderNo: `#${randNum}`,
      customer,
      items,
      subtotal,
      gstTotal,
      cgstTotal,
      sgstTotal,
      packagingCharge,
      deliveryFee,
      discount,
      netAmount,
      payoutAmount,
      paymentStatus: 'PAID_ONLINE',
      paymentMode: 'Online',
      status: 'NEW',
      prepTimeMinutes: 20,
      estimatedDeliveryTime: '35-40 mins',
      rider: {
        name: rider.name,
        phone: rider.phone,
        status: 'ASSIGNED',
        otp: rider.otp,
      },
      branch: branchId,
      placedAt: new Date(),
    });

    res.status(201).json(newOrder);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── PUT /api/online-orders/:id/status ──
router.put('/:id/status', protect, async (req, res) => {
  try {
    const { status, prepTimeMinutes, cancelReason } = req.body;
    const validStatuses = ['NEW', 'ACCEPTED', 'PREPARING', 'FOOD_READY', 'DISPATCHED', 'DELIVERED', 'CANCELLED', 'REJECTED'];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: 'Invalid order status' });
    }

    const order = await OnlineOrder.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });

    order.status = status;
    if (prepTimeMinutes) order.prepTimeMinutes = prepTimeMinutes;
    if (cancelReason) order.cancelReason = cancelReason;

    const now = new Date();
    if (['ACCEPTED', 'PREPARING'].includes(status) && !order.acceptedAt) order.acceptedAt = now;
    if (status === 'FOOD_READY' && !order.readyAt) order.readyAt = now;
    if (status === 'DISPATCHED' && !order.dispatchedAt) order.dispatchedAt = now;
    if (status === 'DELIVERED' && !order.deliveredAt) order.deliveredAt = now;

    await order.save();
    res.json(order);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── POST /api/online-orders/:id/convert-to-bill ──
router.post('/:id/convert-to-bill', protect, async (req, res) => {
  try {
    const order = await OnlineOrder.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });

    if (order.posBill) {
      const existingBill = await Bill.findById(order.posBill);
      if (existingBill) {
        return res.json({ message: 'Already converted', bill: existingBill, order });
      }
    }

    const userBranch = req.user.activeBranch?._id || req.user.activeBranch || req.user.branch?._id || req.user.branch || order.branch || null;

    // Map items to Bill Item Schema
    const billItems = order.items.map(it => ({
      productCode: it.productCode || '',
      productName: it.productName,
      rate: it.rate,
      qty: it.qty,
      amount: it.amount,
      cgstPer: 2.5,
      sgstPer: 2.5,
      cgstAmt: Math.round((it.amount * 0.025) * 100) / 100,
      sgstAmt: Math.round((it.amount * 0.025) * 100) / 100,
    }));

    const billData = {
      billType: 'online',
      onlinePlatform: order.platform,
      onlineOrderId: order.orderId,
      customer: order.customer?.name || 'Online Customer',
      customerPhone: order.customer?.phone || '',
      items: billItems,
      subtotal: order.subtotal,
      gstPer: 5,
      cgstTotal: order.cgstTotal,
      sgstTotal: order.sgstTotal,
      extraCharges: (order.packagingCharge || 0) + (order.deliveryFee || 0),
      discount: order.discount || 0,
      netAmount: order.netAmount,
      paymentMode: 'Online',
      cashReceived: order.netAmount,
      status: 'billed',
      createdBy: req.user._id,
      cashier: req.user.name,
      branch: userBranch,
    };

    const newBill = await Bill.create(billData);

    // Auto deduct inventory stock
    await deductStockForBill(newBill, req.user.name);

    // Update order reference
    order.posBill = newBill._id;
    order.posBillNo = newBill.billNo;
    order.isConvertedToBill = true;
    if (order.status === 'NEW') {
      order.status = 'ACCEPTED';
      order.acceptedAt = new Date();
    }
    await order.save();

    res.status(201).json({ message: 'Successfully converted to POS Bill', bill: newBill, order });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
