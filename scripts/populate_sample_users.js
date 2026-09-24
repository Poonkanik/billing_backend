const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const User = require('../models/User');

async function updateAllEmployeeIds() {
  await connectDB();
  console.log('Connected to MongoDB...');

  try {
    const sampleProfiles = [
      { name: 'POONKANI', fullName: 'Poonkani K1', email: 'poonkanikannan@gmail.com', employeeId: 'EMP001', designation: 'Sales and Support', department: 'Service & Billing', phone: '+919900713234' },
      { name: 'HARINI', fullName: 'Harini Priya', email: 'harinipriyarameshp@gmail.com', employeeId: 'EMP002', designation: 'Billing Cashier', department: 'Counter', phone: '+919842112233' },
      { name: 'ALAGU', fullName: 'ALAGU PARVATHI K', email: 'parvathialagu6@gmail.com', employeeId: 'EMP003', designation: 'Floor Incharge', department: 'Dining Area', phone: '+919786554433' },
      { name: 'RAJ', fullName: 'Raj Karthik', email: 'rajkarthick@eqnservices.com', employeeId: 'EMP004', designation: 'Branch Manager', department: 'Management', phone: '+919443221100' },
      { name: 'YOHA', fullName: 'Yoha', email: 'yoganathan@eqnservices.com', employeeId: 'EMP005', designation: 'System Administrator', department: 'Administration', phone: '+919003344556' },
    ];

    for (const p of sampleProfiles) {
      let u = await User.findOne({ $or: [{ name: p.name }, { email: p.email }] });
      if (u) {
        u.fullName = p.fullName;
        u.email = p.email;
        u.employeeId = p.employeeId;
        u.designation = p.designation;
        u.department = p.department;
        u.phone = p.phone;
        await u.save();
        console.log(`Updated user: ${p.fullName} -> ${p.employeeId}`);
      }
    }

    // For any other users without EMP format, update them too
    const allUsers = await User.find();
    let counter = 1;
    for (const u of allUsers) {
      if (!u.employeeId || u.employeeId.startsWith('EQ-')) {
        u.employeeId = `EMP${String(counter).padStart(3, '0')}`;
        await u.save();
        console.log(`Updated user: ${u.name} -> ${u.employeeId}`);
      }
      counter++;
    }

    console.log('All employee IDs updated to EMPxxx successfully!');
  } catch (err) {
    console.error('Error updating users:', err);
  } finally {
    await mongoose.disconnect();
  }
}

updateAllEmployeeIds();
