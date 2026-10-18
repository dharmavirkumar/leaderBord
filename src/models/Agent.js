
const mongoose = require("mongoose");

const agentSchema = new mongoose.Schema(
  {
    // Agent's full name
    name: {
      type: String,
      required: [true, "Agent name is required."],
      trim: true,
      minlength: [2, "Name must contain at least 2 characters."],
      maxlength: [80, "Name cannot exceed 80 characters."]
    },

    // Unique, normalized email
    email: {
      type: String,
      required: [true, "Agent email is required."],
      trim: true,
      lowercase: true,
      maxlength: [254, "Email cannot exceed 254 characters."],
      match: [
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
        "Enter a valid email address."
      ],
      unique: true
    },

    // Contact number; optional
    phone: {
      type: String,
      trim: true,
      default: "",
      maxlength: [25, "Phone number cannot exceed 25 characters."],
      validate: {
        validator(value) {
          if (!value) return true;
          return /^[+()\d\s.-]{7,25}$/.test(value);
        },
        message: "Enter a valid phone number."
      }
    },

    // Team assignment
    team: {
      type: String,
      trim: true,
      default: "Calling Team",
      minlength: [2, "Team name must contain at least 2 characters."],
      maxlength: [60, "Team name cannot exceed 60 characters."]
    },

    // Inactive agents remain in historical activity records
    active: {
      type: Boolean,
      default: true,
      index: true
    }
  },
  {
    timestamps: true,
    versionKey: false,
    strict: true
  }
);

/*
 * Normalize fields before validation.
 */
agentSchema.pre("validate", function () {
  if (this.name) {
    this.name = this.name.trim();
  }

  if (this.email) {
    this.email = this.email.trim().toLowerCase();
  }

  if (this.phone) {
    this.phone = this.phone.trim();
  }

  if (this.team) {
    this.team = this.team.trim();
  }
});

/*
 * Indexes for common agent and leaderboard queries.
 * email already has a unique index through unique: true.
 */
agentSchema.index({ active: 1, name: 1 });
agentSchema.index({ team: 1, active: 1 });

module.exports = mongoose.model("Agent", agentSchema);
