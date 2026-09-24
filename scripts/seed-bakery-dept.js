/**
 * Seed Script for Department-Based Bakery Billing
 * 
 * Creates sample departments and products with measurement types
 * Run with: npm run seed-bakery-dept
 * 
 * This script creates:
 * 1. Five bakery departments (Sweets, Snacks, Bakery, Ice Cream, Beverages)
 * 2. Sample products in each department with proper measurement types and pricing
 * 3. All with proper tax setup and barcode support
 */

const mongoose = require('mongoose');
const Department = require('../models/Department');
const Product = require('../models/Product');
require('dotenv').config({ path: './.env' });

const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/billing';

async function seedBakeryData() {
  try {
    // Connect to MongoDB
    await mongoose.connect(mongoUri);
    console.log('✓ Connected to MongoDB');

    // Delete existing departments and products
    await Department.deleteMany({});
    await Product.deleteMany({});
    console.log('✓ Cleaned existing data');

    // Create departments
    const departments = await Department.insertMany([
      {
        code: 1,
        name: 'Sweets',
        quantityFormat: 'kg',
        isActive: true,
      },
      {
        code: 2,
        name: 'Snacks',
        quantityFormat: 'kg',
        isActive: true,
      },
      {
        code: 3,
        name: 'Bakery',
        quantityFormat: 'pcs',
        isActive: true,
      },
      {
        code: 4,
        name: 'Ice Cream',
        quantityFormat: 'ml',
        isActive: true,
      },
      {
        code: 5,
        name: 'Beverages',
        quantityFormat: 'L',
        isActive: true,
      },
    ]);

    console.log('✓ Created departments:', departments.map(d => d.name).join(', '));

    // Create products with measurement types
    const products = [
      // ═══════════════════════════════════════════════════════════════════════
      // SWEETS (Weight-based: KG/GM)
      // ═══════════════════════════════════════════════════════════════════════
      {
        code: 'SWT001',
        name: 'Laddu (Boondi)',
        department: departments[0]._id,
        departmentName: 'Sweets',
        groupName: 'Sweets',
        measurementType: 'KG/GM',
        baseMeasurement: 'KG',
        pricePerUnit: 300,
        rate: 300,
        barcode: 'BAR001001',
        tax: 5,
        cgst: 2.5,
        sgst: 2.5,
        flags: { active: true, maintainStock: false, fastMoving: true },
      },
      {
        code: 'SWT002',
        name: 'Mysore Pak',
        department: departments[0]._id,
        departmentName: 'Sweets',
        groupName: 'Sweets',
        measurementType: 'KG/GM',
        baseMeasurement: 'KG',
        pricePerUnit: 400,
        rate: 400,
        barcode: 'BAR001002',
        tax: 5,
        cgst: 2.5,
        sgst: 2.5,
        flags: { active: true, maintainStock: false, fastMoving: true },
      },
      {
        code: 'SWT003',
        name: 'Halwa',
        department: departments[0]._id,
        departmentName: 'Sweets',
        groupName: 'Sweets',
        measurementType: 'KG/GM',
        baseMeasurement: 'KG',
        pricePerUnit: 350,
        rate: 350,
        barcode: 'BAR001003',
        tax: 5,
        cgst: 2.5,
        sgst: 2.5,
        flags: { active: true, maintainStock: false, fastMoving: true },
      },
      {
        code: 'SWT004',
        name: 'Gulab Jamun',
        department: departments[0]._id,
        departmentName: 'Sweets',
        groupName: 'Sweets',
        measurementType: 'KG/GM',
        baseMeasurement: 'KG',
        pricePerUnit: 280,
        rate: 280,
        barcode: 'BAR001004',
        tax: 5,
        cgst: 2.5,
        sgst: 2.5,
        flags: { active: true, maintainStock: false, fastMoving: true },
      },

      // ═══════════════════════════════════════════════════════════════════════
      // SNACKS (Weight-based: KG/GM)
      // ═══════════════════════════════════════════════════════════════════════
      {
        code: 'SNK001',
        name: 'Chips (Spicy)',
        department: departments[1]._id,
        departmentName: 'Snacks',
        groupName: 'Snacks',
        measurementType: 'KG/GM',
        baseMeasurement: 'KG',
        pricePerUnit: 250,
        rate: 250,
        barcode: 'BAR002001',
        tax: 5,
        cgst: 2.5,
        sgst: 2.5,
        flags: { active: true, maintainStock: false, fastMoving: true },
      },
      {
        code: 'SNK002',
        name: 'Popcorn',
        department: departments[1]._id,
        departmentName: 'Snacks',
        groupName: 'Snacks',
        measurementType: 'KG/GM',
        baseMeasurement: 'KG',
        pricePerUnit: 200,
        rate: 200,
        barcode: 'BAR002002',
        tax: 5,
        cgst: 2.5,
        sgst: 2.5,
        flags: { active: true, maintainStock: false, fastMoving: true },
      },
      {
        code: 'SNK003',
        name: 'Mixture',
        department: departments[1]._id,
        departmentName: 'Snacks',
        groupName: 'Snacks',
        measurementType: 'KG/GM',
        baseMeasurement: 'KG',
        pricePerUnit: 180,
        rate: 180,
        barcode: 'BAR002003',
        tax: 5,
        cgst: 2.5,
        sgst: 2.5,
        flags: { active: true, maintainStock: false, fastMoving: true },
      },

      // ═══════════════════════════════════════════════════════════════════════
      // BAKERY (Piece-based)
      // ═══════════════════════════════════════════════════════════════════════
      {
        code: 'BKR001',
        name: 'Bread (Sliced)',
        department: departments[2]._id,
        departmentName: 'Bakery',
        groupName: 'Bakery',
        measurementType: 'Piece',
        baseMeasurement: 'Piece',
        pricePerUnit: 50,
        rate: 50,
        barcode: 'BAR003001',
        tax: 5,
        cgst: 2.5,
        sgst: 2.5,
        flags: { active: true, maintainStock: false, fastMoving: true },
      },
      {
        code: 'BKR002',
        name: 'Croissant',
        department: departments[2]._id,
        departmentName: 'Bakery',
        groupName: 'Bakery',
        measurementType: 'Piece',
        baseMeasurement: 'Piece',
        pricePerUnit: 45,
        rate: 45,
        barcode: 'BAR003002',
        tax: 5,
        cgst: 2.5,
        sgst: 2.5,
        flags: { active: true, maintainStock: false, fastMoving: true },
      },
      {
        code: 'BKR003',
        name: 'Donut (Glazed)',
        department: departments[2]._id,
        departmentName: 'Bakery',
        groupName: 'Bakery',
        measurementType: 'Piece',
        baseMeasurement: 'Piece',
        pricePerUnit: 35,
        rate: 35,
        barcode: 'BAR003003',
        tax: 5,
        cgst: 2.5,
        sgst: 2.5,
        flags: { active: true, maintainStock: false, fastMoving: true },
      },
      {
        code: 'BKR004',
        name: 'Muffin (Chocolate)',
        department: departments[2]._id,
        departmentName: 'Bakery',
        groupName: 'Bakery',
        measurementType: 'Piece',
        baseMeasurement: 'Piece',
        pricePerUnit: 60,
        rate: 60,
        barcode: 'BAR003004',
        tax: 5,
        cgst: 2.5,
        sgst: 2.5,
        flags: { active: true, maintainStock: false, fastMoving: true },
      },

      // ═══════════════════════════════════════════════════════════════════════
      // ICE CREAM (Volume-based: Litre/ML)
      // ═══════════════════════════════════════════════════════════════════════
      {
        code: 'ICE001',
        name: 'Vanilla Ice Cream',
        department: departments[3]._id,
        departmentName: 'Ice Cream',
        groupName: 'Ice Cream',
        measurementType: 'Litre/ML',
        baseMeasurement: 'Litre',
        pricePerUnit: 500,
        rate: 500,
        barcode: 'BAR004001',
        tax: 5,
        cgst: 2.5,
        sgst: 2.5,
        flags: { active: true, maintainStock: false, fastMoving: true },
      },
      {
        code: 'ICE002',
        name: 'Chocolate Ice Cream',
        department: departments[3]._id,
        departmentName: 'Ice Cream',
        groupName: 'Ice Cream',
        measurementType: 'Litre/ML',
        baseMeasurement: 'Litre',
        pricePerUnit: 550,
        rate: 550,
        barcode: 'BAR004002',
        tax: 5,
        cgst: 2.5,
        sgst: 2.5,
        flags: { active: true, maintainStock: false, fastMoving: true },
      },
      {
        code: 'ICE003',
        name: 'Strawberry Ice Cream',
        department: departments[3]._id,
        departmentName: 'Ice Cream',
        groupName: 'Ice Cream',
        measurementType: 'Litre/ML',
        baseMeasurement: 'Litre',
        pricePerUnit: 500,
        rate: 500,
        barcode: 'BAR004003',
        tax: 5,
        cgst: 2.5,
        sgst: 2.5,
        flags: { active: true, maintainStock: false, fastMoving: true },
      },

      // ═══════════════════════════════════════════════════════════════════════
      // BEVERAGES (Volume-based: Litre/ML)
      // ═══════════════════════════════════════════════════════════════════════
      {
        code: 'BEV001',
        name: 'Orange Juice',
        department: departments[4]._id,
        departmentName: 'Beverages',
        groupName: 'Beverages',
        measurementType: 'Litre/ML',
        baseMeasurement: 'Litre',
        pricePerUnit: 80,
        rate: 80,
        barcode: 'BAR005001',
        tax: 5,
        cgst: 2.5,
        sgst: 2.5,
        flags: { active: true, maintainStock: false, fastMoving: true },
      },
      {
        code: 'BEV002',
        name: 'Apple Juice',
        department: departments[4]._id,
        departmentName: 'Beverages',
        groupName: 'Beverages',
        measurementType: 'Litre/ML',
        baseMeasurement: 'Litre',
        pricePerUnit: 100,
        rate: 100,
        barcode: 'BAR005002',
        tax: 5,
        cgst: 2.5,
        sgst: 2.5,
        flags: { active: true, maintainStock: false, fastMoving: true },
      },
      {
        code: 'BEV003',
        name: 'Lemon Water',
        department: departments[4]._id,
        departmentName: 'Beverages',
        groupName: 'Beverages',
        measurementType: 'Litre/ML',
        baseMeasurement: 'Litre',
        pricePerUnit: 30,
        rate: 30,
        barcode: 'BAR005003',
        tax: 5,
        cgst: 2.5,
        sgst: 2.5,
        flags: { active: true, maintainStock: false, fastMoving: true },
      },
    ];

    await Product.insertMany(products);
    console.log('✓ Created', products.length, 'products with measurement types');

    // Print summary
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('✓ Successfully seeded bakery data!');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('\nDepartments created:');
    departments.forEach((d) => {
      const count = products.filter(p => p.department === d._id).length;
      console.log(`  • ${d.name} (${count} products)`);
    });

    console.log('\n📊 Example Billing Calculations:');
    console.log('  Mysore Pak: 1 KG = ₹400');
    console.log('             500 GM = ₹200');
    console.log('             250 GM = ₹100');
    console.log('\n  Vanilla Ice Cream: 1 Litre = ₹500');
    console.log('                     500 ML = ₹250');
    console.log('                     250 ML = ₹125');
    console.log('═══════════════════════════════════════════════════════════════\n');

    process.exit(0);
  } catch (error) {
    console.error('✗ Error seeding data:', error.message);
    process.exit(1);
  }
}

seedBakeryData();
    // Gold Shop
    { name: 'GOLD SHOP - GRAM',      quantityFormat: 'g',         code: 18 },
    { name: 'GOLD SHOP - MILLIGRAM', quantityFormat: 'milligram', code: 19 },
    { name: 'GOLD SHOP - CARAT',    quantityFormat: 'carat',     code: 20 },
    { name: 'GOLD SHOP - SOVEREIGN', quantityFormat: 'sovereign', code: 21 },
    // Pharmacy
    { name: 'PHARMACY - TABLET', quantityFormat: 'tablet', code: 22 },
    { name: 'PHARMACY - STRIP',  quantityFormat: 'strip',  code: 23 },
    { name: 'PHARMACY - BOTTLE', quantityFormat: 'bottle', code: 24 },
    { name: 'PHARMACY - TUBE',   quantityFormat: 'tube',   code: 25 },
    { name: 'PHARMACY - ML',     quantityFormat: 'ml',     code: 26 },
    // Textile
    { name: 'TEXTILE - METER',  quantityFormat: 'meter', code: 27 },
    { name: 'TEXTILE - ROLL',   quantityFormat: 'roll',  code: 28 },
    { name: 'TEXTILE - PIECE',  quantityFormat: 'pcs',   code: 29 },
    // Hardware
    { name: 'HARDWARE - FEET',   quantityFormat: 'feet',   code: 30 },
    { name: 'HARDWARE - INCH',   quantityFormat: 'inch',   code: 31 },
    { name: 'HARDWARE - METER',  quantityFormat: 'meter',  code: 32 },
    { name: 'HARDWARE - BOX',    quantityFormat: 'box',    code: 33 },
    { name: 'HARDWARE - BUNDLE', quantityFormat: 'bundle', code: 34 },
  ];

  for (const dept of departments) {
    const created = await Department.create(dept);
    console.log(`✅ Created: ${created.name} (format: ${created.quantityFormat}, code: ${created.code})`);
  }

  console.log(`\n✅ Done! ${departments.length} departments seeded successfully.`);
  await mongoose.disconnect();
}

run().catch(err => { console.error('❌ Error:', err.message); process.exit(1); });
