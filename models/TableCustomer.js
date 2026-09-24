const mongoose = require('mongoose');

const tableSchema = new mongoose.Schema({
  code: { type: Number, unique: true },
  name: { type: String, required: true, uppercase: true },
  capacity: { type: Number, default: 4 },
  status: { type: String, enum: ['available', 'occupied', 'reserved'], default: 'available' },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

tableSchema.pre('save', async function (next) {
  if (!this.code) {
    const last = await this.constructor.findOne().sort({ code: -1 });
    this.code = last ? last.code + 1 : 1;
  }
  next();
});

const customerSchema = new mongoose.Schema({
  code: { type: Number, unique: true },
  name: { type: String, required: true, uppercase: true },
  phone: String,
  mobile: String,
  address: String,
  email: String,
  loyaltyPoints: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

customerSchema.pre('save', async function (next) {
  if (!this.code) {
    const last = await this.constructor.findOne().sort({ code: -1 });
    this.code = last ? last.code + 1 : 1;
  }
  next();
});

module.exports = {
  Table: mongoose.model('Table', tableSchema),
  Customer: mongoose.model('Customer', customerSchema),
};
