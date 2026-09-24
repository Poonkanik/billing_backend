const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mongoose = require('mongoose');
const connectDB = require('../config/db');
require('../models/Branch');
const User = require('../models/User');

async function checkRecentUsers() {
  await connectDB();
  const users = await User.find().sort({ createdAt: -1 }).limit(10).populate('branch');
  console.log(`Total users in DB: ${await User.countDocuments()}`);
  console.log('Latest 10 users:');
  users.forEach(u => {
    console.log({
      id: u._id,
      name: u.name,
      fullName: u.fullName,
      employeeId: u.employeeId,
      role: u.role,
      branch: u.branch ? u.branch.name : null,
      isActive: u.isActive,
      isLocked: u.isLocked,
      createdAt: u.createdAt,
    });
  });
  await mongoose.disconnect();
}

checkRecentUsers();
