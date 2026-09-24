const mongoose = require('mongoose');

const inventorySchema = new mongoose.Schema({
  itemCode: { type: String, required: true, uppercase: true, trim: true },
  itemName: { type: String, required: true, trim: true },
  category: { type: String, default: 'General', trim: true }, // e.g. 'Raw Material', 'Finished Goods', 'Beverage', 'Packaging', 'Grocery', 'Dairy', 'Meat'
  unit: { type: String, default: 'PCS', uppercase: true, trim: true }, // PCS, KG, GM, LTR, ML, BOX, PACK, CAN, BOTTLE, PORTION
  currentStock: { type: Number, default: 0 },
  minStockAlert: { type: Number, default: 5 }, // Low stock threshold
  costPrice: { type: Number, default: 0 }, // Purchase / unit cost
  sellingPrice: { type: Number, default: 0 }, // Selling / menu price (if applicable)
  branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', default: null }, // Null = global/all branches
  supplier: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', default: null },
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', default: null }, // Linked POS Product if any
  location: { type: String, default: 'Main Store', trim: true }, // Main Store, Kitchen, Godown, Counter Fridge, Bar
  autoDeductOnBill: { type: Boolean, default: true },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

// Compound index on itemCode + branch for multi-branch isolation
inventorySchema.index({ itemCode: 1, branch: 1 }, { unique: true });

module.exports = mongoose.model('Inventory', inventorySchema);
