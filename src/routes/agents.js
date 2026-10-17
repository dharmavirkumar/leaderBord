const express = require("express");
const { body, validationResult } = require("express-validator");
const Agent = require("../models/Agent");
const Activity = require("../models/Activity");
const { flash } = require("../middleware/security");

const router = express.Router();

const agentValidation = [
  body("name").trim().isLength({ min: 2, max: 80 }).withMessage("Name must be 2–80 characters."),
  body("email").trim().isEmail().normalizeEmail().withMessage("Enter a valid email address."),
  body("phone").optional({ values: "falsy" }).trim().isLength({ max: 25 }).withMessage("Phone must be 25 characters or fewer."),
  body("team").trim().isLength({ min: 2, max: 60 }).withMessage("Team must be 2–60 characters.")
];

router.get("/", async (req, res, next) => {
  try {
    const agents = await Agent.find().sort({ active: -1, name: 1 }).lean();
    res.render("agents/index", { title: "Agents", agents });
  } catch (error) { next(error); }
});

router.get("/new", (req, res) => {
  res.render("agents/form", { title: "Add agent", agent: {}, errors: [], isEdit: false });
});

router.post("/", agentValidation, async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).render("agents/form", { title: "Add agent", agent: req.body, errors: errors.array().map(e => e.msg), isEdit: false });
  try {
    await Agent.create({
      name: req.body.name,
      email: req.body.email,
      phone: req.body.phone || "",
      team: req.body.team,
      active: req.body.active === "on"
    });
    flash(req, "success", "Agent created successfully.");
    res.redirect("/agents");
  } catch (error) {
    if (error.code === 11000) return res.status(409).render("agents/form", { title: "Add agent", agent: req.body, errors: ["An agent with this email already exists."], isEdit: false });
    next(error);
  }
});

router.get("/:id/edit", async (req, res, next) => {
  try {
    if (!/^[a-f\d]{24}$/i.test(req.params.id)) return res.status(404).render("error", { title: "Not found", message: "Agent not found." });
    const agent = await Agent.findById(req.params.id).lean();
    if (!agent) return res.status(404).render("error", { title: "Not found", message: "Agent not found." });
    res.render("agents/form", { title: "Edit agent", agent, errors: [], isEdit: true });
  } catch (error) { next(error); }
});

router.post("/:id/edit", agentValidation, async (req, res, next) => {
  const errors = validationResult(req);
  const validId = /^[a-f\d]{24}$/i.test(req.params.id);
  if (!validId) return res.status(404).render("error", { title: "Not found", message: "Agent not found." });
  if (!errors.isEmpty()) return res.status(422).render("agents/form", { title: "Edit agent", agent: { ...req.body, _id: req.params.id }, errors: errors.array().map(e => e.msg), isEdit: true });
  try {
    const agent = await Agent.findByIdAndUpdate(req.params.id, {
      name: req.body.name, email: req.body.email, phone: req.body.phone || "",
      team: req.body.team, active: req.body.active === "on"
    }, { new: true, runValidators: true });
    if (!agent) return res.status(404).render("error", { title: "Not found", message: "Agent not found." });
    flash(req, "success", "Agent updated successfully.");
    res.redirect("/agents");
  } catch (error) {
    if (error.code === 11000) return res.status(409).render("agents/form", { title: "Edit agent", agent: { ...req.body, _id: req.params.id }, errors: ["An agent with this email already exists."], isEdit: true });
    next(error);
  }
});

router.post("/:id/delete", async (req, res, next) => {
  try {
    if (!/^[a-f\d]{24}$/i.test(req.params.id)) return res.status(404).render("error", { title: "Not found", message: "Agent not found." });
    const agent = await Agent.findByIdAndUpdate(
      req.params.id,
      { active: false },
      { new: true, runValidators: true }
    );
    if (!agent) return res.status(404).render("error", { title: "Not found", message: "Agent not found." });
    // Soft archive preserves historical activity records for audits.
    flash(req, "success", "Agent archived. Activity history has been preserved.");
    res.redirect("/agents");
  } catch (error) { next(error); }
});

module.exports = router;
