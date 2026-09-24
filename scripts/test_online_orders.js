const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const connectDB = require('../config/db');
require('../models/Branch');
const User = require('../models/User');

async function testOnlineOrders() {
  await connectDB();
  const root = await User.findOne({ role: { $in: ['root', 'developer', 'admin'] } });
  if (!root) {
    console.error('No root/admin user found');
    process.exit(1);
  }

  const token = jwt.sign({ id: root._id }, process.env.JWT_SECRET, { expiresIn: '12h' });
  const baseURL = 'http://localhost:5001/api';
  const authHeaders = { Authorization: `Bearer ${token}` };

  try {
    console.log(`1. Testing as User: ${root.name} (${root.role})...`);

    console.log('\n2. Fetching platform status (Swiggy & Zomato)...');
    const platRes = await axios.get(`${baseURL}/online-orders/platforms/status`, { headers: authHeaders });
    console.log('✅ Swiggy Online:', platRes.data.swiggy.isOnline, '| Zomato Online:', platRes.data.zomato.isOnline);

    console.log('\n3. Simulating incoming Swiggy Order...');
    const swiggySim = await axios.post(`${baseURL}/online-orders/simulate`, { platform: 'swiggy' }, { headers: authHeaders });
    console.log('✅ Swiggy Order Created:', swiggySim.data.orderId, '| Items:', swiggySim.data.items.length, '| Total: ₹' + swiggySim.data.netAmount);

    console.log('\n4. Simulating incoming Zomato Order...');
    const zomatoSim = await axios.post(`${baseURL}/online-orders/simulate`, { platform: 'zomato' }, { headers: authHeaders });
    console.log('✅ Zomato Order Created:', zomatoSim.data.orderId, '| Items:', zomatoSim.data.items.length, '| Total: ₹' + zomatoSim.data.netAmount);

    console.log('\n5. Updating Swiggy order to ACCEPTED and FOOD_READY...');
    const updateRes = await axios.put(`${baseURL}/online-orders/${swiggySim.data._id}/status`, { status: 'FOOD_READY' }, { headers: authHeaders });
    console.log('✅ Swiggy Status updated:', updateRes.data.status);

    console.log('\n6. Converting Zomato order to official POS Bill...');
    const convertRes = await axios.post(`${baseURL}/online-orders/${zomatoSim.data._id}/convert-to-bill`, {}, { headers: authHeaders });
    console.log('✅ POS Bill Generated:', convertRes.data.bill?.billNo, '| Amount: ₹' + convertRes.data.bill?.netAmount);

    console.log('\n7. Fetching aggregate stats...');
    const statsRes = await axios.get(`${baseURL}/online-orders/stats`, { headers: authHeaders });
    console.log('✅ Today Total Orders:', statsRes.data.totalOrders, '| Total Revenue: ₹' + statsRes.data.totalRevenue);

    console.log('\n🎉 ALL ONLINE ORDERS TESTS PASSED SUCCESSFULLY!');
  } catch (err) {
    console.error('❌ Test failed:', err.response?.data || err.message);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

testOnlineOrders();
