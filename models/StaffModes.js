const mongoose = require('mongoose');

const autoCode = async function (next) {
  if (!this.code) {
    const last = await this.constructor.findOne().sort({ code: -1 });
    this.code = last ? last.code + 1 : 1;
  }
  next();
};

// ── Waiter ──
const waiterSchema = new mongoose.Schema({
  code: { type: Number, unique: true },
  name: { type: String, required: true, uppercase: true },
  phone: String,
  isActive: { type: Boolean, default: true },
}, { timestamps: true });
waiterSchema.pre('save', autoCode);

// ── Captain ──
const captainSchema = new mongoose.Schema({
  code: { type: Number, unique: true },
  name: { type: String, required: true, uppercase: true },
  phone: String,
  isActive: { type: Boolean, default: true },
}, { timestamps: true });
captainSchema.pre('save', autoCode);

// ── Rate Info (price tiers per mode) ──
const rateSchema = new mongoose.Schema({
  code: { type: Number, unique: true },
  name: { type: String, required: true },   // e.g. "DINE IN", "PARCEL", "ZOMATO"
  description: String,
  multiplier: { type: Number, default: 1 }, // 1 = no change, 1.1 = 10% extra
  isActive: { type: Boolean, default: true },
}, { timestamps: true });
rateSchema.pre('save', autoCode);

// ── Sales Mode ──
const salesModeSchema = new mongoose.Schema({
  code: { type: Number, unique: true },
  name: { type: String, required: true },   // Dine In, Parcel, Swiggy, Zomato, etc.
  type: { type: String, enum: ['dine_in', 'parcel', 'delivery', 'online', 'other'], default: 'dine_in' },
  rateInfo: { type: mongoose.Schema.Types.ObjectId, ref: 'RateInfo' },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });
salesModeSchema.pre('save', autoCode);

module.exports = {
  Waiter:    mongoose.model('Waiter',    waiterSchema),
  Captain:   mongoose.model('Captain',   captainSchema),
  RateInfo:  mongoose.model('RateInfo',  rateSchema),
  SalesMode: mongoose.model('SalesMode', salesModeSchema),
};
