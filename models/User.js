const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true, uppercase: true, trim: true },
  fullName: { type: String, trim: true },
  employeeId: { type: String, trim: true },
  email: { type: String, trim: true },
  phone: { type: String, trim: true },
  designation: { type: String, trim: true },
  department: { type: String, trim: true },
  joinedDate: { type: Date, default: Date.now },
  password: { type: String, required: true },

  // root = developer (super admin with full system access)
  // admin = restaurant owner (administrator with elevated permissions)
  // branch_admin = branch manager (manages a specific branch)
  // cashier = standard user with limited permissions
  // waiter = minimal permissions (POS only)
  // sales = sales staff
  role: {
    type: String,
    enum: ['root', 'developer', 'admin', 'head', 'branch_admin', 'sales', 'cashier', 'waiter'],
    default: 'cashier',
  },
  permissions: {
    allowDuplicateBill: { type: Boolean, default: false },
    allowLastBill: { type: Boolean, default: false },
    allowBillCancel: { type: Boolean, default: false },
    allowEditBill: { type: Boolean, default: false },
    allowBillDiscount: { type: Boolean, default: false },
    allowReduction: { type: Boolean, default: false },
  },
  menuAccess: [{ type: String }],
  // Branch assignment — null means "all branches" (for root/admin)
  branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', default: null },
  // If true, this user MUST select a branch at login (mandatory branch user)
  branchRequired: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true },
  // Account locking
  failedLoginAttempts: { type: Number, default: 0 },
  isLocked: { type: Boolean, default: false },
  lockedAt: { type: Date, default: null },
  lockReason: { type: String, default: null },
  // session tracking
  lastLogin: Date,
  lastSeen: Date,
  activeBranch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', default: null },
  deviceInfo: String,
  ipAddress: String,
  sessionToken: String,
}, { timestamps: true });

userSchema.pre('save', async function (next) {
  if (!this.fullName && this.name) {
    this.fullName = this.name;
  }
  if (!this.employeeId) {
    const count = await this.constructor.countDocuments();
    this.employeeId = `EMP${String(count + 1).padStart(3, '0')}`;
  }
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

userSchema.methods.matchPassword = async function (entered) {
  return await bcrypt.compare(entered, this.password);
};

// ── Indexes for fast queries ──
// Note: name is already indexed via unique:true, not repeated here
userSchema.index({ role: 1, isActive: 1 });       // role-based user listing
userSchema.index({ lastSeen: -1 });               // active sessions check
userSchema.index({ branch: 1, role: 1 });         // branch-admin user listing

module.exports = mongoose.model('User', userSchema);
