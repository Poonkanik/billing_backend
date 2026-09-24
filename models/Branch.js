const mongoose = require('mongoose');

const branchSchema = new mongoose.Schema({
  code: { type: Number },
  name: { type: String, required: true },
  address1: String,
  address2: String,
  address3: String,
  address4: String,
  phone: String,
  mobile: String,
  email: String,
  website: String,
  gstNo: String,
  manager: String,
  openingDate: Date,
  isActive: { type: Boolean, default: true },
  company: { type: mongoose.Schema.Types.ObjectId, ref: 'Company' },
}, { timestamps: true });

// Auto-assign code before save
branchSchema.pre('save', async function (next) {
  if (!this.code) {
    const last = await this.constructor.findOne({ isActive: true }).sort({ code: -1 });
    this.code = (last?.code || 0) + 1;
  }
  next();
});

module.exports = mongoose.model('Branch', branchSchema);
