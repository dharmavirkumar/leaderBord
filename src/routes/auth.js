
const express = require("express");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");

const Admin = require("../models/Admin");

const router = express.Router();

const DUMMY_PASSWORD_HASH = bcrypt.hashSync(
  "not-a-real-user-password",
  10
);

const SESSION_COOKIE_NAME = "gyansify.sid";

/* =========================================================
   LOGIN PAGE
========================================================= */

router.get("/login", (req, res) => {
  if (req.session?.adminId) {
    return res.redirect("/dashboard");
  }

  return res.render("login", {
    title: "Admin login",
    errors: []
  });
});

/* =========================================================
   LOGIN SUBMISSION
========================================================= */

router.post("/login", async (req, res, next) => {
  try {
    const email = String(req.body.email || "")
      .trim()
      .toLowerCase();

    const password = String(req.body.password || "");

    if (
      !email ||
      !password ||
      email.length > 254 ||
      password.length > 200
    ) {
      return res.status(400).render("login", {
        title: "Admin login",
        errors: ["Enter a valid email and password."]
      });
    }

    const admin = await Admin.findOne({ email })
      .select("+passwordHash");

    /*
     * Always compare a password hash, even when the account
     * does not exist, to reduce account-enumeration timing clues.
     */
    const passwordHash = admin?.passwordHash
      ? admin.passwordHash
      : DUMMY_PASSWORD_HASH;

    const passwordValid = await bcrypt.compare(
      password,
      passwordHash
    );

    if (!admin || !passwordValid) {
      return res.status(401).render("login", {
        title: "Admin login",
        errors: ["Email or password is incorrect."]
      });
    }

    /*
     * If your Admin schema has an active/isActive field,
     * enforce it here. Adjust the field name to your schema.
     */
    if (
      admin.isActive === false ||
      admin.active === false
    ) {
      return res.status(403).render("login", {
        title: "Admin login",
        errors: ["This admin account is inactive. Contact your administrator."]
      });
    }

    /*
     * Regenerate the session to prevent session fixation.
     */
    req.session.regenerate((err) => {
      if (err) return next(err);

      req.session.adminId = String(admin._id);
      req.session.adminName = String(admin.name || "Admin");
      req.session.csrfToken = crypto
        .randomBytes(32)
        .toString("hex");

      req.session.save(async (saveErr) => {
        if (saveErr) return next(saveErr);

        try {
          admin.lastLoginAt = new Date();
          await admin.save();

          return res.redirect("/dashboard");
        } catch (saveAdminError) {
          /*
           * Authentication session already exists at this point.
           * Report the database error rather than silently ignoring it.
           */
          return next(saveAdminError);
        }
      });
    });
  } catch (error) {
    next(error);
  }
});

/* =========================================================
   LOGOUT
========================================================= */

router.post("/logout", (req, res, next) => {
  req.session.destroy((err) => {
    if (err) return next(err);

    res.clearCookie(SESSION_COOKIE_NAME, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/"
    });

    return res.redirect("/login");
  });
});

module.exports = router;
