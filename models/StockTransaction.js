const mongoose = require('mongoose');

const stockTransactionSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: [
      'PURCHASE_IN',   // Receiving stock from supplier / opening stock
      'SALE_OUT',      // Deducted automatically when a bill is completed
      'WASTAGE_OUT',   // Spoilage, damaged, expired, burnt, dropped
      'ADJUSTMENT',    // Manual inventory audit correction (+ or -)
      'TRANSFER_IN',   // Received from another branch/location
      'TRANSFER_OUT',  // Sent to another branch/location
      'RETURN_IN',     // Restocked due to bill cancellation
    ],
    required: true,
  },
  inventoryItem: { type: mongoose.Schema.Types.ObjectId, ref: 'Inventory', required: true },
  itemCode: { type: String, required: true },
  itemName: { type: String, required: true },
  qty: { type: Number, required: true }, // positive number
  unit: { type: String, default: 'PCS' },
  unitCost: { type: Number, default: 0 },
  totalCost: { type: Number, default: 0 },
  previousStock: { type: Number, required: true },
  newStock: { type: Number, required: true },
  supplier: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', default: null },
  invoiceNo: { type: String, trim: true },
  billRef: { type: mongoose.Schema.Types.ObjectId, ref: 'Bill', default: null },
  billNo: { type: String },
  reason: { type: String, trim: true }, // notes or reason
  branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', default: null },
  toBranch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', default: null }, // for transfers
  performedBy: { type: String, default: 'System' },
  date: { type: Date, default: Date.now },
}, { timestamps: true });

// ── Indexes for fast queries ──
stockTransactionSchema.index({ branch: 1, date: -1 });        // branch date range (summary)
stockTransactionSchema.index({ inventoryItem: 1, date: -1 }); // per-item transaction history
stockTransactionSchema.index({ type: 1, date: -1 });          // type filtering

module.exports = mongoose.model('StockTransaction', stockTransactionSchema);
