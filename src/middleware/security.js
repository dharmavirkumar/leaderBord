const crypto = require("crypto");

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ""));
  const right = Buffer.from(String(b || ""));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function attachLocals(req, res, next) {
  if (!req.session.csrfToken) req.session.csrfToken = crypto.randomBytes(32).toString("hex");
  res.locals.csrfToken = req.session.csrfToken;
  res.locals.currentPath = req.path;
  res.locals.adminName = req.session.adminName || "";
  res.locals.flash = req.session.flash || null;
  delete req.session.flash;
  next();
}

function csrfProtection(req, res, next) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  const submitted = req.body && req.body._csrf;
  if (!safeEqual(req.session.csrfToken, submitted)) {
    return res.status(403).render("error", {
      title: "Request blocked",
      message: "Security token missing or expired. Refresh the page and try again."
    });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.adminId) {
    req.session.flash = { type: "info", message: "Please sign in to continue." };
    return res.redirect("/login");
  }
  next();
}

function flash(req, type, message) {
  req.session.flash = { type, message };
}

module.exports = { attachLocals, csrfProtection, requireAdmin, flash };
