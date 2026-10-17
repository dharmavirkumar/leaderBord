const express = require("express");
const { body, validationResult } = require("express-validator");
const Agent = require("../models/Agent");
const Activity = require("../models/Activity");
const { flash } = require("../middleware/security");

const router = express.Router();
const types = ["call", "qualified_lead", "meeting", "conversion", "other"];

router.get("/", async (req, res, next) => {
  try {
    const page = Math.max(1, Math.min(100000, Number.parseInt(req.query.page, 10) || 1));
    const limit = 20;
    const [activities, total] = await Promise.all([
      Activity.find().sort({ occurredAt: -1, createdAt: -1 }).skip((page - 1) * limit).limit(limit).populate("agent", "name email").lean(),
      Activity.countDocuments()
    ]);
    res.render("activities/index", { title: "Activity history", activities, page, pages: Math.max(1, Math.ceil(total / limit)), total });
  } catch (error) { next(error); }
});

router.get("/new", async (req, res, next) => {
  try {
    const agents = await Agent.find({ active: true }).sort({ name: 1 }).lean();
    res.render("activities/form", { title: "Record activity", agents, errors: [], activity: { type: "qualified_lead", points: 10 } });
  } catch (error) { next(error); }
});

router.post("/", [
  body("agentId").isMongoId().withMessage("Choose a valid agent."),
  body("type").isIn(types).withMessage("Choose a valid activity type."),
  body("points").isInt({ min: 0, max: 100000 }).withMessage("Points must be an integer between 0 and 100,000."),
  body("occurredAt").isISO8601().withMessage("Enter a valid date and time."),
  body("note").optional({ values: "falsy" }).trim().isLength({ max: 500 }).withMessage("Note must be 500 characters or fewer.")
], async (req, res, next) => {
  const errors = validationResult(req);
  const agents = await Agent.find({ active: true }).sort({ name: 1 }).lean();
  if (!errors.isEmpty()) return res.status(422).render("activities/form", { title: "Record activity", agents, errors: errors.array().map(e => e.msg), activity: req.body });
  try {
    const agent = await Agent.findOne({ _id: req.body.agentId, active: true });
    if (!agent) return res.status(422).render("activities/form", { title: "Record activity", agents, errors: ["Choose an active agent."], activity: req.body });
    const occurredAt = new Date(req.body.occurredAt);
    if (Number.isNaN(occurredAt.getTime()) || occurredAt > new Date(Date.now() + 5 * 60 * 1000)) {
      return res.status(422).render("activities/form", { title: "Record activity", agents, errors: ["Activity date cannot be more than five minutes in the future."], activity: req.body });
    }
    await Activity.create({
      agent: agent._id, type: req.body.type, points: Number(req.body.points),
      occurredAt, note: req.body.note || "", createdBy: req.session.adminId
    });
    flash(req, "success", "Activity recorded and leaderboard updated.");
    res.redirect("/activities");
  } catch (error) { next(error); }
});

router.post("/:id/delete", async (req, res, next) => {
  try {
    if (!/^[a-f\d]{24}$/i.test(req.params.id)) return res.status(404).render("error", { title: "Not found", message: "Activity not found." });
    const activity = await Activity.findByIdAndDelete(req.params.id);
    if (!activity) return res.status(404).render("error", { title: "Not found", message: "Activity not found." });
    flash(req, "success", "Activity deleted and rankings recalculated.");
    res.redirect("/activities");
  } catch (error) { next(error); }
});

module.exports = router;
