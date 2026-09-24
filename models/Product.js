const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true },
  name: { type: String, required: true, uppercase: true },
  localNames: { type: Map, of: String, default: {} },  // { ta: 'தமிழ் பெயர்', hi: 'हिंदी नाम', ... }
  codeText: String,
  rate: { type: Number, default: 0 },      // Common/default base rate for ALL branches
  cgst: { type: Number, default: 0 },
  sgst: { type: Number, default: 0 },
  cess: { type: Number, default: 0 },
  imageUrl: String,
  company: { type: mongoose.Schema.Types.ObjectId, ref: 'Company' },
  group: { type: mongoose.Schema.Types.ObjectId, ref: 'Group' },
  groupName: String,
  department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department' },
  departmentName: String,
  unitName: { type: String, default: 'PCS' },
  qtyFormat: { type: Number, default: 0 },
  // Common rates per sales mode (applies to ALL branches by default)
  rates: [{
    salesMode: { type: mongoose.Schema.Types.ObjectId, ref: 'SalesMode' },
    rate: { type: Number, default: 0 }
  }],
  // Branch-specific rate overrides — if set, overrides the common rate for that branch
  // If a product has no branchRates entry for a given branch, the common rate is used
  branchRates: [{
    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true },
    rate: { type: Number, default: 0 },        // Branch-specific base rate (overrides product.rate)
    salesModeRates: [{                          // Branch-specific per-sales-mode rates
      salesMode: { type: mongoose.Schema.Types.ObjectId, ref: 'SalesMode' },
      rate: { type: Number, default: 0 }
    }]
  }],
  flags: {
    maintainStock: { type: Boolean, default: false },
    groupStock: { type: Boolean, default: false },
    closingStockClear: { type: Boolean, default: false },
    godownStock: { type: Boolean, default: false },
    barItem: { type: Boolean, default: false },
    active: { type: Boolean, default: true },
    allowGst: { type: Boolean, default: false },
    fastMoving: { type: Boolean, default: false },
  },
}, { timestamps: true });

// ── Indexes for fast queries ──
productSchema.index({ 'flags.active': 1, name: 1 });       // billing product search
productSchema.index({ 'flags.active': 1, department: 1 }); // department filter
productSchema.index({ 'flags.active': 1, group: 1 });      // group filter

module.exports = mongoose.model('Product', productSchema);
