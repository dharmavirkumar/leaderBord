
"use strict";

const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const path = require("path");

const app = express();

/* =========================================================
   1. ENVIRONMENT & TRUST PROXY
========================================================= */

const isProduction = process.env.NODE_ENV === "production";
const PORT = process.env.PORT || 3000;

// Render reverse proxy.
// Verify the trusted proxy hop count for your deployment.
if (isProduction) {
  app.set("trust proxy", 1);
} else {
  app.set("trust proxy", false);
}

app.disable("x-powered-by");

/* =========================================================
   2. SECURITY HEADERS
========================================================= */

app.use(
  helmet({
    // Enable a stricter CSP after checking your EJS templates,
    // inline scripts/styles, and external assets.
    contentSecurityPolicy: false,
  })
);

/* =========================================================
   3. REQUEST PARSING
========================================================= */

app.use(express.json({ limit: "1mb" }));

app.use(
  express.urlencoded({
    extended: true,
    limit: "1mb",
  })
);

/* =========================================================
   4. STATIC FILES
========================================================= */

app.use(
  express.static(path.join(__dirname, "public"), {
    index: false,
    maxAge: isProduction ? "7d" : 0,
    etag: true,
  })
);

/* =========================================================
   5. GENERAL RATE LIMITER
========================================================= */

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many requests. Please try again later.",
  },
});

app.use(generalLimiter);

/* =========================================================
   6. HEALTH CHECK
========================================================= */

app.get("/health", (req, res) => {
  res.status(200).json({
    success: true,
    status: "ok",
    service: "Gyansify Leaderboard",
    timestamp: new Date().toISOString(),
  });
});

/* =========================================================
   7. REGISTER YOUR EXISTING MIDDLEWARE & ROUTES
========================================================= */

// Preserve your existing EJS setup, session middleware,
// flash messages, authentication middleware and MongoDB logic.
//
// Example only — use the actual paths and exports:
//
// app.set("view engine", "ejs");
// app.set("views", path.join(__dirname, "views"));
// app.use(sessionMiddleware);
// app.use("/", require("./routes/index"));
// app.use("/agents", require("./routes/agents"));
// app.use("/activities", require("./routes/activities"));

/* =========================================================
   8. 404 HANDLER
========================================================= */

app.use((req, res, next) => {
  res.status(404);

  if (req.accepts("html")) {
    return res.send(`
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <title>404 - Page Not Found | Gyansify</title>
        </head>
        <body style="font-family:Arial,sans-serif;padding:40px;text-align:center">
          <h1>404 - Page Not Found</h1>
          <p>The requested page could not be found.</p>
          <a href="/">Back to Home</a>
        </body>
      </html>
    `);
  }

  return res.json({
    success: false,
    message: "Route not found",
  });
});

/* =========================================================
   9. CENTRAL ERROR HANDLER
========================================================= */

app.use((err, req, res, next) => {
  console.error("[Application Error]", {
    message: err.message,
    method: req.method,
    path: req.path,
  });

  if (res.headersSent) {
    return next(err);
  }

  const statusCode =
    Number.isInteger(err.statusCode) &&
    err.statusCode >= 400 &&
    err.statusCode < 600
      ? err.statusCode
      : 500;

  res.status(statusCode);

  if (req.accepts("html")) {
    return res.send(`
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <title>${statusCode} - Gyansify</title>
        </head>
        <body style="font-family:Arial,sans-serif;padding:40px;text-align:center">
          <h1>${statusCode === 500 ? "Something went wrong" : "Request Error"}</h1>
          <p>Please try again later.</p>
          <a href="/">Back to Home</a>
        </body>
      </html>
    `);
  }

  return res.json({
    success: false,
    message:
      statusCode === 500
        ? "Internal server error"
        : err.message,
  });
});

/* =========================================================
   10. START SERVER
========================================================= */

if (require.main === module) {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(
      `Gyansify Leaderboard running on port ${PORT}`
    );
  });
}

module.exports = app;
