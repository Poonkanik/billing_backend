const mongoose = require('mongoose');

const billItemSchema = new mongoose.Schema({
  productCode: String,
  productName: { type: String, required: true },
  rate:   { type: Number, required: true },
  qty:    { type: Number, required: true, default: 1 },
  amount: { type: Number, required: true },
  cgstPer:{ type: Number, default: 2.5 },
  sgstPer:{ type: Number, default: 2.5 },
  cgstAmt:{ type: Number, default: 0 },
  sgstAmt:{ type: Number, default: 0 },
  group: String, department: String,
}, { _id: false });

const billEditSchema = new mongoose.Schema({
  editedAt:  { type: Date, default: Date.now },
  editedBy:  String,
  reason:    String,
  // snapshot of bill before edit
  prevItems:    { type: mongoose.Schema.Types.Mixed },
  prevSubtotal: Number,
  prevNetAmount:Number,
  prevDiscount: Number,
}, { _id: false });

const billSchema = new mongoose.Schema({
  billNo:  { type: String, unique: true },
  kotNo:   String,
  seqNo:   { type: Number },  // simple sequential number starting at 1
  date:    { type: Date, default: Date.now },
  table:   String, waiter: String, cashier: String,
  customer: String, customerPhone: String,
  billType: { type: String, enum: ['dine_in','takeaway','parcel','delivery','online','prebooking','advance'], default: 'dine_in' },
  onlinePlatform: { type: String, default: '' },
  onlineOrderId:  String,
  bookingDate: Date, bookingNote: String, partyName: String, guestCount: Number,
  advanceAmount: { type: Number, default: 0 },
  advanceMode: String, advanceBillRef: String,
  items: [billItemSchema],
  subtotal:   { type: Number, default: 0 },
  gstPer:     { type: Number, default: 5 },
  cgstTotal:  { type: Number, default: 0 },
  sgstTotal:  { type: Number, default: 0 },
  discount:   { type: Number, default: 0 },
  reduction:  { type: Number, default: 0 },
  extraCharges: { type: Number, default: 0 },
  roundOff:   { type: Number, default: 0 },
  netAmount:  { type: Number, default: 0 },
  paymentMode:    { type: String, default: 'Cash' },
  cashReceived:   { type: Number, default: 0 },
  changeReturned: { type: Number, default: 0 },
  status: { type: String, enum: ['draft','kot_saved','billed','cancelled','edited'], default: 'draft' },
  cancelReason: String,
  isEdited:    { type: Boolean, default: false },
  editHistory: [billEditSchema],
  printCount:  { type: Number, default: 1 },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  // Branch this bill belongs to — enables branch-level data isolation
  branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', default: null },
}, { timestamps: true });

// ── Indexes for fast queries ──
billSchema.index({ branch: 1, date: -1 });                   // branch + date range (reports, today)
billSchema.index({ branch: 1, status: 1, date: -1 });        // dashboard/report aggregations
billSchema.index({ branch: 1, seqNo: -1 });                  // listing sorted by seqNo
billSchema.index({ branch: 1, billType: 1, date: -1 });      // billType filtering
billSchema.index({ branch: 1, paymentMode: 1, date: -1 });   // payment-mode filtering
billSchema.index({ cashier: 1, date: -1 });                   // cashier-wise report
billSchema.index({ status: 1 });                              // status filtering

// Auto-assign sequential bill number
billSchema.pre('save', async function (next) {
  if (!this.billNo) {
    const isParcel = this.billType === 'parcel' || this.billType === 'takeaway';
    if (isParcel) {
      const last = await this.constructor.findOne({ billNo: /^P/ }, { seqNo:1 }).sort({ seqNo:-1 });
      this.seqNo  = (last?.seqNo || 0) + 1;
      this.billNo = `P${String(this.seqNo).padStart(4,'0')}`;
      this.kotNo  = `PK${String(this.seqNo).padStart(4,'0')}`;
    } else {
      const last = await this.constructor.findOne({ billNo: /^B/ }, { seqNo:1 }).sort({ seqNo:-1 });
      this.seqNo  = (last?.seqNo || 0) + 1;
      this.billNo = `B${String(this.seqNo).padStart(4,'0')}`;
      this.kotNo  = `K${String(this.seqNo).padStart(4,'0')}`;
    }
  }
  next();
});

module.exports = mongoose.model('Bill', billSchema);
