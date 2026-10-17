const Activity = require("../models/Activity");

function getPeriodRange(period, now = new Date()) {
  const end = new Date(now);
  const start = new Date(now);
  if (period === "weekly") {
    const day = (start.getDay() + 6) % 7; // Monday is first day
    start.setDate(start.getDate() - day);
  } else if (period === "monthly") {
    start.setDate(1);
  } else {
    start.setHours(0, 0, 0, 0);
    return { start, end, period: "daily" };
  }
  start.setHours(0, 0, 0, 0);
  return { start, end, period };
}

async function getLeaderboard(period = "daily", limit = 100) {
  const safePeriod = ["daily", "weekly", "monthly"].includes(period) ? period : "daily";
  const { start, end } = getPeriodRange(safePeriod);
  const rows = await Activity.aggregate([
    { $match: { occurredAt: { $gte: start, $lte: end } } },
    { $lookup: { from: "agents", localField: "agent", foreignField: "_id", as: "agentDoc" } },
    { $unwind: "$agentDoc" },
    { $match: { "agentDoc.active": true } },
    { $group: {
      _id: "$agent",
      points: { $sum: "$points" },
      activities: { $sum: 1 },
      calls: { $sum: { $cond: [{ $eq: ["$type", "call"] }, 1, 0] } },
      qualifiedLeads: { $sum: { $cond: [{ $eq: ["$type", "qualified_lead"] }, 1, 0] } },
      meetings: { $sum: { $cond: [{ $eq: ["$type", "meeting"] }, 1, 0] } },
      conversions: { $sum: { $cond: [{ $eq: ["$type", "conversion"] }, 1, 0] } },
      name: { $first: "$agentDoc.name" },
      email: { $first: "$agentDoc.email" },
      team: { $first: "$agentDoc.team" }
    }},
    { $sort: { points: -1, qualifiedLeads: -1, conversions: -1, name: 1 } },
    { $limit: limit },
    { $project: {
      _id: 0, agentId: "$_id", name: 1, email: 1, team: 1,
      points: 1, activities: 1, calls: 1,
      qualifiedLeads: 1, meetings: 1, conversions: 1
    }}
  ]);
  return { rows, start, end, period: safePeriod };
}

function badgeFor(row, rank) {
  if (rank === 1) return { name: "Leaderboard Champion", icon: "🏆", description: "Top points in this period" };
  if (rank === 2) return { name: "Silver Performer", icon: "🥈", description: "Second place in this period" };
  if (rank === 3) return { name: "Bronze Performer", icon: "🥉", description: "Third place in this period" };
  if (row.conversions >= 5) return { name: "Closer", icon: "🎯", description: "5+ conversions this period" };
  if (row.qualifiedLeads >= 10) return { name: "Lead Builder", icon: "🌱", description: "10+ qualified leads this period" };
  if (row.calls >= 50) return { name: "Call Champion", icon: "📞", description: "50+ calls this period" };
  return { name: "Rising Star", icon: "⭐", description: "Keep building momentum" };
}

module.exports = { getPeriodRange, getLeaderboard, badgeFor };
