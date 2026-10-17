const express = require("express");
const Agent = require("../models/Agent");
const Activity = require("../models/Activity");
const { getLeaderboard, badgeFor } = require("../utils/leaderboard");

const router = express.Router();

router.get("/", async (req, res, next) => {
  try {
    const period = ["daily", "weekly", "monthly"].includes(req.query.period) ? req.query.period : "daily";
    const [agentsCount, activeCount, recentActivities, leaderboard] = await Promise.all([
      Agent.countDocuments(),
      Agent.countDocuments({ active: true }),
      Activity.find().sort({ occurredAt: -1, createdAt: -1 }).limit(8).populate("agent", "name").lean(),
      getLeaderboard(period, 100)
    ]);

    const totalPoints = leaderboard.rows.reduce((sum, row) => sum + row.points, 0);
    const podium = leaderboard.rows.slice(0, 3).map((row, i) => ({ ...row, rank: i + 1, badge: badgeFor(row, i + 1) }));

    res.render("dashboard", {
      title: "Dashboard",
      period,
      agentsCount,
      activeCount,
      totalPoints,
      leaderboard: leaderboard.rows.map((row, i) => ({ ...row, rank: i + 1, badge: badgeFor(row, i + 1) })),
      podium,
      recentActivities,
      periodStart: leaderboard.start
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
