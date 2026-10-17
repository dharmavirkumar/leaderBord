require("dotenv").config();
// Set a deliberate business timezone before date operations.
process.env.TZ = process.env.APP_TIMEZONE || "Asia/Kolkata";

const express = require("express");
const mongoose = require("mongoose");
const session = require("express-session");
const MongoStore = require("connect-mongo");
const helmet = require("helmet");
const path = require("path");
const crypto = require("crypto");
const { rateLimit } = require("express-rate-limit");

const authRoutes = require("./src/routes/auth");
const dashboardRoutes = require("./src/routes/dashboard");
const agentRoutes = require("./src/routes/agents");
const activityRoutes = require("./src/routes/activities");
const { attachLocals, requireAdmin, csrfProtection } = require("./src/middleware/security");

const app = express();
const isProduction = process.env.NODE_ENV === "production";
const sessionSecret = process.env.SESSION_SECRET || "";

if (sessionSecret.length < 32) {
  console.error("SESSION_SECRET must be at least 32 characters. Copy .env.example to .env and set a strong secret.");
  process.exit(1);
}
if (!process.env.MONGODB_URI) {
  console.error("MONGODB_URI is required in .env");
  process.exit(1);
}

if (isProduction) app.set("trust proxy", 1);
app.disable("x-powered-by");
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "src", "views"));


app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],

      scriptSrc: isProduction
        ? ["'self'"]
        : ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdn.tailwindcss.com"],

      styleSrc: isProduction
        ? ["'self'"]
        : ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],

      imgSrc: ["'self'", "data:"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: isProduction ? [] : null
    }
  }
}));

app.use(express.urlencoded({ extended: false, limit: "20kb" }));
app.use(express.json({ limit: "20kb" }));
app.use(express.static(path.join(__dirname, "public"), { maxAge: isProduction ? "1d" : 0 }));

const sessionHours = Math.max(1, Number(process.env.SESSION_MAX_AGE_HOURS) || 8);
app.use(session({
  name: "gyansify.sid",
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env.MONGODB_URI,
    collectionName: "sessions",
    ttl: sessionHours * 60 * 60
  }),
  cookie: {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    maxAge: sessionHours * 60 * 60 * 1000
  }
}));

app.use(attachLocals);
app.use(csrfProtection);

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: "Too many login attempts. Please try again in 15 minutes."
});
app.use("/login", loginLimiter);

app.get("/", (req, res) => res.redirect(req.session.adminId ? "/dashboard" : "/login"));
app.use("/", authRoutes);
app.use("/dashboard", requireAdmin, dashboardRoutes);
app.use("/agents", requireAdmin, agentRoutes);
app.use("/activities", requireAdmin, activityRoutes);

app.use((req, res) => {
  res.status(404).render("error", { title: "Page not found", message: "The page you requested could not be found." });
});

app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return next(err);
  const status = err.status || 500;
  res.status(status).render("error", {
    title: status === 500 ? "Something went wrong" : "Request error",
    message: status === 500 ? "An unexpected error occurred. Please try again." : (err.message || "The request could not be completed.")
  });
});

async function start() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("MongoDB connected");
    const port = Number(process.env.PORT) || 3000;
    app.listen(port, () => console.log(`Gyansify leaderboard: http://localhost:${port}`));
  } catch (error) {
    console.error("Failed to start:", error.message);
    process.exit(1);
  }
}
start();
