# World Cup Leaderboard

Standalone public dashboard for the office World Cup 2026 predictor. The Google Sheet remains the source of truth; this app reads public CSV exports and optionally stores rank snapshots in Postgres for movement indicators.

## Environment

Copy `.env.example` to `.env.local` and set:

- `GOOGLE_SHEET_ID`: spreadsheet id from the public Google Sheet URL.
- `SYNC_SECRET`: secret required by `POST /api/sync`.
- `CRON_SECRET`: optional Vercel cron bearer token. Set it to the same value as `SYNC_SECRET` if you want Vercel cron to call `/api/sync`.
- `DATABASE_URL`: Neon/Vercel Postgres connection string. Optional; without it the leaderboard still renders, but rank movement is unavailable.

The sheet must expose these tabs by CSV export:

- `Ranking`
- `Participants List`

## API

- `GET /api/leaderboard`: current leaderboard, stats, movement, and sheet health.
- `GET /api/stats`: stats-only payload.
- `GET /api/health`: configuration and sheet health.
- `POST /api/sync`: refreshes the sheet and writes a changed snapshot. Pass `x-sync-secret: <SYNC_SECRET>`, `?secret=<SYNC_SECRET>`, or `Authorization: Bearer <SYNC_SECRET or CRON_SECRET>`.

## Development

```bash
npm run dev
```

## Verification

```bash
npm run test
npm run build
```

Deploy to Vercel as a normal Next.js project and configure the same environment variables there. The included `vercel.json` schedules a 15-minute sync cron.
