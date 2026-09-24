const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const User = require('../models/User');

async function seedSystemUsers() {
  await connectDB();
  console.log('Connected to MongoDB for system user seeding...');

  try {
    const allPerms = {
      allowDuplicateBill: true,
      allowLastBill: true,
      allowBillCancel: true,
      allowEditBill: true,
      allowBillDiscount: true,
      allowReduction: true,
    };

    const defaultUsers = [
      // 1. Root Developer
      {
        name: 'ROOT',
        fullName: 'Super Root',
        employeeId: 'EMP001',
        email: 'root@resto.pos',
        password: 'none',
        role: 'root',
        designation: 'Lead Architect',
        department: 'Engineering',
        branch: null,
        branchRequired: false,
        permissions: allPerms,
        menuAccess: ['all'],
        isActive: true,
        isLocked: false,
      },
      // 2. Developer
      {
        name: 'DEVELOPER',
        fullName: 'System Developer',
        employeeId: 'EMP002',
        email: 'developer@resto.pos',
        password: 'none',
        role: 'developer',
        designation: 'Software Developer',
        department: 'Engineering',
        branch: null,
        branchRequired: false,
        permissions: allPerms,
        menuAccess: ['all'],
        isActive: true,
        isLocked: false,
      },
      // 3. Head (Restaurant Owner)
      {
        name: 'HEAD',
        fullName: 'Restaurant Head',
        employeeId: 'EMP003',
        email: 'head@restaurant.com',
        password: 'none',
        role: 'head',
        designation: 'Managing Director / Owner',
        department: 'Executive',
        branch: null,
        branchRequired: false,
        permissions: allPerms,
        menuAccess: ['dashboard', 'billing', 'master', 'departments', 'inventory', 'reports', 'users'],
        isActive: true,
        isLocked: false,
      },
      // 4. Admin (Restaurant Administrator)
      {
        name: 'ADMIN',
        fullName: 'Restaurant Owner',
        employeeId: 'EMP004',
        email: 'admin@restaurant.com',
        password: 'none',
        role: 'admin',
        designation: 'General Manager',
        department: 'Operations',
        branch: null,
        branchRequired: false,
        permissions: allPerms,
        menuAccess: ['dashboard', 'billing', 'master', 'departments', 'inventory', 'reports', 'users'],
        isActive: true,
        isLocked: false,
      },
    ];

    for (const u of defaultUsers) {
      let existing = await User.findOne({ name: u.name });
      if (existing) {
        existing.fullName = u.fullName;
        existing.employeeId = u.employeeId;
        existing.email = u.email;
        existing.role = u.role;
        existing.designation = u.designation;
        existing.department = u.department;
        existing.branch = u.branch;
        existing.branchRequired = u.branchRequired;
        existing.permissions = u.permissions;
        existing.menuAccess = u.menuAccess;
        existing.isActive = u.isActive;
        existing.isLocked = u.isLocked;
        existing.failedLoginAttempts = 0;
        await existing.save();
        console.log(`✅ Updated default user: ${u.name} (${u.role})`);
      } else {
        await User.create(u);
        console.log(`✅ Created default user: ${u.name} (${u.role})`);
      }
    }

    console.log('--- Default Users Seeding Complete ---');
  } catch (err) {
    console.error('Error seeding default users:', err);
  } finally {
    await mongoose.disconnect();
  }
}

seedSystemUsers();
