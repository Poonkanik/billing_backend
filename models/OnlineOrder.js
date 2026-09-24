const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
  productCode: String,
  productName: { type: String, required: true },
  rate: { type: Number, required: true },
  qty: { type: Number, required: true, default: 1 },
  amount: { type: Number, required: true },
  addons: [String],
  notes: String,
}, { _id: false });

const onlineOrderSchema = new mongoose.Schema({
  orderId: { type: String, required: true, unique: true }, // e.g., SW-984210, ZT-551239
  platform: { type: String, enum: ['swiggy', 'zomato', 'direct'], required: true },
  platformOrderNo: String,
  customer: {
    name: { type: String, default: 'Customer' },
    phone: { type: String, default: '' },
    address: { type: String, default: '' },
    instructions: { type: String, default: '' },
  },
  items: [orderItemSchema],
  subtotal: { type: Number, required: true, default: 0 },
  gstTotal: { type: Number, default: 0 },
  cgstTotal: { type: Number, default: 0 },
  sgstTotal: { type: Number, default: 0 },
  packagingCharge: { type: Number, default: 0 },
  deliveryFee: { type: Number, default: 0 },
  discount: { type: Number, default: 0 },
  netAmount: { type: Number, required: true, default: 0 },
  payoutAmount: { type: Number, default: 0 }, // net after platform commission
  paymentStatus: { type: String, enum: ['PAID_ONLINE', 'COD'], default: 'PAID_ONLINE' },
  paymentMode: { type: String, default: 'Online' },
  
  status: {
    type: String,
    enum: ['NEW', 'ACCEPTED', 'PREPARING', 'FOOD_READY', 'DISPATCHED', 'DELIVERED', 'CANCELLED', 'REJECTED'],
    default: 'NEW',
  },
  cancelReason: String,
  prepTimeMinutes: { type: Number, default: 20 },
  estimatedDeliveryTime: String,

  rider: {
    name: { type: String, default: '' },
    phone: { type: String, default: '' },
    status: { type: String, default: 'ASSIGNED' },
    otp: { type: String, default: '' },
  },

  posBill: { type: mongoose.Schema.Types.ObjectId, ref: 'Bill', default: null },
  posBillNo: String,
  isConvertedToBill: { type: Boolean, default: false },

  branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', default: null },
  placedAt: { type: Date, default: Date.now },
  acceptedAt: Date,
  readyAt: Date,
  dispatchedAt: Date,
  deliveredAt: Date,
}, { timestamps: true });

// ── Indexes for fast queries ──
onlineOrderSchema.index({ branch: 1, status: 1, placedAt: -1 }); // main orders listing
onlineOrderSchema.index({ branch: 1, placedAt: -1 });            // date range queries
onlineOrderSchema.index({ platform: 1, status: 1 });              // platform filtering

module.exports = mongoose.model('OnlineOrder', onlineOrderSchema);
