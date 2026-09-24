const mongoose = require('mongoose');

const departmentSchema = new mongoose.Schema({
  code: { type: Number, unique: true },
  name: { type: String, required: true, uppercase: true },
  languageName: String,
  quantityFormat: {
    type: String,
    enum: [
      'pcs', 'kg', 'g', 'L', 'ml', 'pkt', 'box', 'dozen', 'tray', 'pack',
      'plate', 'cup', 'glass', 'bottle', 'half', 'full',
      'packet', 'milligram', 'carat', 'sovereign',
      'tablet', 'strip', 'tube',
      'meter', 'roll', 'feet', 'inch', 'bundle'
    ],
    default: 'pcs'
  },
  printer: {
    printerType: String,
    dosPrinterName: String,
    windowsPrinterName: String,
    numberOfPrint: { type: Number, default: 0 },
    gapLine: { type: Number, default: 0 },
    autoCutter: { type: Boolean, default: false },
    askPrint: { type: Boolean, default: false },
  },
  separateInBilling: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

departmentSchema.pre('save', async function (next) {
  if (!this.code) {
    const last = await this.constructor.findOne().sort({ code: -1 });
    this.code = last ? last.code + 1 : 1;
  }
  next();
});

module.exports = mongoose.model('Department', departmentSchema);
