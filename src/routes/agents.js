
"use strict";

const express = require("express");
const { body, validationResult } = require("express-validator");
const mongoose = require("mongoose");

const Agent = require("../models/Agent");
const Activity = require("../models/Activity");
const { flash } = require("../middleware/security");

const router = express.Router();

/* =========================================================
   GYANSIFY LEADERBOARD — AGENT MANAGEMENT
   Features:
   - Agent listing, search and pagination
   - Create and edit agents
   - Validation and duplicate email handling
   - Soft archive with activity history preserved
   - CSRF token passed explicitly to every form render
   ========================================================= */

const DEFAULT_TEAM = "Calling Team";
const PAGE_SIZE = 20;
const OBJECT_ID_REGEX = /^[a-f\d]{24}$/i;

const agentValidation = [
  body("name")
    .trim()
    .isLength({ min: 2, max: 80 })
    .withMessage("Name must be between 2 and 80 characters."),

  body("email")
    .trim()
    .isEmail()
    .withMessage("Enter a valid email address.")
    .normalizeEmail(),

  body("phone")
    .optional({ values: "falsy" })
    .trim()
    .isLength({ max: 25 })
    .withMessage("Phone must be 25 characters or fewer."),

  body("team")
    .trim()
    .isLength({ min: 2, max: 60 })
    .withMessage("Team must be between 2 and 60 characters.")
];

function getCsrfToken(req) {
  // attachLocals should normally create this token before routes run.
  // This fallback also ensures direct route rendering has a token.
  const crypto = require("crypto");

  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString("hex");
  }

  return req.session.csrfToken;
}

function renderAgentForm(res, req, options) {
  return res.status(options.status || 200).render("agents/form", {
    title: options.title,
    csrfToken: getCsrfToken(req),
    agent: options.agent || {},
    errors: options.errors || [],
    isEdit: Boolean(options.isEdit)
  });
}

function getValidationMessages(req) {
  return validationResult(req).array().map((error) => error.msg);
}

function isValidObjectId(id) {
  return OBJECT_ID_REGEX.test(String(id || ""));
}

function normalizeAgentBody(body = {}) {
  return {
    name: String(body.name || "").trim(),
    email: String(body.email || "").trim().toLowerCase(),
    phone: String(body.phone || "").trim(),
    team: String(body.team || "").trim(),
    active: body.active === "on"
  };
}

/* =========================================================
   GET /agents
   Agent directory, search and pagination
========================================================= */

router.get("/", async (req, res, next) => {
  try {
    const page = Math.max(
      1,
      Math.min(100000, Number.parseInt(req.query.page, 10) || 1)
    );

    const search = String(req.query.search || "").trim().slice(0, 100);
    const status = String(req.query.status || "all");

    const filter = {};

    if (search) {
      const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(escapedSearch, "i");

      filter.$or = [
        { name: regex },
        { email: regex },
        { team: regex },
        { phone: regex }
      ];
    }

    if (status === "active") {
      filter.active = true;
    } else if (status === "inactive") {
      filter.active = false;
    }

    const total = await Agent.countDocuments(filter);
    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const currentPage = Math.min(page, pages);

    const agents = await Agent.find(filter)
      .sort({ active: -1, name: 1 })
      .skip((currentPage - 1) * PAGE_SIZE)
      .limit(PAGE_SIZE)
      .lean();

    const [activeCount, inactiveCount] = await Promise.all([
      Agent.countDocuments({ active: true }),
      Agent.countDocuments({ active: false })
    ]);

    return res.render("agents/index", {
      title: "Agent Management",
      agents,
      search,
      status,
      page: currentPage,
      pages,
      total,
      activeCount,
      inactiveCount
    });
  } catch (error) {
    return next(error);
  }
});

/* =========================================================
   GET /agents/new
   Display create form
========================================================= */

router.get("/new", (req, res) => {
  return renderAgentForm(res, req, {
    title: "Add Agent",
    agent: {
      team: DEFAULT_TEAM,
      active: true
    },
    errors: [],
    isEdit: false
  });
});

/* =========================================================
   POST /agents
   Create agent
========================================================= */

router.post("/", agentValidation, async (req, res, next) => {
  const errors = getValidationMessages(req);
  const agentData = normalizeAgentBody(req.body);

  if (errors.length) {
    return renderAgentForm(res, req, {
      title: "Add Agent",
      agent: agentData,
      errors,
      isEdit: false,
      status: 422
    });
  }

  try {
    const existingAgent = await Agent.findOne({
      email: agentData.email
    }).select("_id").lean();

    if (existingAgent) {
      return renderAgentForm(res, req, {
        title: "Add Agent",
        agent: agentData,
        errors: ["An agent with this email address already exists."],
        isEdit: false,
        status: 409
      });
    }

    await Agent.create(agentData);

    flash(req, "success", "Agent created successfully.");
    return res.redirect("/agents");
  } catch (error) {
    if (error.code === 11000) {
      return renderAgentForm(res, req, {
        title: "Add Agent",
        agent: agentData,
        errors: ["An agent with this email address already exists."],
        isEdit: false,
        status: 409
      });
    }

    return next(error);
  }
});

/* =========================================================
   GET /agents/:id/edit
   Display edit form
========================================================= */

router.get("/:id/edit", async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(404).render("error", {
        title: "Agent Not Found",
        message: "The requested agent could not be found."
      });
    }

    const agent = await Agent.findById(req.params.id).lean();

    if (!agent) {
      return res.status(404).render("error", {
        title: "Agent Not Found",
        message: "The requested agent could not be found."
      });
    }

    return renderAgentForm(res, req, {
      title: "Edit Agent",
      agent,
      errors: [],
      isEdit: true
    });
  } catch (error) {
    return next(error);
  }
});

/* =========================================================
   POST /agents/:id/edit
   Update agent
========================================================= */

router.post("/:id/edit", agentValidation, async (req, res, next) => {
  if (!isValidObjectId(req.params.id)) {
    return res.status(404).render("error", {
      title: "Agent Not Found",
      message: "The requested agent could not be found."
    });
  }

  const errors = getValidationMessages(req);
  const agentData = normalizeAgentBody(req.body);

  if (errors.length) {
    return renderAgentForm(res, req, {
      title: "Edit Agent",
      agent: { ...agentData, _id: req.params.id },
      errors,
      isEdit: true,
      status: 422
    });
  }

  try {
    const duplicate = await Agent.findOne({
      email: agentData.email,
      _id: { $ne: req.params.id }
    }).select("_id").lean();

    if (duplicate) {
      return renderAgentForm(res, req, {
        title: "Edit Agent",
        agent: { ...agentData, _id: req.params.id },
        errors: ["Another agent already uses this email address."],
        isEdit: true,
        status: 409
      });
    }

    const agent = await Agent.findByIdAndUpdate(
      req.params.id,
      { $set: agentData },
      {
        new: true,
        runValidators: true
      }
    );

    if (!agent) {
      return res.status(404).render("error", {
        title: "Agent Not Found",
        message: "The requested agent could not be found."
      });
    }

    flash(req, "success", "Agent details updated successfully.");
    return res.redirect("/agents");
  } catch (error) {
    if (error.code === 11000) {
      return renderAgentForm(res, req, {
        title: "Edit Agent",
        agent: { ...agentData, _id: req.params.id },
        errors: ["Another agent already uses this email address."],
        isEdit: true,
        status: 409
      });
    }

    return next(error);
  }
});

/* =========================================================
   POST /agents/:id/delete
   Soft archive; preserve historical activities
========================================================= */

router.post("/:id/delete", async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(404).render("error", {
        title: "Agent Not Found",
        message: "The requested agent could not be found."
      });
    }

    const agent = await Agent.findByIdAndUpdate(
      req.params.id,
      { $set: { active: false } },
      {
        new: true,
        runValidators: true
      }
    );

    if (!agent) {
      return res.status(404).render("error", {
        title: "Agent Not Found",
        message: "The requested agent could not be found."
      });
    }

    flash(
      req,
      "success",
      "Agent archived. Historical activity records have been preserved."
    );

    return res.redirect("/agents");
  } catch (error) {
    return next(error);
  }
});

/* =========================================================
   POST /agents/:id/activate
   Reactivate an archived agent
========================================================= */

router.post("/:id/activate", async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(404).render("error", {
        title: "Agent Not Found",
        message: "The requested agent could not be found."
      });
    }

    const agent = await Agent.findByIdAndUpdate(
      req.params.id,
      { $set: { active: true } },
      {
        new: true,
        runValidators: true
      }
    );

    if (!agent) {
      return res.status(404).render("error", {
        title: "Agent Not Found",
        message: "The requested agent could not be found."
      });
    }

    flash(req, "success", "Agent reactivated successfully.");
    return res.redirect("/agents");
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
