
const mongoose = require("mongoose");

const ACTIVITY_TYPES = [
  "call",
  "qualified_lead",
  "meeting",
  "conversion",
  "other"
];

const activitySchema = new mongoose.Schema(
  {
    agent: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Agent",
      required: true,
      index: true
    },

    type: {
      type: String,
      enum: ACTIVITY_TYPES,
      required: true,
      trim: true
    },

    points: {
      type: Number,
      required: true,
      min: 0,
      max: 100000
    },

    note: {
      type: String,
      trim: true,
      default: "",
      maxlength: 500
    },

    occurredAt: {
      type: Date,
      required: true,
      default: Date.now,
      index: true
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      required: true
    }
  },
  {
    timestamps: true
  }
);

/*
 * Supports activity history sorting and date-range queries.
 */
activitySchema.index({
  occurredAt: -1,
  createdAt: -1
});

/*
 * Supports agent-specific activity history by date.
 */
activitySchema.index({
  agent: 1,
  occurredAt: -1
});

module.exports = mongoose.model("Activity", activitySchema);
