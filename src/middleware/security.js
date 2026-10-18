
const crypto = require("crypto");

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Constant-time comparison for CSRF tokens.
 */
function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") {
    return false;
  }

  const left = Buffer.from(a);
  const right = Buffer.from(b);

  return (
    left.length === right.length &&
    left.length > 0 &&
    crypto.timingSafeEqual(left, right)
  );
}

/**
 * Attach shared variables to every EJS view.
 * Register after express-session and before routes.
 */
function attachLocals(req, res, next) {
  if (!req.session) {
    return next(new Error("Session middleware is not configured."));
  }

  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString("hex");
  }

  res.locals.csrfToken = req.session.csrfToken;
  res.locals.currentPath = req.path || "/";
  res.locals.adminName = req.session.adminName || "";
  res.locals.adminRole = req.session.adminRole || "";
  res.locals.adminId = req.session.adminId || "";
  res.locals.flash = req.session.flash || null;

  // Backward compatibility for older EJS templates.
  res.locals.success = [];
  res.locals.error = [];
  res.locals.info = [];
  res.locals.warning = [];

  const pendingFlash = req.session.flash;

  if (pendingFlash && typeof pendingFlash === "object") {
    const type = pendingFlash.type;
    const message = pendingFlash.message;

    if (
      ["success", "error", "info", "warning"].includes(type) &&
      typeof message === "string" &&
      message.trim()
    ) {
      res.locals[type] = [message.trim()];
    }
  }

  delete req.session.flash;

  next();
}

/**
 * Protect all state-changing requests against CSRF.
 *
 * Requires express.urlencoded() or express.json() to be registered
 * before this middleware so req.body is available.
 */
function csrfProtection(req, res, next) {
  if (SAFE_METHODS.has(req.method)) {
    return next();
  }

  const sessionToken = req.session?.csrfToken;
  const submittedToken = req.body?._csrf;

  if (!safeEqual(sessionToken, submittedToken)) {
    return res.status(403).render("error", {
      title: "Request blocked",
      message: "Your security token is missing or expired. Refresh the page and try again."
    });
  }

  next();
}

/**
 * Require an authenticated admin or HR session.
 */
function requireAdmin(req, res, next) {
  if (!req.session?.adminId) {
    return flash(
      req,
      "info",
      "Please sign in to continue.",
      res,
      next
    );
  }

  next();
}

/**
 * Store a flash message for the next request.
 * Supports: flash(req, "success", "Saved successfully.")
 */
function flash(req, type, message, res, next) {
  if (!req.session) {
    if (res && next) {
      return next(new Error("Session middleware is not configured."));
    }

    return;
  }

  const allowedTypes = ["success", "error", "info", "warning"];

  if (!allowedTypes.includes(type)) {
    type = "info";
  }

  // Preserve multiple messages during the same request.
  const existing = req.session.flash;
  const messages =
    existing &&
    existing.type === type &&
    Array.isArray(existing.messages)
      ? existing.messages
      : existing &&
        existing.type === type &&
        typeof existing.message === "string"
        ? [existing.message]
        : [];

  messages.push(String(message || "").trim());

  req.session.flash = {
    type,
    message: messages.filter(Boolean).join(" "),
    messages: messages.filter(Boolean)
  };

  if (res && next) {
    return res.redirect("/login");
  }
}

module.exports = {
  safeEqual,
  attachLocals,
  csrfProtection,
  requireAdmin,
  flash
};
