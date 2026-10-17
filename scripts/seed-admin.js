require("dotenv").config();
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const Admin = require("../src/models/Admin");

async function run() {
  const { MONGODB_URI, ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
  if (!MONGODB_URI || !ADMIN_NAME || !ADMIN_EMAIL || !ADMIN_PASSWORD) {
    throw new Error("Set MONGODB_URI, ADMIN_NAME, ADMIN_EMAIL and ADMIN_PASSWORD in .env first.");
  }
  if (ADMIN_PASSWORD.length < 12) throw new Error("ADMIN_PASSWORD must be at least 12 characters.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ADMIN_EMAIL)) throw new Error("ADMIN_EMAIL must be valid.");
  await mongoose.connect(MONGODB_URI);
  const email = ADMIN_EMAIL.trim().toLowerCase();
  const existing = await Admin.findOne({ email });
  if (existing) {
    console.log(`Admin already exists for ${email}. No changes made.`);
  } else {
    const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12);
    await Admin.create({ name: ADMIN_NAME.trim(), email, passwordHash });
    console.log(`Admin created: ${email}`);
    console.log("For security, keep the password in your secret manager and remove it from .env after seeding.");
  }
  await mongoose.disconnect();
}
run().catch(async error => {
  console.error(error.message);
  try { await mongoose.disconnect(); } catch (_) {}
  process.exit(1);
});
