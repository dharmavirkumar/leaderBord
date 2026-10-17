const mongoose = require("mongoose");

const agentSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, minlength: 2, maxlength: 80 },
  email: { type: String, required: true, trim: true, lowercase: true, maxlength: 254, unique: true },
  phone: { type: String, trim: true, default: "", maxlength: 25 },
  team: { type: String, trim: true, default: "Calling Team", maxlength: 60 },
  active: { type: Boolean, default: true }
}, { timestamps: true });

agentSchema.index({ active: 1, name: 1 });
module.exports = mongoose.model("Agent", agentSchema);
