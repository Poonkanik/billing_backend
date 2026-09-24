const mongoose = require('mongoose');

const groupSchema = new mongoose.Schema({
  code: { type: Number, unique: true },
  name: { type: String, required: true, uppercase: true },
  languageName: String,
  printer: {
    printerType: String,
    dosPrinterName: String,
    windowsPrinterName: String,
    numberOfPrint: { type: Number, default: 0 },
    gapLine: { type: Number, default: 0 },
    autoCutter: { type: Boolean, default: false },
    askPrint: { type: Boolean, default: false },
  },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

groupSchema.pre('save', async function (next) {
  if (!this.code) {
    const last = await this.constructor.findOne().sort({ code: -1 });
    this.code = last ? last.code + 1 : 1;
  }
  next();
});

module.exports = mongoose.model('Group', groupSchema);
