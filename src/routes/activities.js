
const express = require("express");
const mongoose = require("mongoose");
const { body, validationResult } = require("express-validator");

const Agent = require("../models/Agent");
const Activity = require("../models/Activity");
const { flash } = require("../middleware/security");

const router = express.Router();

const TYPES = [
  "call",
  "qualified_lead",
  "meeting",
  "conversion",
  "other"
];

const PAGE_SIZE = 20;
const MAX_PAGE = 100000;

/* =========================================================
   HELPERS
========================================================= */

function parsePage(value) {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    return 1;
  }

  return Math.min(parsed, MAX_PAGE);
}

function isValidObjectId(value) {
  return (
    typeof value === "string" &&
    /^[a-f\d]{24}$/i.test(value)
  );
}

function renderError(res, status, title, message) {
  return res.status(status).render("error", {
    title,
    message
  });
}

function renderActivityForm(res, options) {
  return res.status(options.status || 200).render(
    "activities/form",
    {
      title: options.title || "Record activity",
      agents: options.agents || [],
      errors: options.errors || [],
      activity: options.activity || {},
      csrfToken: options.csrfToken || ""
    }
  );
}

async function getActiveAgents() {
  return Agent.find({ active: true })
    .sort({ name: 1 })
    .lean();
}

/* =========================================================
   ACTIVITY HISTORY
   GET /activities
========================================================= */

router.get("/", async (req, res, next) => {
  try {
    const page = parsePage(req.query.page);
    const search =
      typeof req.query.search === "string"
        ? req.query.search.trim().slice(0, 100)
        : "";

    const type = TYPES.includes(req.query.type)
      ? req.query.type
      : "";

    const filter = {};

    if (type) {
      filter.type = type;
    }

    if (search) {
      const matchingAgents = await Agent.find({
        $or: [
          { name: { $regex: search, $options: "i" } },
          { email: { $regex: search, $options: "i" } }
        ]
      })
        .select("_id")
        .lean();

      const matchingAgentIds = matchingAgents.map(
        (agent) => agent._id
      );

      const searchConditions = [
        { note: { $regex: search, $options: "i" } }
      ];

      if (isValidObjectId(search)) {
        searchConditions.push({ _id: search });
      }

      if (matchingAgentIds.length) {
        searchConditions.push({
          agent: { $in: matchingAgentIds }
        });
      }

      filter.$or = searchConditions;
    }

    const [activities, total, activeCount] =
      await Promise.all([
        Activity.find(filter)
          .sort({ occurredAt: -1, createdAt: -1 })
          .skip((page - 1) * PAGE_SIZE)
          .limit(PAGE_SIZE)
          .populate("agent", "name email team")
          .lean(),

        Activity.countDocuments(filter),

        Activity.countDocuments({ type: "conversion" })
      ]);

    const pages = Math.max(
      1,
      Math.ceil(total / PAGE_SIZE)
    );

    res.render("activities/index", {
      title: "Activity history",
      activities,
      page,
      pages,
      total,
      search,
      selectedType: type,
      conversionCount: activeCount
    });
  } catch (error) {
    next(error);
  }
});

/* =========================================================
   NEW ACTIVITY FORM
   GET /activities/new
========================================================= */

router.get("/new", async (req, res, next) => {
  try {
    const agents = await getActiveAgents();

    return renderActivityForm(res, {
      agents,
      activity: {
        type: "qualified_lead",
        points: 10
      },
      csrfToken: req.session.csrfToken
    });
  } catch (error) {
    next(error);
  }
});

/* =========================================================
   CREATE ACTIVITY
   POST /activities
========================================================= */

const activityValidation = [
  body("agentId")
    .trim()
    .isMongoId()
    .withMessage("Choose a valid agent."),

  body("type")
    .trim()
    .isIn(TYPES)
    .withMessage("Choose a valid activity type."),

  body("points")
    .isInt({ min: 0, max: 100000 })
    .withMessage(
      "Points must be an integer between 0 and 100,000."
    ),

  body("occurredAt")
    .isISO8601()
    .withMessage("Enter a valid date and time."),

  body("note")
    .optional({ values: "falsy" })
    .trim()
    .isLength({ max: 500 })
    .withMessage("Note must be 500 characters or fewer.")
];

router.post(
  "/",
  activityValidation,
  async (req, res, next) => {
    try {
      /*
       * Do not create an activity without an authenticated
       * creator. Check session configuration and login flow
       * if adminId is missing.
       */
      const adminId = req.session?.adminId;

      if (!adminId) {
        return renderError(
          res,
          401,
          "Authentication required",
          "Your admin session is missing or expired. Please sign in again."
        );
      }

      /*
       * Validate the ID before saving it.
       */
      if (!isValidObjectId(String(adminId))) {
        return renderError(
          res,
          401,
          "Invalid admin session",
          "Your admin session contains an invalid ID. Please sign in again."
        );
      }

      const agents = await getActiveAgents();
      const errors = validationResult(req);

      if (!errors.isEmpty()) {
        return renderActivityForm(res, {
          status: 422,
          agents,
          errors: errors.array().map((item) => item.msg),
          activity: req.body,
          csrfToken: req.session.csrfToken
        });
      }

      const agent = await Agent.findOne({
        _id: req.body.agentId,
        active: true
      }).lean();

      if (!agent) {
        return renderActivityForm(res, {
          status: 422,
          agents,
          errors: ["Choose an active agent."],
          activity: req.body,
          csrfToken: req.session.csrfToken
        });
      }

      const occurredAt = new Date(req.body.occurredAt);

      if (
        Number.isNaN(occurredAt.getTime()) ||
        occurredAt.getTime() >
          Date.now() + 5 * 60 * 1000
      ) {
        return renderActivityForm(res, {
          status: 422,
          agents,
          errors: [
            "Activity date cannot be more than five minutes in the future."
          ],
          activity: req.body,
          csrfToken: req.session.csrfToken
        });
      }

      /*
       * IMPORTANT:
       * createdBy must match the type and reference defined
       * in src/models/Activity.js.
       */
      await Activity.create({
        agent: agent._id,
        type: req.body.type,
        points: Number(req.body.points),
        occurredAt,
        note: String(req.body.note || "").trim(),
        createdBy: new mongoose.Types.ObjectId(
          String(adminId)
        )
      });

      flash(
        req,
        "success",
        "Activity recorded and leaderboard updated."
      );

      return res.redirect("/activities");
    } catch (error) {
      if (error.name === "ValidationError") {
        return renderError(
          res,
          422,
          "Invalid activity",
          "The activity could not be saved. Check the Activity model's required fields and references."
        );
      }

      next(error);
    }
  }
);

/* =========================================================
   DELETE ACTIVITY
   POST /activities/:id/delete
========================================================= */

router.post("/:id/delete", async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return renderError(
        res,
        404,
        "Not found",
        "Activity not found."
      );
    }

    const activity = await Activity.findByIdAndDelete(
      req.params.id
    );

    if (!activity) {
      return renderError(
        res,
        404,
        "Not found",
        "Activity not found."
      );
    }

    flash(
      req,
      "success",
      "Activity deleted successfully."
    );

    return res.redirect("/activities");
  } catch (error) {
    next(error);
  }
});

module.exports = router;
