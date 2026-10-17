const express = require("express");
const bcrypt = require("bcryptjs");
const Admin = require("../models/Admin");
const { flash } = require("../middleware/security");

const router = express.Router();
const DUMMY_PASSWORD_HASH = bcrypt.hashSync("not-a-real-user-password", 10);

router.get("/login", (req, res) => {
  if (req.session.adminId) return res.redirect("/dashboard");
  res.render("login", { title: "Admin login", errors: [] });
});

router.post("/login", async (req, res, next) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");
    if (email.length > 254 || password.length > 200 || !email || !password) {
      return res.status(400).render("login", { title: "Admin login", errors: ["Enter a valid email and password."] });
    }

    const admin = await Admin.findOne({ email }).select("+passwordHash");
    const valid = admin ? await bcrypt.compare(password, admin.passwordHash) : await bcrypt.compare(password, "$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy");
    if (!admin || !valid) {
      return res.status(401).render("login", { title: "Admin login", errors: ["Email or password is incorrect."] });
    }

    req.session.regenerate((err) => {
      if (err) return next(err);
      req.session.adminId = String(admin._id);
      req.session.adminName = admin.name;
      req.session.csrfToken = require("crypto").randomBytes(32).toString("hex");
      admin.lastLoginAt = new Date();
      admin.save().catch(console.error);
      req.session.save((saveErr) => {
        if (saveErr) return next(saveErr);
        res.redirect("/dashboard");
      });
    });
  } catch (error) {
    next(error);
  }
});

router.post("/logout", (req, res, next) => {
  req.session.destroy((err) => {
    if (err) return next(err);
    res.clearCookie("gyansify.sid", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" });
    res.redirect("/login");
  });
});

module.exports = router;
