# Gym app — product decisions and build plan

Research notes: [exercise-datasets.md](research/exercise-datasets.md), [platform-convex.md](research/platform-convex.md), [competitors.md](research/competitors.md).

## What the research changed

- **Logging is mostly free elsewhere.** Only Fitbod has no free tier. Most apps limit free users instead: Strong allows 3 templates and Hevy 4 routines, and progress charts, the plate calculator and progression suggestions are the usual paid extras. So our pitch is "no caps, your full history, honest progression", not "free logging". Pricing evidence is in competitors.md.
- **Convex search can't do this job alone.** It has no typo tolerance, only prefix-matches the last term, and has no synonyms. The catalog is about 1k rows, so search runs **on the device** over a cached copy, with our own scorer. Convex stores and versions the catalog.
- **Convex doesn't keep writes across a reload.** Its mutation queue lives in memory, so a reload or killed PWA loses pending mutations. We add an IndexedDB outbox with idempotent upserts keyed by client UUIDs.

## Decisions (confirmed with the user 2026-11-23)

| Area | Decision | Cost / trust note |
|---|---|---|
| Frontend | Vite 8 + React 19 + TS + Tailwind 4 + vite-plugin-pwa | Static SPA, offline shell |
| Backend | Convex, the user's cloud account (free tier) | Free: 1M calls, 0.5 GB storage, 1 GB DB I/O a month. Estimated $0 at ~100 users, ~$7–20/mo at ~2k |
| Auth | Convex Auth v2.1.0: email+password and Google | No paid dependency. 2.x is brand new, so it's pinned and isolation-tested |
| Reset email | Google Apps Script web app on a personal Gmail, called from a Convex action with a shared secret | Free. Gmail quota is ~100 recipients/day |
| Catalog data | free-exercise-db (Unlicense) is the base. RepDB free tier (attribution, no dataset republishing) adds granular equipment, gap exercises and illustrations. Plus our own curated aliases and commonness | wger left out of v1 (share-alike on edits) |
| Images | RepDB illustrations first. Otherwise free-exercise-db images **hotlinked** from upstream behind a `communityImages` flag | User chose to ship these despite unclear provenance. One switch turns them off |
| Hosting | Cloudflare Pages (free, no commercial-use clause). Vercel Hobby is non-commercial only | Not deployed in this pass |
| AI | None. All suggestions are rule-based | $0 per user |

Because of the RepDB license, generated catalog files that contain RepDB data are git-ignored and built by a script. They must never be published as a dataset or API. User data export contains only the user's own data.

## Data model

- **Shared catalog** (`exercises`, `catalogMeta`): stable internal `exId` (`ex_` + slug, never reused), `sources[]` = {source, sourceId, commit/version}, aliases, equipment[], primary[] / secondary[] muscles (internal taxonomy), pattern, mechanic, `loadType` (weighted | bodyweight | assisted | timed), `commonness` (curated 1–5, **not** usage), `status` (active | merged → `mergedInto`). Merging keeps old IDs resolvable, so history never breaks.
- **Private, per user** (each row has `ownerId`; every function checks `ctx.auth`): `customExercises`, `settings`, `favorites`, `programs` (days with planned slots), `sessions`, `sessionExercises`, `sets`. Each row has a client UUID `cid`, `updatedAt` and `deleted` (tombstone).
- **Units:** canonical kg plus the as-entered `{value, unit}`, so 45 lb plates never drift to 44.9.
- **Measured usage** (your own recent and frequent exercises) is computed from your logs and kept separate from curated commonness.

## Sync design

The local IndexedDB store is the UI's source of truth. Every edit writes locally, then adds an op to the outbox. `push(ops)` upserts by `cid` and is idempotent: replaying an op is a no-op. Conflicts are last-writer-wins per row on the client `updatedAt`, and a tombstone beats an older edit. A reactive `changes(since)` query streams server rows back. The UI shows the sync state: saved on device, syncing, synced, or error with retry. One limitation: two devices editing the same set offline resolve to the later edit.

## Metrics (defined, not oversold)

- **e1RM:** Epley, only from sets of ≤10 reps, labelled "estimated".
- **PRs:** heaviest weight at a given rep count, best estimated 1RM, most reps (bodyweight), longest hold (timed), best session volume. Each is per exercise and never compared across exercises.
- **Volume load:** Σ weight × reps of working sets only, warm-ups excluded. Assisted sets record the assistance and aren't counted as load.
- **Weekly muscle sets (estimate):** working sets × 1.0 for a primary muscle and × 0.5 for a secondary. Labelled an estimate of exposure, not stimulus or recovery.

## Stages

1. **Foundation:** scaffold, schema, auth, catalog pipeline + import (stable IDs, provenance).
2. **Search and exercise browser:** device-side indexed scorer, filters, sparse-result suggestions, tests.
3. **Logging and offline:** active session screen, previous performance, warm-ups, rest timer, notes, undo, substitutions, outbox and sync, units.
4. **Programs:** split templates (UL / PPL / full body / custom), days and slots, a rolling "next day" queue instead of fixed weekdays, skip/move without data loss, planned vs completed.
5. **Body map:** front/back SVG, session and week coverage, primary vs secondary, tap a muscle → its exercises and suggested additions/substitutes.
6. **Progress, data and PWA:** history, PRs, trends, export (JSON/CSV), delete account, install, Apps Script reset email.
7. **Verification:** search relevance, logging tap counts, offline recovery, data isolation and the body map, on a real mobile viewport.

## Core release vs later

- **Core:** everything above, plus a plate and warm-up calculator, a rule-based double-progression hint that shows its rule, smart substitutions (same pattern, equipment you have), quick-start from the "next" program day, and a program-balance explanation.
- **Later experiments:** import from Strong/Hevy CSV, deload and fatigue hints, wger CC-BY-SA images with attribution, shared programs, Apple Health/Google Fit, i18n.
