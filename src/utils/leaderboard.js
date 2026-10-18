
const Activity = require("../models/Activity");

const VALID_PERIODS = ["daily", "weekly", "monthly"];

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

function normalizePeriod(period) {
  return VALID_PERIODS.includes(period) ? period : "daily";
}

function normalizeLimit(limit) {
  const parsed = Number.parseInt(limit, 10);

  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    return DEFAULT_LIMIT;
  }

  return Math.min(parsed, MAX_LIMIT);
}

/**
 * Returns period boundaries based on the Indian calendar.
 * MongoDB Date values are UTC timestamps, so IST midnight
 * is converted to its corresponding UTC instant.
 */
function getPeriodRange(period = "daily", now = new Date()) {
  const safePeriod = normalizePeriod(period);
  const istNow = new Date(now.getTime() + IST_OFFSET_MS);

  const year = istNow.getUTCFullYear();
  const month = istNow.getUTCMonth();
  const day = istNow.getUTCDate();

  let startUtc;

  if (safePeriod === "daily") {
    startUtc = Date.UTC(year, month, day);
  } else if (safePeriod === "weekly") {
    // Monday is the first day of the week.
    const dayFromMonday = (istNow.getUTCDay() + 6) % 7;
    startUtc = Date.UTC(year, month, day - dayFromMonday);
  } else {
    startUtc = Date.UTC(year, month, 1);
  }

  return {
    start: new Date(startUtc - IST_OFFSET_MS),
    end: new Date(now),
    period: safePeriod
  };
}

function badgeFor(row = {}, rank = 0) {
  if (rank === 1) {
    return {
      name: "Leaderboard Champion",
      icon: "🏆",
      description: "Top points in this period"
    };
  }

  if (rank === 2) {
    return {
      name: "Silver Performer",
      icon: "🥈",
      description: "Second place in this period"
    };
  }

  if (rank === 3) {
    return {
      name: "Bronze Performer",
      icon: "🥉",
      description: "Third place in this period"
    };
  }

  if (Number(row.conversions) >= 5) {
    return {
      name: "Closer",
      icon: "🎯",
      description: "5+ conversions this period"
    };
  }

  if (Number(row.qualifiedLeads) >= 10) {
    return {
      name: "Lead Builder",
      icon: "🌱",
      description: "10+ qualified leads this period"
    };
  }

  if (Number(row.calls) >= 50) {
    return {
      name: "Call Champion",
      icon: "📞",
      description: "50+ calls this period"
    };
  }

  return {
    name: "Rising Star",
    icon: "⭐",
    description: "Keep building momentum"
  };
}

async function getLeaderboard(
  period = "daily",
  limit = DEFAULT_LIMIT,
  now = new Date()
) {
  const safePeriod = normalizePeriod(period);
  const safeLimit = normalizeLimit(limit);
  const { start, end } = getPeriodRange(safePeriod, now);

  const aggregatedRows = await Activity.aggregate([
    {
      $match: {
        occurredAt: {
          $gte: start,
          $lte: end
        }
      }
    },
    {
      $lookup: {
        from: "agents",
        localField: "agent",
        foreignField: "_id",
        as: "agentDoc"
      }
    },
    {
      $unwind: "$agentDoc"
    },
    {
      $match: {
        "agentDoc.active": true
      }
    },
    {
      $group: {
        _id: "$agent",

        points: { $sum: "$points" },
        activities: { $sum: 1 },

        calls: {
          $sum: {
            $cond: [{ $eq: ["$type", "call"] }, 1, 0]
          }
        },

        qualifiedLeads: {
          $sum: {
            $cond: [
              { $eq: ["$type", "qualified_lead"] },
              1,
              0
            ]
          }
        },

        meetings: {
          $sum: {
            $cond: [{ $eq: ["$type", "meeting"] }, 1, 0]
          }
        },

        conversions: {
          $sum: {
            $cond: [
              { $eq: ["$type", "conversion"] },
              1,
              0
            ]
          }
        },

        name: { $first: "$agentDoc.name" },
        email: { $first: "$agentDoc.email" },
        team: { $first: "$agentDoc.team" }
      }
    },
    {
      $sort: {
        points: -1,
        qualifiedLeads: -1,
        conversions: -1,
        calls: -1,
        name: 1,
        _id: 1
      }
    },
    {
      $limit: safeLimit
    },
    {
      $project: {
        _id: 0,
        agentId: "$_id",
        name: 1,
        email: 1,
        team: 1,
        points: 1,
        activities: 1,
        calls: 1,
        qualifiedLeads: 1,
        meetings: 1,
        conversions: 1
      }
    }
  ]);

  // The view expects numeric ranks and a badge on every row.
  const rows = aggregatedRows.map((row, index) => {
    const rank = index + 1;

    return {
      ...row,
      rank,
      badge: badgeFor(row, rank)
    };
  });

  return {
    rows,
    start,
    end,
    period: safePeriod,
    totalPoints: rows.reduce(
      (sum, row) => sum + (Number(row.points) || 0),
      0
    ),
    rankedAgents: rows.length,
    podium: rows.slice(0, 3)
  };
}

module.exports = {
  getPeriodRange,
  getLeaderboard,
  badgeFor,
  normalizePeriod,
  normalizeLimit
};
