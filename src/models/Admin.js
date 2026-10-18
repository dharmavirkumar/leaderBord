
const mongoose = require("mongoose");

const adminSchema = new mongoose.Schema(
  {
    // Admin / HR name
    name: {
      type: String,
      required: [true, "Admin name is required."],
      trim: true,
      minlength: [2, "Name must contain at least 2 characters."],
      maxlength: [80, "Name cannot exceed 80 characters."]
    },

    // Normalized email for login
    email: {
      type: String,
      required: [true, "Email address is required."],
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: [254, "Email cannot exceed 254 characters."],
      match: [
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
        "Enter a valid email address."
      ],
      index: true
    },

    // Store only a password hash, never a plain-text password
    passwordHash: {
      type: String,
      required: [true, "Password hash is required."],
      select: false
    },

    // Account access
    role: {
      type: String,
      enum: {
        values: ["Admin", "HR"],
        message: "Role must be Admin or HR."
      },
      default: "Admin",
      required: true,
      index: true
    },

    isActive: {
      type: Boolean,
      default: true,
      index: true
    },

    // Login tracking
    lastLoginAt: {
      type: Date,
      default: null
    },

    lastLoginIp: {
      type: String,
      default: null,
      maxlength: 45,
      select: false
    },

    // Password management
    passwordChangedAt: {
      type: Date,
      default: null
    },

    // Failed-login protection
    failedLoginAttempts: {
      type: Number,
      default: 0,
      min: 0,
      max: 100
    },

    lockUntil: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true,
    versionKey: false,
    strict: true
  }
);

/*
 * Normalize email before saving.
 */
adminSchema.pre("validate", function () {
  if (this.email) {
    this.email = this.email.trim().toLowerCase();
  }

  if (this.name) {
    this.name = this.name.trim();
  }
});

/*
 * Virtual: whether the account is currently locked.
 */
adminSchema.virtual("isLocked").get(function () {
  return Boolean(
    this.lockUntil && this.lockUntil.getTime() > Date.now()
  );
});

/*
 * Helpers for login protection.
 * Configure the actual lockout policy in the authentication route.
 */
adminSchema.methods.isLoginLocked = function () {
  return Boolean(
    this.lockUntil && this.lockUntil.getTime() > Date.now()
  );
};

adminSchema.methods.resetLoginAttempts = function () {
  this.failedLoginAttempts = 0;
  this.lockUntil = null;
};

adminSchema.methods.recordFailedLogin = function ({
  maxAttempts = 5,
  lockMinutes = 15
} = {}) {
  this.failedLoginAttempts = Math.min(
    100,
    (this.failedLoginAttempts || 0) + 1
  );

  if (this.failedLoginAttempts >= maxAttempts) {
    this.lockUntil = new Date(
      Date.now() + lockMinutes * 60 * 1000
    );
  }
};

adminSchema.methods.recordSuccessfulLogin = function () {
  this.lastLoginAt = new Date();
  this.resetLoginAttempts();
};

/*
 * Do not add password hashing middleware here:
 * the login/create-admin routes should hash passwords explicitly
 * with bcrypt before assigning passwordHash.
 */
module.exports = mongoose.model("Admin", adminSchema);
