const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const axios = require('axios');
require('../models/Branch');
const User = require('../models/User');

async function testGetUsers() {
  const root = await User.findOne({ name: 'ROOT' });
  const tokenRoot = jwt.sign({ id: root._id }, process.env.JWT_SECRET, { expiresIn: '12h' });

  try {
    const resRoot = await axios.get('http://localhost:5001/api/users', {
      headers: { Authorization: `Bearer ${tokenRoot}` }
    });
    console.log(`ROOT received ${resRoot.data.users?.length} users (total: ${resRoot.data.total})`);
    resRoot.data.users.forEach(u => console.log(` - ${u.name} | ${u.fullName} | ${u.employeeId} | ${u.role} | branch: ${u.branch?.name}`));
  } catch (err) {
    console.error('ROOT error status:', err.response?.status);
    console.error('ROOT error data:', err.response?.data);
  }
  process.exit(0);
}

const connectDB = require('../config/db');
connectDB().then(testGetUsers);
