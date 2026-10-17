# Gyansify Leaderboard

A server-rendered admin dashboard for lead generation agents and calling teams, built with Node.js, Express, EJS, MongoDB, and Mongoose.

## Features

- Admin-only login using bcrypt password hashes and MongoDB-backed sessions.
- Agent create, read, update, delete; active/inactive status.
- Record call, qualified lead, meeting, conversion, and other activity with points.
- Daily, weekly (Monday–Sunday), and monthly rankings.
- Top-three podium, leaderboard badges, activity history and ranking tie-breakers.
- Server-side validation, login rate limiting, CSRF token validation, Helmet security headers, secure session cookie settings, and EJS escaped output.
- Paginated activity history.
- Lightweight dashboard animations: KPI count-up, staggered podium/table entrance, animated score bars, hover states, and `prefers-reduced-motion` support. Animation JS is self-hosted and requires no third-party animation library.

## Requirements

- Node.js 18+ (Node.js 20+ recommended)
- MongoDB local service or MongoDB Atlas database

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create `.env` from the example:

   ```bash
   cp .env.example .env
   ```

3. Update `MONGODB_URI`, `SESSION_SECRET`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD` in `.env`.
   - Make `SESSION_SECRET` a unique random string of at least 32 characters.
   - Use a strong admin password of at least 12 characters.
   - Never commit `.env`.
   - For Atlas, use the connection string from your Atlas project and allow the server's IP in Network Access.

4. Create the initial admin:

   ```bash
   npm run seed:admin
   ```

   The script creates an admin only if that email does not already exist. It does not reset existing passwords.

5. Start the app:

   ```bash
   npm run dev
   ```

6. Visit `http://localhost:3000` and sign in with the admin credentials.

Production:

```bash
npm start
```

Set `NODE_ENV=production` when using HTTPS so session cookies are marked Secure. Use a process manager and TLS reverse proxy in production.

## Suggested scoring policy

Set the points policy with your team before recording activities. Example starting point values (adjust to match your actual KPIs):

| Activity | Example points |
|---|---:|
| Call made | 1 |
| Qualified lead | 10 |
| Meeting booked/held | 20 |
| Conversion | 50 |
| Other verified activity | 0–10 |

The application intentionally lets an admin enter the point value per record; it does not silently assume a business policy. Consider making the points mapping fixed in code if consistent scoring is required.

## How rankings work

- Points are summed from activity records whose `occurredAt` timestamp falls within the selected period.
- Daily starts at midnight; weekly starts Monday at midnight; monthly starts on day one at midnight.
- Period boundaries use the Node.js server's local timezone. Set the server timezone deliberately if Gyansify needs a specific timezone (for example, `Asia/Kolkata`).
- Ties are ordered by qualified leads, then conversions, then agent ID.
- Badges are calculated for the selected period: Champion, Silver Performer, Bronze Performer, Closer (5+ conversions), Lead Builder (10+ qualified leads), Call Champion (50+ calls), or Rising Star.
- A deleted agent's activity records are deleted as well. Inactive agents are not included in new activity forms and are excluded from rankings.

## Routes

| Method | Route | Purpose |
|---|---|---|
| GET | `/login` | Admin login |
| POST | `/login` | Authenticate admin |
| POST | `/logout` | End admin session |
| GET | `/dashboard?period=daily` | Leaderboard dashboard |
| GET | `/agents` | List agents |
| GET/POST | `/agents/new`, `/agents` | Create agent |
| GET/POST | `/agents/:id/edit` | Edit agent |
| POST | `/agents/:id/delete` | Delete agent |
| GET | `/activities` | Activity history |
| GET/POST | `/activities/new`, `/activities` | Record activity |
| POST | `/activities/:id/delete` | Delete activity |

All agent/activity routes are admin-protected. All POST forms require a session CSRF token.

## Production checklist

- Use HTTPS and `NODE_ENV=production`.
- Store secrets in environment variables or a secret manager.
- Use least-privilege MongoDB credentials and restrict Atlas network access.
- Back up MongoDB.
- Use a strong unique admin password and rotate compromised credentials.
- Add automated tests, monitoring, and a defined retention policy before business-critical use.
- If points represent incentives or compensation, restrict point adjustments and review the activity audit trail regularly.

## Notes

This starter is an implementation baseline, not a substitute for a security review. Before public deployment, test the exact production environment and consider adding immutable audit logs for point changes, configurable scoring rules, and role-based approvals.
