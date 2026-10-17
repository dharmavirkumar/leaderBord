
"use strict";

require("dotenv").config();

const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const compression = require("compression");
const session = require("express-session");
const MongoStore = require("connect-mongo");
const mongoose = require("mongoose");
const path = require("path");

/* =========================================================
   1. APPLICATION CONFIGURATION
========================================================= */

const app = express();

const PORT = Number(process.env.PORT) || 3000;
const NODE_ENV = process.env.NODE_ENV || "development";
const isProduction = NODE_ENV === "production";

app.disable("x-powered-by");

// Render ke standard single-proxy setup ke liye.
// Agar tumhare network mein proxy hops alag hain, verify karo.
app.set("trust proxy", isProduction ? 1 : false);

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "src", "views"));

/* =========================================================
   2. REQUIRED ENVIRONMENT VARIABLES
========================================================= */

const requiredEnv = ["MONGODB_URI", "SESSION_SECRET"];

for (const key of requiredEnv) {
  if (!process.env[key]) {
    console.error(`[CONFIG ERROR] Missing environment variable: ${key}`);
    process.exit(1);
  }
}

if (isProduction && process.env.SESSION_SECRET.length < 32) {
  console.error(
    "[CONFIG ERROR] SESSION_SECRET must be at least 32 characters."
  );
  process.exit(1);
}

/* =========================================================
   3. SECURITY HEADERS
========================================================= */

// CSP is temporarily disabled for compatibility with existing
// EJS pages that may use inline CSS/JS. Configure CSP separately
// before enabling it, so existing pages do not break.
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);

/* =========================================================
   4. COMPRESSION
========================================================= */

app.use(compression());

/* =========================================================
   5. REQUEST PARSING
========================================================= */

app.use(express.json({ limit: "1mb" }));

app.use(
  express.urlencoded({
    extended: true,
    limit: "1mb",
  })
);

/* =========================================================
   6. STATIC ASSETS
========================================================= */

app.use(
  express.static(path.join(__dirname, "public"), {
    index: false,
    etag: true,
    maxAge: isProduction ? "7d" : 0,
    setHeaders(res, filePath) {
      // HTML files should not be cached for a long time.
      if (filePath.endsWith(".html")) {
        res.setHeader("Cache-Control", "no-cache");
      }
    },
  })
);

/* =========================================================
   7. RATE LIMITING
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
  handler(req, res, next, options) {
    res.status(options.statusCode).json(options.message);
  },
});

app.use(generalLimiter);

// Optional stricter limiter for login endpoints.
// Apply this directly to your actual login POST route.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many login attempts. Please try again later.",
  },
});

/* =========================================================
   8. MONGODB SESSION STORE
========================================================= */

app.use(
  session({
    name: "gyansify.sid",
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    store: MongoStore.create({
      mongoUrl: process.env.MONGODB_URI,
      collectionName: "sessions",
      ttl: 14 * 24 * 60 * 60,
      autoRemove: "native",
    }),
    cookie: {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      maxAge: 14 * 24 * 60 * 60 * 1000,
    },
  })
);

/* =========================================================
   9. TEMPLATE LOCALS
========================================================= */

app.locals.appName = "Gyansify Leaderboard";
app.locals.currentYear = new Date().getFullYear();

/* =========================================================
   10. HEALTH CHECKS
========================================================= */

// Liveness: confirms that the Node process is responding.
app.get("/health/live", (req, res) => {
  res.status(200).json({
    success: true,
    status: "alive",
    service: "Gyansify Leaderboard",
    timestamp: new Date().toISOString(),
  });
});

// Readiness: confirms MongoDB is connected too.
app.get("/health/ready", (req, res) => {
  const databaseReady = mongoose.connection.readyState === 1;

  res.status(databaseReady ? 200 : 503).json({
    success: databaseReady,
    status: databaseReady ? "ready" : "not_ready",
    database: databaseReady ? "connected" : "disconnected",
    timestamp: new Date().toISOString(),
  });
});

// Keep compatibility with the existing /health endpoint.
app.get("/health", (req, res) => {
  const databaseReady = mongoose.connection.readyState === 1;

  res.status(databaseReady ? 200 : 503).json({
    success: databaseReady,
    status: databaseReady ? "ok" : "database_unavailable",
    service: "Gyansify Leaderboard",
    timestamp: new Date().toISOString(),
  });
});

/* =========================================================
   11. ROUTES
========================================================= */

// Keep your existing route files and exports.
// Middleware order matters: session must run before routes.


app.use("/", require("./src/routes/dashboard"));

app.use("/agents", require("./src/routes/agents"));
app.use("/activities", require("./src/routes/activities"));

// If you use connect-flash, install it and register it AFTER
// session middleware but BEFORE routes that read flash messages.
// Example:
// const flash = require("connect-flash");
// app.use(flash());

/* =========================================================
   12. 404 HANDLER
========================================================= */

app.use((req, res, next) => {
  const error = new Error("Page not found");
  error.status = 404;
  next(error);
});

/* =========================================================
   13. CENTRAL ERROR HANDLER
========================================================= */

// Express error middleware must have four parameters.
app.use((err, req, res, next) => {
  const status =
    Number.isInteger(err.status) &&
    err.status >= 400 &&
    err.status < 600
      ? err.status
      : 500;

  if (status >= 500) {
    console.error("[SERVER ERROR]", {
      message: err.message,
      method: req.method,
      path: req.originalUrl,
      // Do not log cookies, passwords, session IDs or secrets.
    });
  }

  if (res.headersSent) {
    return next(err);
  }

  res.status(status);

  if (req.accepts("html")) {
    return res.render(
      "error",
      {
        title: status === 404 ? "Page Not Found" : "Server Error",
        status,
        message:
          status === 404
            ? "The page you are looking for could not be found."
            : "Something went wrong. Please try again later.",
      },
      (renderError, html) => {
        if (!renderError) {
          return res.send(html);
        }

        // Fallback when views/error.ejs is not yet created.
        return res.send(
          status === 404
            ? "<h1>404 - Page Not Found</h1><p><a href='/'>Back to home</a></p>"
            : "<h1>500 - Internal Server Error</h1><p>Please try again later.</p>"
        );
      }
    );
  }

  return res.status(status).json({
    success: false,
    message:
      status === 404
        ? "Route not found"
        : "Internal server error",
  });
});

/* =========================================================
   14. START AFTER MONGODB CONNECTS
========================================================= */

let server;

async function startServer() {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 10000,
      maxPoolSize: 10,
      minPoolSize: 0,
    });

    console.log("[DATABASE] MongoDB connected");

    server = app.listen(PORT, "0.0.0.0", () => {
      console.log(`[SERVER] Gyansify Leaderboard listening on ${PORT}`);
      console.log(`[SERVER] Environment: ${NODE_ENV}`);
    });
  } catch (error) {
    console.error("[STARTUP ERROR] Unable to start application:", error.message);
    process.exit(1);
  }
}

/* =========================================================
   15. GRACEFUL SHUTDOWN
========================================================= */

let isShuttingDown = false;

async function shutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`[SHUTDOWN] Received ${signal}`);

  const forceExitTimer = setTimeout(() => {
    console.error("[SHUTDOWN] Forced exit after timeout");
    process.exit(1);
  }, 10000);

  forceExitTimer.unref();

  try {
    if (server) {
      await new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) return reject(error);
          resolve();
        });
      });
    }

    await mongoose.disconnect();

    console.log("[SHUTDOWN] Server and database closed cleanly");
    process.exit(0);
  } catch (error) {
    console.error("[SHUTDOWN ERROR]", error.message);
    process.exit(1);
  }
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

if (require.main === module) {
  startServer();
}

module.exports = {
  app,
  loginLimiter,
  startServer,
};
