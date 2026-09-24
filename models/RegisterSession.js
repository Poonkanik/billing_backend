const mongoose = require('mongoose');

const denominationItemSchema = new mongoose.Schema({
  denomination: { type: Number, required: true },
  count:        { type: Number, required: true, default: 0 },
  amount:       { type: Number, required: true, default: 0 },
}, { _id: false });

const cashMovementSchema = new mongoose.Schema({
  type:   { type: String, enum: ['in', 'out'], required: true },
  amount: { type: Number, required: true },
  reason: { type: String, default: '' },
  time:   { type: Date, default: Date.now },
  user:   { type: String, default: '' },
}, { _id: false });

const registerSessionSchema = new mongoose.Schema({
  branch:    { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', default: null },
  openedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  openedByName: { type: String, default: '' },
  openedAt:  { type: Date, default: Date.now },
  status:    { type: String, enum: ['open', 'closed'], default: 'open' },
  
  // Opening float details
  openingDenominations: [denominationItemSchema],
  openingTotal:         { type: Number, default: 0 },
  openingNote:          { type: String, default: '' },
  
  // Mid-shift cash adjustments (pay in / pay out)
  cashMovements: [cashMovementSchema],
  
  // Closing details
  closedBy:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  closedByName: { type: String, default: '' },
  closedAt:     { type: Date, default: null },
  closingDenominations: [denominationItemSchema],
  closingTotal:         { type: Number, default: 0 },
  
  // Auto-calculated shift summary
  totalCashSales:   { type: Number, default: 0 },
  totalUpiSales:    { type: Number, default: 0 },
  totalCardSales:   { type: Number, default: 0 },
  totalOtherSales:  { type: Number, default: 0 },
  totalSales:       { type: Number, default: 0 },
  billsCount:       { type: Number, default: 0 },
  
  // Reconciliation
  expectedCash:     { type: Number, default: 0 }, // openingTotal + totalCashSales + cashIn - cashOut
  cashDifference:   { type: Number, default: 0 }, // closingTotal - expectedCash (+ is excess, - is shortage)
  closingNote:      { type: String, default: '' },
}, { timestamps: true });

// ── Indexes for fast queries ──
registerSessionSchema.index({ branch: 1, status: 1 });      // finding open session
registerSessionSchema.index({ branch: 1, openedAt: -1 });   // history listing

module.exports = mongoose.model('RegisterSession', registerSessionSchema);
