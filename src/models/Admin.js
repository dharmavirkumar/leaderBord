const mongoose = require("mongoose");

const adminSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 80 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 254 },
  passwordHash: { type: String, required: true, select: false },
  lastLoginAt: { type: Date, default: null }
}, { timestamps: true });

module.exports = mongoose.model("Admin", adminSchema);
