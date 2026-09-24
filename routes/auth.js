const express = require('express');
const router  = express.Router();
const jwt     = require('jsonwebtoken');
const User    = require('../models/User');
const Branch  = require('../models/Branch');
const { protect } = require('../middleware/auth');

const genToken = (id) => jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '12h' });

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { name, password, branchId } = req.body;
    const user = await User.findOne({ name: name.toUpperCase(), isActive: true }).populate('branch');

    // User not found
    if (!user) return res.status(401).json({ message: 'Invalid credentials' });

    // Check if account is locked
    if (user.isLocked) {
      return res.status(403).json({
        message: 'Account is locked due to multiple failed login attempts. Please contact Root or Admin to release your account.',
        locked: true,
      });
    }

    // Check password
    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      // Increment failed attempts
      user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
      const maxAttempts = 3;
      const remaining = maxAttempts - user.failedLoginAttempts;

      if (user.failedLoginAttempts >= maxAttempts) {
        // Lock the account
        user.isLocked = true;
        user.lockedAt = new Date();
        user.lockReason = 'Too many failed login attempts';
        await user.save();
        return res.status(403).json({
          message: 'Account has been locked after 3 failed attempts. Please contact Root or Admin to release your account.',
          locked: true,
        });
      }

      await user.save();
      return res.status(401).json({
        message: `Invalid credentials. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining before account lock.`,
      });
    }

    // Successful login — reset failed attempts
    if (user.failedLoginAttempts > 0) {
      user.failedLoginAttempts = 0;
    }

    // Determine active branch for this session
    let activeBranch = null;
    if (branchId && branchId !== 'none') {
      // User selected a branch at login
      const branch = await Branch.findById(branchId);
      if (!branch || !branch.isActive) return res.status(400).json({ message: 'Invalid branch selected' });
      activeBranch = branch._id;
    } else if (user.branch) {
      // User has a default branch assigned
      activeBranch = user.branch._id || user.branch;
    }

    // If user requires branch selection but none provided
    if (user.branchRequired && !activeBranch) {
      return res.status(400).json({ message: 'Branch selection is required for this user' });
    }

    // Update session tracking
    user.lastLogin    = new Date();
    user.lastSeen     = new Date();
    user.activeBranch = activeBranch;
    user.deviceInfo   = req.headers['user-agent'] || '';
    user.ipAddress    = req.ip || req.connection?.remoteAddress || '';
    await user.save();

    // Populate active branch info for response
    const populatedUser = await User.findById(user._id)
      .select('-password')
      .populate('branch')
      .populate('activeBranch');

    res.json({
      _id: populatedUser._id,
      name: populatedUser.name,
      role: populatedUser.role,
      permissions: populatedUser.permissions,
      menuAccess: populatedUser.menuAccess,
      branch: populatedUser.branch,
      activeBranch: populatedUser.activeBranch,
      branchRequired: populatedUser.branchRequired,
      token: genToken(populatedUser._id),
    });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// GET /api/auth/me — also updates lastSeen
router.get('/me', protect, async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(req.user._id, { lastSeen: new Date() }, { new: true })
      .select('-password')
      .populate('branch')
      .populate('activeBranch');
    res.json(user);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// GET /api/auth/branches — public: fetch branches for login dropdown
router.get('/branches', async (req, res) => {
  try {
    const branches = await Branch.find({ isActive: true }).select('name code').sort({ code: 1 });
    res.json(branches);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// GET /api/auth/sessions — root & developer only: who is logged in
router.get('/sessions', protect, async (req, res) => {
  if (!['root', 'developer'].includes(req.user.role)) return res.status(403).json({ message: 'Developer access only' });
  try {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
    const sessions = await User.find({ lastSeen: { $gte: fiveMinAgo } })
      .select('name fullName employeeId role lastLogin lastSeen deviceInfo ipAddress activeBranch')
      .populate('activeBranch');
    res.json(sessions);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// POST /api/auth/seed
router.post('/seed', async (req, res) => {
  try {
    const allPerms = { allowDuplicateBill:true, allowLastBill:true, allowBillCancel:true, allowEditBill:true, allowBillDiscount:true, allowReduction:true };
    const limitedPerms = { allowDuplicateBill:false, allowLastBill:true, allowBillCancel:false, allowEditBill:false, allowBillDiscount:false, allowReduction:false };
    const minPerms = { allowDuplicateBill:false, allowLastBill:false, allowBillCancel:false, allowEditBill:false, allowBillDiscount:false, allowReduction:false };

    // ── Global System Users (branch = null) ──
    const globalUsers = [
      // Developers (Full technical access + devices + options)
      { name:'ROOT', fullName: 'Super Root', employeeId: 'EMP001', password:'none', role:'root', branch: null, branchRequired: false,
        permissions: allPerms, menuAccess:['all'] },
      { name:'DEVELOPER', fullName: 'System Developer', employeeId: 'EMP002', password:'none', role:'developer', branch: null, branchRequired: false,
        permissions: allPerms, menuAccess:['all'] },
      // Restaurant Owners (Head & Admin — full restaurant operations, billing, inventory, reports, staff management)
      { name:'HEAD', fullName: 'Restaurant Head', employeeId: 'EMP003', password:'none', role:'head', branch: null, branchRequired: false,
        permissions: allPerms, menuAccess:['dashboard','billing','master','departments','inventory','reports','users'] },
      { name:'ADMIN', fullName: 'Restaurant Owner', employeeId: 'EMP004', password:'none', role:'admin', branch: null, branchRequired: false,
        permissions: allPerms, menuAccess:['dashboard','billing','master','departments','inventory','reports','users'] },
    ];

    const created = [];
    const updated = [];

    // Create or update global users
    for (const d of globalUsers) {
      const exists = await User.findOne({ name: d.name });
      if (!exists) {
        await User.create(d);
        created.push(d.name);
      } else {
        // Update existing user's role, branch, permissions
        exists.role = d.role;
        exists.branch = d.branch;
        exists.branchRequired = d.branchRequired;
        exists.permissions = d.permissions;
        exists.menuAccess = d.menuAccess;
        exists.password = d.password; // Will be hashed by pre-save hook
        // Reset account lock fields
        exists.isLocked = false;
        exists.failedLoginAttempts = 0;
        exists.lockedAt = null;
        exists.lockReason = null;
        await exists.save();
        updated.push(d.name);
      }
    }

    // ── Branch-level users ──
    // Query ALL branches (not just isActive=true, in case field is missing)
    const branches = await Branch.find({ isActive: { $ne: false } }).sort({ code: 1 });

    for (const branch of branches) {
      const bKey = `B${branch.code}`;
      const branchPw = `branch${branch.code}`;

      const branchUsers = [
        // Branch Admin (Manager) — manages this branch only
        { name:`${bKey}_ADMIN`,   password: branchPw, role:'branch_admin', branch: branch._id, branchRequired: true,
          permissions: allPerms, menuAccess:['dashboard','billing','master','departments','reports','users'] },
        // Cashier — billing + payments
        { name:`${bKey}_CASHIER`, password: branchPw, role:'cashier', branch: branch._id, branchRequired: true,
          permissions: limitedPerms, menuAccess:['billing'] },
        // Waiter — billing + orders + tables
        { name:`${bKey}_WAITER`,  password: branchPw, role:'waiter', branch: branch._id, branchRequired: true,
          permissions: minPerms, menuAccess:['billing'] },
        // Sales — billing + view sales data
        { name:`${bKey}_SALES`,   password: branchPw, role:'sales', branch: branch._id, branchRequired: true,
          permissions: limitedPerms, menuAccess:['billing','reports'] },
      ];

      for (const d of branchUsers) {
        const exists = await User.findOne({ name: d.name });
        if (!exists) {
          await User.create(d);
          created.push(`${d.name} (${branch.name})`);
        } else {
          exists.role = d.role;
          exists.branch = d.branch;
          exists.branchRequired = d.branchRequired;
          exists.permissions = d.permissions;
          exists.menuAccess = d.menuAccess;
          exists.password = d.password;
          await exists.save();
          updated.push(`${d.name} (${branch.name})`);
        }
      }
    }

    // Remove old SALES user if it exists (replaced by branch-specific ones)
    await User.deleteOne({ name: 'SALES', branch: null });

    // Migrate any legacy 'head' role to 'branch_admin'
    await User.updateMany({ role: 'head' }, { $set: { role: 'branch_admin' } });

    const parts = [];
    if (created.length) parts.push(`Created: ${created.join(', ')}`);
    if (updated.length) parts.push(`Updated: ${updated.join(', ')}`);
    if (!parts.length) parts.push('All users already exist');

    res.json({
      message: parts.join(' | '),
      created,
      updated,
      branchesFound: branches.length,
    });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

module.exports = router;
