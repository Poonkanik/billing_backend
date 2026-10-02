const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const mongoURI = process.env.MONGODB_URI || process.env.MONGO_URL || process.env.MONGO_PRIVATE_URL;
    if (!mongoURI) {
      throw new Error('No MongoDB connection string found. Please set MONGODB_URI in your Render Environment variables.');
    }

    if (mongoURI.includes('<db_password>') || mongoURI.includes('<password>')) {
      throw new Error("MONGODB_URI contains the placeholder '<db_password>'! Please replace '<db_password>' with your real MongoDB user password in Render Dashboard -> Environment.");
    }

    // Check if unencoded '@' in password caused multiple '@' delimiters
    const atMatches = (mongoURI.match(/@/g) || []).length;
    if (atMatches > 1) {
      throw new Error("MONGODB_URI contains an unescaped '@' symbol in the password! MongoDB connection strings break if the password contains '@'. Please change your MongoDB Atlas database user password to not contain '@' (or encode it as %40).");
    }

    const isCloudEnv = process.env.RENDER === 'true' || process.env.NODE_ENV === 'production';
    if (isCloudEnv && (mongoURI.includes('127.0.0.1') || mongoURI.includes('localhost'))) {
      throw new Error("MONGODB_URI is still set to localhost (127.0.0.1)! Go to Render Dashboard -> Environment tab and add MONGODB_URI with your MongoDB Atlas connection string.");
    }

    const maskedURI = mongoURI.replace(/:([^@]+)@/, ':****@');
    console.log(`📡 Connecting to MongoDB: ${maskedURI}`);
    const conn = await mongoose.connect(mongoURI);
    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);

    // Auto-seed initial data (Company, Branch, default users) if DB is empty
    await seedInitialDataIfEmpty();
  } catch (error) {
    console.error(`❌ MongoDB Error: ${error.message}`);
    process.exit(1);
  }
};

const seedInitialDataIfEmpty = async () => {
  try {
    const User = require('../models/User');
    const Branch = require('../models/Branch');
    const Company = require('../models/Company');

    const userCount = await User.countDocuments();
    if (userCount === 0) {
      console.log('🌱 Empty database detected, initializing default company, branch, and users...');
      let company = await Company.findOne();
      if (!company) {
        company = await Company.create({
          code: 1,
          name: 'RestoPOS Restaurant',
          address1: 'Main Street',
          phone: '1234567890',
          email: 'admin@restopos.com',
        });
      }

      let branch = await Branch.findOne();
      if (!branch) {
        branch = await Branch.create({
          code: 1,
          name: 'Main Branch',
          company: company._id,
          address1: 'Main Street',
          phone: '1234567890',
          isActive: true,
        });
      }

      const allPerms = { allowDuplicateBill: true, allowLastBill: true, allowBillCancel: true, allowEditBill: true, allowBillDiscount: true, allowReduction: true };
      const limitedPerms = { allowDuplicateBill: false, allowLastBill: true, allowBillCancel: false, allowEditBill: false, allowBillDiscount: false, allowReduction: false };

      await User.create([
        { name: 'ROOT', fullName: 'Super Root', employeeId: 'EMP001', password: 'none', role: 'root', branch: null, branchRequired: false, permissions: allPerms, menuAccess: ['all'] },
        { name: 'ADMIN', fullName: 'Restaurant Owner', employeeId: 'EMP002', password: 'none', role: 'admin', branch: null, branchRequired: false, permissions: allPerms, menuAccess: ['dashboard','billing','master','departments','inventory','reports','users'] },
        { name: 'DEVELOPER', fullName: 'Developer', employeeId: 'EMP003', password: 'none', role: 'developer', branch: null, branchRequired: false, permissions: allPerms, menuAccess: ['all'] },
        { name: 'B1_CASHIER', fullName: 'Cashier 1', employeeId: 'EMP004', password: 'branch1', role: 'cashier', branch: branch._id, branchRequired: true, permissions: limitedPerms, menuAccess: ['billing'] }
      ]);
      console.log('✅ Default users created (ROOT/none, ADMIN/none, DEVELOPER/none, B1_CASHIER/branch1)');
    }
  } catch (err) {
    console.error('Warning during auto-seed:', err.message);
  }
};

module.exports = connectDB;

