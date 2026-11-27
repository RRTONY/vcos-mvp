# Digital Estate band (Analytics > Overview), 2026-11-28

Tony's Nov 27 "Digital Estate Pulse" asked for one protected, dashboard-first portal instead of
prose reports, and "avoid a second competing dashboard". So it lives in VCoS Analytics, not a new
site. `components/analytics/DigitalEstate.tsx`, shown at the top of Analytics > Overview.

- **Websites (GA4):** one tile per `ANALYTICS_SITES` entry. Visits for the last 7 *complete* days
  (today is partial, so it's left out) vs the 7 before, page views, new visitors, 30-day sparkline.
  Maths in `lib/digital-estate.ts` (`compareWeeks`), from the snapshot's `audience.trend`.
- **Flag rule (Tony's):** a site is flagged when visits move 25% or more AND by at least 20 visits
  (`FLAG_PCT`, `FLAG_MIN_SESSIONS`), so small sites aren't flagged for noise. "Rising" / "Watch".
- **Google Search (Search Console):** `lib/search-console.ts`, `/api/search-console?site=`
  (cached 6 h, refreshed by `cron-refresh` daily and the header Refresh button). Uses the GA4
  service account (`GOOGLE_GA_CLIENT_EMAIL`, scope `webmasters.readonly`). Window = 7 days ending
  3 days ago (Search Console data lags), vs the 7 before; the tile always shows the dates.
  Properties are in `SEARCH_CONSOLE_SITES` (`lib/constants.ts`). As of 2026-11-28 the account can
  read ramprate.com and clarisseartist.com; **tonygreenberg.com shows "Needs access"** until the
  account is added as a user on that property; ImpactSoul has no property.
- **Social:** X and LinkedIn follower tiles from the existing snapshots.
- **Never zero for missing data:** no snapshot / not enough days / an error shows "No data" or
  "Needs access". What Tony asked for with no live source yet is listed under "Not connected yet"
  (`NOT_CONNECTED`): conversions, CTAs, sign-ins, mentions, portfolio, webmaster job queue.
- Self-test: `node scripts/digital-estate.selftest.mjs` (7 checks, no network).
- Known gap (pre-existing): `netlify/functions/analytics-refresh.ts` refreshes ramprate,
  impactsoul and tonygreenberg every 15 min but not clarisseartist.
