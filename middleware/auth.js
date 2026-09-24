const jwt = require('jsonwebtoken');
const User = require('../models/User');

const protect = async (req, res, next) => {
  let token;
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      token = req.headers.authorization.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = await User.findById(decoded.id).select('-password').populate('branch').populate('activeBranch');
      next();
    } catch (error) {
      return res.status(401).json({ message: 'Not authorized, token failed' });
    }
  }
  if (!token) return res.status(401).json({ message: 'Not authorized, no token' });
};

/**
 * Authorize specific roles.
 * Usage: router.get('/admin-only', protect, authorize('root', 'admin'), handler)
 */
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Not authorized' });
    }
    // Root & Developer always pass
    if (['root', 'developer'].includes(req.user.role)) return next();
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        message: `Access denied. Required role: ${roles.join(' or ')}. Your role: ${req.user.role}`,
      });
    }
    next();
  };
};

/**
 * Get branch filter for database queries.
 * - Root/Developer/Admin/Head: no filter (see all branches)
 * - Branch-specific users: filter to their active/assigned branch
 * Returns an object like { branch: ObjectId } or {} (no filter)
 */
const getBranchFilter = (user) => {
  if (!user) return {};
  // Root, Developer, Admin, Head see everything
  if (['root', 'developer', 'admin', 'head'].includes(user.role)) return {};
  // Branch-locked users: use activeBranch (set at login) or assigned branch
  const branchId = user.activeBranch?._id || user.activeBranch || user.branch?._id || user.branch;
  if (branchId) return { branch: branchId };
  // No branch assigned — return impossible filter to prevent data leakage
  return { branch: null };
};

module.exports = { protect, authorize, getBranchFilter };
