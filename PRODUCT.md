# Product

<!-- impeccable:product-schema 1 -->

> Written without a live interview: the requester asked the design agent to use judgment. Facts come from docs/PLAN.md and docs/research/competitors.md (confirmed with the user 2026-11-23) and from the build brief. Lines marked *(inferred)* were not confirmed and should be checked.

## Platform

web

Mobile-first installable PWA (Vite + React). Used mostly as a home-screen app on phones; desktop is a secondary viewport, not a separate design.

## Users

People who lift in a gym and log their training on their phone between sets. In the moment of use they are standing on the gym floor, often holding the phone in one hand (the other on a dumbbell, a bar or a water bottle), sweaty or chalky, slightly out of breath, and glancing at the screen at arm's length for a few seconds before the next set. Lighting ranges from harsh fluorescent and daylight to dim basement gyms. Wi-Fi and cell signal in gyms are often poor.

Secondary moments: planning or editing a program at home, and reviewing history and PRs on the sofa. *(inferred)*

The product is a friend's free alternative to subscription trackers, so early users are the builder's friends and their friends. *(inferred from brief)*

## Product Purpose

Log a workout with as few taps as possible, keep every set forever, and show honest progress, without caps or a subscription. Success: a user can start the next program day and log a set in a couple of taps, one-handed, without thinking about the app; and later trust what the history and PR screens tell them.

## Positioning

Logging is already free in most competitors; what they paywall is history depth, template/routine counts, charts, plate calculators and progression hints. This app's claim: no caps, your full history, honest progression, and it works offline in the gym. Progress numbers are labelled for what they are (estimated 1RM, estimated weekly muscle sets), and progression hints show the rule they used. No AI, no social feed.

## Operating Context

- Core loop: open app → Today → start or continue the next program day → log sets (weight × reps, done) → rest timer → finish.
- Programs use a rolling "next day" queue, not fixed weekdays; skips and moves never lose data.
- Exercise search runs on the device over a cached catalog (~1k exercises) with typo tolerance and synonyms.
- Data is stored on the device first (IndexedDB) and synced to Convex in the background; the UI shows sync state: offline, saved on device, syncing, synced, error with retry and pending count.
- Units: kg or lb, stored as entered so 45 lb plates never drift.
- Exercise images are third-party hotlinks (free-exercise-db) behind a `communityImages` switch; they may be missing or slow.

## Capabilities and Constraints

- Core: active session logging with previous performance, warm-ups, rest timer, notes, undo, substitutions; programs (UL / PPL / full body / custom); exercise browser with filters; body map of muscle coverage; history, PRs, trends; export (JSON/CSV); delete account; install; plate and warm-up calculator; rule-based double-progression hint.
- Metrics: e1RM (Epley, sets ≤10 reps, labelled "estimated"); PRs per exercise only; volume load from working sets only; weekly muscle sets labelled an estimate of exposure.
- Auth: email + password and Google (Convex Auth).
- Hosting: static SPA on Cloudflare Pages; free tiers only.
- Later, not now: Strong/Hevy import, deload hints, shared programs, health integrations, i18n.

## Brand Commitments

- No paywall language, no upsell surfaces, no streak guilt or gamified badges. *(inferred from positioning)*
- Honesty is a product feature: estimates are labelled as estimates; the body map shows training exposure and is not a diagnosis of anything.
- No emoji as icons. *(from brief)*

## Evidence on Hand

- docs/PLAN.md, docs/research/*.md.
- Exercise catalog (free-exercise-db base + curated aliases), built by scripts/build-catalog.ts.
- Body map component: src/bodymap/.
- Name: **Setstamp** (2026-11-24); wordmark, mark, voice and tagline in BRAND.md. No testimonials or user counts yet. Do not invent them.

## Product Principles

1. **The set is the unit of work.** Every screen is judged by how fast it gets a lifter from pocket to a logged set and back.
2. **Glanceable, then precise.** Numbers that matter (weight, reps, rest time) read at arm's length; detail is one tap away, never in the way.
3. **Nothing is lost.** Writes land on the device instantly; sync, undo and tombstones mean a bad tap or a dead connection never costs a set.
4. **Say what a number is.** Estimates, rules and sources are labelled where they appear.
5. **Free means whole.** No feature is shown in a degraded or teaser state.

## Accessibility & Inclusion

- WCAG 2.2 AA contrast in both themes, including at reduced screen brightness. Primary actions ≥48px, all targets ≥44px, operable with one thumb in the lower half of the screen.
- Respects prefers-reduced-motion and prefers-color-scheme (with an explicit override in Settings).
- Numeric entry uses numeric keypads; nothing requires precise drags or multi-finger gestures.
