
"use strict";

/* =========================================================
   GYANSIFY LEADERBOARD
   Production-oriented Express application
   Stack: Express + EJS + MongoDB + Sessions
========================================================= */

require("dotenv").config();

const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const compression = require("compression");
const session = require("express-session");
const MongoStore = require("connect-mongo");
const mongoose = require("mongoose");
const path = require("path");

const {
  attachLocals,
  csrfProtection,
} = require("./src/middleware/security");

/* =========================================================
   1. APPLICATION CONFIGURATION
========================================================= */

const app = express();

const PORT = Number(process.env.PORT) || 3000;
const NODE_ENV = process.env.NODE_ENV || "development";
const isProduction = NODE_ENV === "production";

app.disable("x-powered-by");

app.set("trust proxy", isProduction ? 1 : false);
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "src", "views"));

app.set("case sensitive routing", false);
app.set("strict routing", false);

/* =========================================================
   2. ENVIRONMENT VALIDATION
========================================================= */

const requiredEnv = ["MONGODB_URI", "SESSION_SECRET"];

for (const key of requiredEnv) {
  if (!process.env[key] || !process.env[key].trim()) {
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

// CSP remains disabled for compatibility with existing EJS pages.
// Configure a tested Content Security Policy before enabling it.

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);

/* =========================================================
   4. RESPONSE COMPRESSION
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
    parameterLimit: 1000,
  })
);

/* =========================================================
   6. STATIC FILES
========================================================= */

app.use(
  express.static(path.join(__dirname, "public"), {
    index: false,
    etag: true,
    maxAge: isProduction ? "7d" : 0,
    setHeaders(res, filePath) {
      if (filePath.endsWith(".html")) {
        res.setHeader("Cache-Control", "no-cache");
      }
    },
  })
);

/* =========================================================
   7. GENERAL RATE LIMITER
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
    if (res.headersSent) {
      return next();
    }

    return res
      .status(options.statusCode)
      .json(options.message);
  },
});

app.use(generalLimiter);

/* =========================================================
   8. LOGIN RATE LIMITER
========================================================= */

// Count login POST requests only.
// Mounted on both common login paths for compatibility.

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,

  skip(req) {
    return req.method !== "POST";
  },

  message: {
    success: false,
    message: "Too many login attempts. Please try again later.",
  },

  handler(req, res, next, options) {
    if (res.headersSent) {
      return next();
    }

    return res
      .status(options.statusCode)
      .json(options.message);
  },
});

/* =========================================================
   9. SESSION STORE
========================================================= */

const sessionStore = MongoStore.create({
  mongoUrl: process.env.MONGODB_URI,
  collectionName: "sessions",
  ttl: 14 * 24 * 60 * 60,
  autoRemove: "native",
});

sessionStore.on("error", (error) => {
  console.error("[SESSION STORE ERROR]", error.message);
});

app.use(
  session({
    name: "gyansify.sid",
    secret: process.env.SESSION_SECRET,

    store: sessionStore,

    resave: false,
    saveUninitialized: false,
    rolling: true,

    cookie: {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      maxAge: 14 * 24 * 60 * 60 * 1000,
    },
  })
);

/* =========================================================
   10. APPLICATION LOCALS
========================================================= */

app.locals.appName = "Gyansify Leaderboard";
app.locals.currentYear = new Date().getFullYear();

/* =========================================================
   11. TEMPLATE LOCALS + CSRF PROTECTION
========================================================= */

// IMPORTANT ORDER:
// 1. Body parsers
// 2. Session
// 3. attachLocals
// 4. CSRF protection
// 5. Routes

app.use(attachLocals);
app.use(csrfProtection);

/* =========================================================
   12. HEALTH CHECKS
========================================================= */

// Liveness: Node.js process is responding.

app.get("/health/live", (req, res) => {
  res.status(200).json({
    success: true,
    status: "alive",
    service: "Gyansify Leaderboard",
    timestamp: new Date().toISOString(),
  });
});

// Readiness: MongoDB is connected.

app.get("/health/ready", (req, res) => {
  const databaseReady = mongoose.connection.readyState === 1;

  res.status(databaseReady ? 200 : 503).json({
    success: databaseReady,
    status: databaseReady ? "ready" : "not_ready",
    database: databaseReady ? "connected" : "disconnected",
    timestamp: new Date().toISOString(),
  });
});

// Backward-compatible health endpoint.

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
   13. ROUTES
========================================================= */

// Login rate limiter: applies only to POST requests.
app.use(["/login", "/admin/login"], loginLimiter);

// Authentication routes MUST be registered.
app.use("/", require("./src/routes/auth"));

// Protected dashboard route.
app.use("/", require("./src/routes/dashboard"));

// Other application routes.
app.use("/agents", require("./src/routes/agents"));
app.use("/activities", require("./src/routes/activities"));


/* =========================================================
   14. 404 HANDLER
========================================================= */

app.use((req, res, next) => {
  const error = new Error("Page not found");
  error.status = 404;
  next(error);
});

/* =========================================================
   15. CENTRAL ERROR HANDLER
========================================================= */

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
      environment: NODE_ENV,
    });
  }

  if (res.headersSent) {
    return next(err);
  }

  res.status(status);

  // Return JSON for API clients.
  if (
    req.path.startsWith("/api/") ||
    req.is("application/json") ||
    req.accepts("html") === false
  ) {
    return res.json({
      success: false,
      message:
        status === 404
          ? "Route not found"
          : status < 500
            ? err.message
            : "Internal server error",
    });
  }

  const errorViewData = {
    title:
      status === 404
        ? "Page Not Found"
        : status === 403
          ? "Request Blocked"
          : status === 429
            ? "Too Many Requests"
            : "Server Error",

    status,

    message:
      status === 404
        ? "The page you are looking for could not be found."
        : status === 403
          ? "Your request could not be verified. Refresh the page and try again."
          : status === 429
            ? "Too many requests. Please wait before trying again."
            : "Something went wrong. Please try again later.",
  };

  return res.render("error", errorViewData, (renderError, html) => {
    if (!renderError) {
      return res.send(html);
    }

    console.error(
      "[ERROR VIEW FAILURE]",
      renderError.message
    );

    const fallbackTitle =
      status === 404
        ? "404 - Page Not Found"
        : status === 403
          ? "403 - Request Blocked"
          : status === 429
            ? "429 - Too Many Requests"
            : "500 - Internal Server Error";

    const fallbackMessage =
      status === 404
        ? "The requested page was not found."
        : status === 403
          ? "Refresh the page and try again."
          : status === 429
            ? "Please wait before trying again."
            : "Please try again later.";

    return res
      .status(status)
      .send(
        `<!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <title>${fallbackTitle}</title>
        </head>
        <body>
          <main>
            <h1>${fallbackTitle}</h1>
            <p>${fallbackMessage}</p>
            <a href="/">Back to home</a>
          </main>
        </body>
        </html>`
      );
  });
});

/* =========================================================
   16. STARTUP
========================================================= */

let server;
let isShuttingDown = false;

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

    server.on("error", (error) => {
      console.error("[SERVER LISTEN ERROR]", error.message);
    });
  } catch (error) {
    console.error(
      "[STARTUP ERROR] Unable to start application:",
      error.message
    );

    process.exitCode = 1;
    await mongoose.disconnect().catch(() => {});
  }
}

/* =========================================================
   17. GRACEFUL SHUTDOWN
========================================================= */

async function shutdown(signal) {
  if (isShuttingDown) {
    return;
  }

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
          if (error) {
            return reject(error);
          }

          resolve();
        });
      });
    }

    await mongoose.disconnect();

    console.log("[SHUTDOWN] Server and database closed cleanly");

    clearTimeout(forceExitTimer);
    process.exitCode = 0;
  } catch (error) {
    console.error("[SHUTDOWN ERROR]", error.message);

    clearTimeout(forceExitTimer);
    process.exitCode = 1;
  }
}

process.once("SIGTERM", () => {
  shutdown("SIGTERM");
});

process.once("SIGINT", () => {
  shutdown("SIGINT");
});

/* =========================================================
   18. ENTRY POINT + EXPORTS
========================================================= */

if (require.main === module) {
  startServer();
}

module.exports = {
  app,
  loginLimiter,
  startServer,
  shutdown,
};

