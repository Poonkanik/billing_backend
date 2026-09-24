const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { protect } = require('../middleware/auth');
const bcrypt = require('bcryptjs');

// Roles allowed to access user management
const MANAGEMENT_ROLES = ['root', 'developer', 'admin', 'head', 'branch_admin'];
const DEV_ROLES = ['root', 'developer'];
const OWNER_ROLES = ['root', 'developer', 'admin', 'head'];

// Helper: log activity (skips root/developer user actions)
const logActivity = async (actor, action, targetUser, details = '') => {
  if (DEV_ROLES.includes(actor.role)) return;
  console.log(`[ACTIVITY] ${new Date().toISOString()} | ${actor.name} (${actor.role}) | ${action} | target: ${targetUser || 'N/A'} | ${details}`);
};

// GET all users — search, role, status, branch filtered
router.get('/', protect, async (req, res) => {
  try {
    const callerRole = req.user.role;

    if (!MANAGEMENT_ROLES.includes(callerRole)) {
      return res.status(403).json({ message: 'Access denied. Only Management users can view users.' });
    }

    const { search, role, status, branch } = req.query;
    const query = {};

    // If caller is NOT a Developer (i.e. Restaurant Owner 'head'/'admin' or 'branch_admin'),
    // HIDE all Root and Developer user accounts!
    if (!DEV_ROLES.includes(callerRole)) {
      query.role = { $nin: ['root', 'developer'] };
    }

    // Role filter
    if (role && role !== 'all') {
      query.role = role;
    }

    // Status filter
    if (status && status !== 'all') {
      if (status === 'locked') {
        query.isLocked = true;
      } else {
        query.isActive = status === 'active';
      }
    }

    // Branch filter
    if (branch && branch !== 'all') {
      query.branch = branch;
    }

    // Branch admins can only see users in their own branch (plus global admin/head users)
    if (callerRole === 'branch_admin' && req.user.branch) {
      const callerBranchId = req.user.branch._id || req.user.branch;
      query.$or = [
        { branch: callerBranchId },
        { branch: null, role: { $in: ['admin', 'head'] } }
      ];
      delete query.role;
    }

    // Search query filter across name, fullName, email, employeeId, phone
    if (search && search.trim()) {
      const s = search.trim();
      const searchConditions = [
        { name: { $regex: s, $options: 'i' } },
        { fullName: { $regex: s, $options: 'i' } },
        { email: { $regex: s, $options: 'i' } },
        { employeeId: { $regex: s, $options: 'i' } },
        { phone: { $regex: s, $options: 'i' } },
      ];
      if (query.$or) {
        query.$and = [{ $or: searchConditions }];
      } else {
        query.$or = searchConditions;
      }
    }

    const users = await User.find(query)
      .select('-password')
      .populate('branch')
      .sort({ createdAt: -1, name: 1 })
      .lean();


    res.json({ users, total: users.length });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/users/branch-overview
router.get('/branch-overview', protect, async (req, res) => {
  try {
    const callerRole = req.user.role;
    if (!MANAGEMENT_ROLES.includes(callerRole)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const query = { isActive: true };
    if (!DEV_ROLES.includes(callerRole)) {
      query.role = { $nin: ['root', 'developer'] };
    }

    if (callerRole === 'branch_admin' && req.user.branch) {
      const callerBranchId = req.user.branch._id || req.user.branch;
      query.$or = [
        { branch: callerBranchId },
        { branch: null, role: { $in: ['admin', 'head'] } }
      ];
      delete query.role;
    }

    const users = await User.find(query)
      .select('name fullName employeeId email phone designation role branch isLocked isActive')
      .populate('branch', 'name')
      .sort({ role: 1, name: 1 });

    res.json(users);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/users/menu-access
router.get('/menu-access', protect, async (req, res) => {
  try {
    const callerRole = req.user.role;
    if (!MANAGEMENT_ROLES.includes(callerRole)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const query = {};
    if (!DEV_ROLES.includes(callerRole)) {
      query.role = { $nin: ['root', 'developer'] };
    }

    if (callerRole === 'branch_admin' && req.user.branch) {
      const callerBranchId = req.user.branch._id || req.user.branch;
      query.$or = [
        { branch: callerBranchId },
        { branch: null, role: { $in: ['admin', 'head'] } }
      ];
      delete query.role;
    }

    const users = await User.find(query)
      .select('name fullName employeeId role branch menuAccess isActive isLocked lastLogin createdAt permissions')
      .populate('branch', 'name')
      .sort({ role: 1, name: 1 });

    res.json(users);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/users/menu-access/bulk
router.put('/menu-access/bulk', protect, async (req, res) => {
  try {
    const callerRole = req.user.role;
    if (!MANAGEMENT_ROLES.includes(callerRole)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const { updates } = req.body;
    if (!Array.isArray(updates) || updates.length === 0) {
      return res.status(400).json({ message: 'No updates provided' });
    }

    const results = [];
    for (const { userId, menuAccess } of updates) {
      if (!userId || !Array.isArray(menuAccess)) continue;
      const targetUser = await User.findById(userId);
      if (!targetUser) continue;
      if (DEV_ROLES.includes(targetUser.role) && !DEV_ROLES.includes(callerRole)) continue;

      if (callerRole === 'branch_admin' && req.user.branch) {
        const callerBranchId = (req.user.branch._id || req.user.branch).toString();
        const targetBranchId = targetUser.branch?.toString();
        if (targetBranchId !== callerBranchId) continue;
      }

      await User.findByIdAndUpdate(userId, { menuAccess });
      results.push(userId);
    }

    await logActivity(req.user, 'BULK_UPDATE_MENU_ACCESS', null, `Updated ${results.length} users`);
    res.json({ message: `Menu access updated for ${results.length} user(s)`, updated: results.length });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET single user
router.get('/:id', protect, async (req, res) => {
  try {
    if (!MANAGEMENT_ROLES.includes(req.user.role)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const user = await User.findById(req.params.id).select('-password').populate('branch');
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (DEV_ROLES.includes(user.role) && !DEV_ROLES.includes(req.user.role)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    res.json(user);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST create user
router.post('/', protect, async (req, res) => {
  try {
    const callerRole = req.user.role;
    if (!MANAGEMENT_ROLES.includes(callerRole)) {
      return res.status(403).json({ message: 'Insufficient permissions. Only Management users can add users.' });
    }

    // Only developers can create root or developer accounts
    if (DEV_ROLES.includes(req.body.role) && !DEV_ROLES.includes(callerRole)) {
      return res.status(403).json({ message: 'Only Root or Developer can create developer accounts' });
    }

    // Only Root, Developer, or Admin/Head can create Admin/Head/Branch_Admin users
    if (['admin', 'head', 'branch_admin'].includes(req.body.role) && !OWNER_ROLES.includes(callerRole)) {
      return res.status(403).json({ message: 'Only Restaurant Owners or Developers can assign managerial roles' });
    }

    const data = { ...req.body };
    if (!data.name && data.fullName) {
      data.name = data.fullName.toUpperCase().replace(/\s+/g, '_');
    }
    if (!data.fullName && data.name) {
      data.fullName = data.name;
    }
    if (data.name) {
      data.name = data.name.toUpperCase().trim();
    }

    if (OWNER_ROLES.includes(data.role)) {
      data.branch = null;
      data.branchRequired = false;
    }

    if (callerRole === 'branch_admin' && req.user.branch) {
      data.branch = req.user.branch._id || req.user.branch;
    }

    const user = await User.create(data);
    const { password, ...userData } = user.toObject();

    await logActivity(req.user, 'CREATE_USER', user.name, `role: ${user.role}`);
    res.status(201).json(userData);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// PUT update user
router.put('/:id', protect, async (req, res) => {
  try {
    const callerRole = req.user.role;
    if (!MANAGEMENT_ROLES.includes(callerRole)) {
      return res.status(403).json({ message: 'Insufficient permissions.' });
    }

    const targetUser = await User.findById(req.params.id);
    if (!targetUser) return res.status(404).json({ message: 'User not found' });

    if (DEV_ROLES.includes(targetUser.role) && !DEV_ROLES.includes(callerRole)) {
      return res.status(403).json({ message: 'Cannot modify developer accounts' });
    }

    if (DEV_ROLES.includes(req.body.role) && !DEV_ROLES.includes(callerRole)) {
      return res.status(403).json({ message: 'Only Root or Developer can assign developer roles' });
    }

    const { password, ...rest } = req.body;
    const update = { ...rest };

    if (update.name) {
      update.name = update.name.toUpperCase().trim();
    }

    const effectiveRole = update.role || targetUser.role;
    if (OWNER_ROLES.includes(effectiveRole)) {
      update.branch = null;
      update.branchRequired = false;
    }

    if (callerRole === 'branch_admin' && req.user.branch) {
      const callerBranchId = (req.user.branch._id || req.user.branch).toString();
      const targetBranchId = targetUser.branch?.toString();
      if (targetBranchId !== callerBranchId) {
        return res.status(403).json({ message: 'You can only modify users in your own branch' });
      }
    }

    if (password && password.trim()) {
      update.password = await bcrypt.hash(password.trim(), 10);
    }

    const user = await User.findByIdAndUpdate(req.params.id, update, { new: true })
      .select('-password')
      .populate('branch');

    await logActivity(req.user, 'UPDATE_USER', user.name, `role: ${user.role}`);
    res.json(user);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// DELETE user
router.delete('/:id', protect, async (req, res) => {
  try {
    const callerRole = req.user.role;
    if (!MANAGEMENT_ROLES.includes(callerRole)) {
      return res.status(403).json({ message: 'Insufficient permissions.' });
    }

    const targetUser = await User.findById(req.params.id);
    if (!targetUser) return res.status(404).json({ message: 'User not found' });

    if (DEV_ROLES.includes(targetUser.role) && !DEV_ROLES.includes(callerRole)) {
      return res.status(403).json({ message: 'Cannot delete developer accounts' });
    }

    if (callerRole === 'branch_admin' && req.user.branch) {
      const callerBranchId = (req.user.branch._id || req.user.branch).toString();
      const targetBranchId = targetUser.branch?.toString();
      if (targetBranchId !== callerBranchId) {
        return res.status(403).json({ message: 'You can only delete users in your own branch' });
      }
    }

    await User.findByIdAndDelete(req.params.id);
    await logActivity(req.user, 'DELETE_USER', targetUser.name, `role: ${targetUser.role}`);
    res.json({ message: 'User deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/users/locked — fetch all locked users
router.get('/locked', protect, async (req, res) => {
  try {
    const callerRole = req.user.role;
    if (!OWNER_ROLES.includes(callerRole)) {
      return res.status(403).json({ message: 'Access denied.' });
    }

    const query = { isLocked: true };
    if (!DEV_ROLES.includes(callerRole)) {
      query.role = { $nin: ['root', 'developer'] };
    }

    const locked = await User.find(query)
      .select('name fullName employeeId email phone role branch failedLoginAttempts lockedAt lockReason')
      .populate('branch', 'name')
      .sort({ lockedAt: -1 });
    res.json(locked);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/users/:id/lock — manually lock a user account
router.put('/:id/lock', protect, async (req, res) => {
  try {
    const callerRole = req.user.role;
    if (!OWNER_ROLES.includes(callerRole)) {
      return res.status(403).json({ message: 'Access denied. Only Owners and Developers can lock accounts.' });
    }

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (DEV_ROLES.includes(user.role) && !DEV_ROLES.includes(callerRole)) {
      return res.status(403).json({ message: 'Cannot lock a developer account' });
    }

    user.isLocked = true;
    user.lockedAt = new Date();
    user.lockReason = req.body?.reason || `Manually locked by ${req.user.name}`;
    await user.save();

    await logActivity(req.user, 'LOCK_USER', user.name, `Locked account: ${user.lockReason}`);
    const populatedUser = await User.findById(user._id).select('-password').populate('branch');

    res.json({
      message: `Account for ${user.fullName || user.name} has been locked successfully`,
      user: populatedUser,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/users/:id/unlock — release / unlock a locked user
router.put('/:id/unlock', protect, async (req, res) => {
  try {
    const callerRole = req.user.role;
    if (!OWNER_ROLES.includes(callerRole)) {
      return res.status(403).json({ message: 'Access denied. Only Owners and Developers can release locked accounts.' });
    }
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (DEV_ROLES.includes(user.role) && !DEV_ROLES.includes(callerRole)) {
      return res.status(403).json({ message: 'Only Developer can release a Developer account' });
    }

    user.isLocked = false;
    user.failedLoginAttempts = 0;
    user.lockedAt = null;
    user.lockReason = null;
    await user.save();

    await logActivity(req.user, 'UNLOCK_USER', user.name, `Released/unlocked locked account`);
    const populatedUser = await User.findById(user._id).select('-password').populate('branch');

    res.json({
      message: `Account for ${user.fullName || user.name} has been released/unlocked successfully`,
      user: populatedUser,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
