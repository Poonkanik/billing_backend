const mongoose = require('mongoose');

const companySchema = new mongoose.Schema({
  code: { type: Number, default: 1 },
  name: { type: String, required: true },
  address1: String, address2: String, address3: String,
  address4: String, address5: String,
  phone: String, mobile: String, email: String, web: String,
  langName: String, langAddr1: String, langAddr2: String,
  langAddr3: String, langAddr4: String, langAddr5: String,
  merchantId: String,
  gstNo: String,
  logoPath: String,
}, { timestamps: true });

module.exports = mongoose.model('Company', companySchema);
