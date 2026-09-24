const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mongoose = require('mongoose');
const connectDB = require('../config/db');
require('../models/Branch');
const User = require('../models/User');

async function fixUsers() {
  await connectDB();
  const users = await User.find();
  let count = 1;
  for (const u of users) {
    let changed = false;
    if (!u.fullName) {
      u.fullName = u.name;
      changed = true;
    }
    if (!u.employeeId || u.employeeId.startsWith('EQ-')) {
      u.employeeId = `EMP${String(count).padStart(3, '0')}`;
      changed = true;
    }
    if (changed) {
      await u.save();
      console.log(`Updated user: ${u.name} -> fullName: "${u.fullName}", employeeId: "${u.employeeId}"`);
    }
    count++;
  }
  console.log('User repair completed successfully!');
  await mongoose.disconnect();
}

fixUsers();
