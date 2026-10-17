const mongoose = require("mongoose");

const activitySchema = new mongoose.Schema({
  agent: { type: mongoose.Schema.Types.ObjectId, ref: "Agent", required: true, index: true },
  type: {
    type: String,
    enum: ["call", "qualified_lead", "meeting", "conversion", "other"],
    required: true
  },
  points: { type: Number, required: true, min: 0, max: 100000 },
  note: { type: String, trim: true, default: "", maxlength: 500 },
  occurredAt: { type: Date, required: true, default: Date.now, index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", required: true }
}, { timestamps: true });

activitySchema.index({ occurredAt: -1, agent: 1 });
module.exports = mongoose.model("Activity", activitySchema);
