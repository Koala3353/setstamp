# Competitor research: gym-tracking apps

Researched 2026-11-23. Context: free, no-subscription gym-tracking PWA.

## Method and confidence

- Sources: vendor sites and help centres where they loaded, App Store listings, and dated third-party reviews that cite vendor docs (mainly aitoolsbakery.com and sensai.fit, both read Sept–Oct 2026). Every source is linked inline.
- **Reddit could not be read directly.** reddit.com blocks this research tool's user agent, and the one mirror found (redlib) failed DNS. The complaint section therefore relies on App Store and Google Play reviews, Trustpilot, vendor help docs that acknowledge problems, and secondhand summaries of Reddit. Before relying on the complaint themes, spot-check r/fitness and r/weightroom by hand.
- Prices are US-store figures unless marked otherwise. Several App Store listings show two price points for the same plan (legacy and current pricing). Where that happens, both are given.
- Several "comparison" sources are written by competitors (SensAI, Setgraph, Boostcamp, JEFIT). Vendor claims about rivals were cross-checked where possible and are marked when they couldn't be.
- Confidence labels: **V** = verified against the vendor or a store listing. **R** = a dated third-party review citing vendor docs. **U** = unverified or conflicting.

---

## Quick matrix: are the basics paywalled?

| App | Basic logging | Routines/programs | History | Export | Price (mo / yr / lifetime) |
|---|---|---|---|---|---|
| Strong | Free, unlimited (V) | **3 templates on free** (R) | Kept; some charts PRO (R) | CSV, appears free (R/U) | $3.99–4.99 / $23.99–29.99 / $79.99–99.99 (R) |
| Hevy | Free, unlimited (R) | **4 routines, 7 custom exercises on free** (R) | Logs kept; **graphs limited to ~3 months** (R) | CSV exists, tier not stated (U) | $2.99–3.99 / $23.99 / $74.99 (R) |
| Fitbod | **No free tier**, trial only (R) | Paid | Paid | — | $15.99 / $95.99 (legacy $12.99 / $79.99) (R) |
| JEFIT | Free (vendor) | Free plans; adaptive/periodized plans Elite | "Full history" free (vendor) | U | $12.99 / $69.99 / no lifetime (vendor) |
| Liftosaur | Free (R) | All 61 programs + scripting free (R) | Free; **graphs Premium** (R) | Free (R) | $4.99 / $39.99 / $99.99 (R) |
| FitNotes (Android) | Free, no ads (R) | Free | Free | CSV, free (R) | Free |
| Boostcamp | Free (V) | Free builder, 99 of 132 coach programs free (V) | Kept (V) | Not stated (U) | $14.99 / $59.99 / no lifetime (V) |
| Alpha Progression | Free, unlimited (V) | Manual plans free; generator Pro (V) | Free; **detailed charts Pro** (V) | CSV, free (V) | $12.99 / $79.99 (V) |
| StrengthLog | Free, unlimited, no ads (V) | Basic programs free; advanced Premium (V) | Basic stats free (V) | Not stated (U) | Varies widely, roughly $77–109/yr (U) |
| Setgraph | Free download (V) | Not itemised (U) | Not itemised (U) | CSV (V) | $9.99 / $59.99 / $199.99 (V) |
| MuscleWiki | Library free, offline (V) | Custom routines/plans Premium (V) | Analytics Premium (V) | U | ~$4.99–9.99 / $29.99–49.99 (U) |
| Gymshark Training | Free (V) | Free | Free | U | Free, no subscriptions (V) |
| wger (OSS) | Free, AGPL (V) | Free, with progression rules (V) | Free | REST API (V) | Free / self-host |
| OpenLift (OSS-ish) | "Core free forever" (vendor) | Free | Free | U | Premium tier exists, price not found (U) |

---

## Per-app detail

### Strong
- **Free vs PRO:** Unlimited workouts on free. **Free is capped at 3 templates.** PRO adds unlimited templates, all charts, body-part measurements, the **plate calculator** and warm-up calculator, and themes. The rest timer and CSV export don't appear in the PRO list, so they look free, but no vendor page states that outright. Workout history stays after PRO is cancelled. Sources: [aitoolsbakery Strong review](https://aitoolsbakery.com/blog/strong-app-review/), [App Store](https://apps.apple.com/app/strong/id464254577), [strong.app](https://www.strong.app/).
- **Price:** The App Store lists both $3.99 and $4.99 monthly, $23.99 and $29.99 yearly, and $79.99 and $99.99 lifetime. There is also a 6-month plan at $19.99 (R).
- **Platforms:** iPhone, Android, Apple Watch, plus "Strong Cloud" for other devices. No Wear OS app (R).
- **Offline:** Not stated by the vendor (U).
- **Strengths:** Polished, fast logger with a long track record. Lifetime option. CSV export, which Hevy can import.
- **Complaints:** The 3-template cap is the main reason people upgrade. The Android app has fewer features than iOS (plate calculator and supersets differ). Export can't be re-imported into Strong. The Google Play rating (4.3) is lower than the homepage claims. Source: [aitoolsbakery](https://aitoolsbakery.com/blog/strong-app-review/).

### Hevy
- **Free vs Pro:** Logging is unlimited. **Free allows 4 routines and 7 custom exercises, and stats/graph history is limited** (help centre says 30 days or 3 months, depending on the screen). Body measurements on free are limited to weight and waist. Pro adds unlimited routines and exercises, all-time graphs, Hevy Trainer and the warm-up calculator. The **plate calculator is free.** Web app access is free. Sources: [aitoolsbakery Hevy review](https://aitoolsbakery.com/blog/hevy-review/), [JEFIT comparison](https://www.jefit.com/blog/fitbod-vs-strong-vs-jefit-vs-hevy). Hevy's own help centre returned 403 to this tool.
- **Price:** $2.99 or $3.99 monthly, $23.99 yearly, $74.99 lifetime. The yearly plan goes 50% off in sales; lifetime is "never discounted" (R).
- **Export:** CSV export of workouts and measurements exists via Settings > Export & Import Data ([help article](https://help.hevyapp.com/hc/en-us/articles/38001424401943)). Whether free users get it is not stated (U). Import works only from Strong CSV, and only once (R).
- **Platforms:** iOS, Android, Apple Watch, Wear OS and web (R). Offline: not documented (U).
- **Strengths:** Very large user base (4.9 stars, about 94k iOS ratings and about 268k Google Play ratings), cheapest Pro, social features.
- **Complaints:** The Discover social feed can't be turned off. No Garmin integration. A 150-set cap per workout, even on Pro. No Family Sharing (R).

### Fitbod
- **No permanent free tier.** Most reviews describe a 3-workout trial. Fitbod's help centre describes a 7-day trial that rolls into a paid plan. The two descriptions conflict (U).
- **Price:** $15.99/mo or $95.99/yr after a 2026 increase. Older subscribers keep $12.99/$79.99. Sources: [thepricer](https://www.thepricer.org/how-much-does-fitbod-cost/), [sensai pricing comparison](https://www.sensai.fit/blog/fitness-app-pricing-free-tier-comparison), [App Store](https://apps.apple.com/app/id1041517543).
- **Strengths:** Automatic workout generation, recovery-based muscle selection, equipment filtering.
- **Complaints:** Weight recommendations are the top complaint, e.g. after 13 reps at 50 lb it suggested 15 reps at 40 lb, and users say it "never adjusted". Others call workouts repetitive and report billing and refund problems. Trustpilot scores range 3.0–3.5. Fitbod's [help centre](https://help.fitbod.me/hc/en-us/sections/360001078993-How-Fitbod-Works) says early recommendations are conservative on purpose. Sources: [Trustpilot](https://www.trustpilot.com/review/fitbod.me), [dr-muscle review](https://dr-muscle.com/fitbod-workout-app-review/) (a competitor).

### JEFIT
- **Free vs Elite (vendor page):** Free has "full logging, full history, full library", 1,400+ exercises, 700+ JEFIT plans and 20k+ community plans, the muscle recovery chart, 1RM/PRs/volume, and **7 custom exercises**. Elite adds a 12-week adaptive plan, periodization of your own plans, a strength score, weekly set targets and movement balance. Elite is subscription-only. Source: [jefit.com blog](https://www.jefit.com/blog/fitbod-vs-strong-vs-jefit-vs-hevy).
- **Price:** $12.99/mo or $69.99/yr. A 50% off Thanksgiving promo was live on the day of research.
- **Ads:** Conflicting. Boostcamp's comparison says free JEFIT shows ads; JEFIT's own blog says it doesn't (U).
- **Complaints:** A January 2026 Google Play review says an auto-progression bug left unfixed for months made the app "too unreliable". Others report weights history not saving. Google Play rating is 4.4 from 89k reviews. Source: [Google Play](https://play.google.com/store/apps/details?id=je.fit).

### Liftosaur
- **Free vs Premium:** Free includes all 61 programs, the program editor, Liftoscript (its scripting language), logging, history, measurements, import/export, Health sync, equipment rounding and the rest timer. **Premium adds** the plates-per-side display, **graphs**, muscle views, week insights, rest-timer push notifications and Live Activity, the Apple Watch app, and API/MCP access. Source: [sensai Liftosaur review](https://www.sensai.fit/blog/liftosaur-review), checked 31 Oct 2026.
- **Price:** $4.99/mo or $39.99/yr (14-day trial), $99.99 lifetime. One App Store listing shows a $79.99 lifetime price (U).
- **Platforms:** iOS, Android, and a web app at liftosaur.com/app. Open source under AGPL-3.0; the repo describes it as a **PWA wrapped in native shells** ([GitHub](https://github.com/astashov/liftosaur)). Works without an account or a connection (R).
- **Complaints:** The developer acknowledges it is "too complicated" with a steep learning curve. Users reported lag and crashes after a June 2026 rewrite, and Watch/phone sync problems (R).
- **Relevance:** This is the closest architectural analogue to the planned app: a PWA, open source, and programs and history free.

### FitNotes (Android)
- Free, with **no ads and no subscription**. Data is stored locally. CSV export and manual backup are available. Last updated Oct 2025 (v25.1, Android 10+). Android only; the iOS app "FitNotes 2" is a different product. Sources: [WhistleOut review](https://www.whistleout.com/CellPhones/Apps/fitnotes-app-review), [BGR](https://bgr.com/2021999/essential-android-apps-fitness-workout-tracking), [APKPure](https://apkpure.com/fitnotes-gym-workout-log/com.github.jamesgay.fitnotes). The Google Play page didn't render for this tool (U).
- **Strengths:** Fast, minimal and private. Often cited as the model for "a log that just works".
- **Complaints:** Backup is manual, so users have to remember to do it. No iOS version. Dated UI (R).

### Boostcamp
- **Free (vendor):** The program library, including 99 of 132 coach programs, the tracker, and an unlimited program builder. Rest timer is free and uncapped. History and PRs are kept after cancelling. **Plate calculator: 10 free uses.** **Pro:** the remaining coach programs, strength-score views, a muscle-tracker heatmap, exercise analytics, trends and e1RM charts. Source: [boostcamp.app/is-boostcamp-free](https://www.boostcamp.app/is-boostcamp-free).
- **Price:** $14.99/mo or $59.99/yr, no lifetime option.
- **Platforms:** iOS and Android, plus a desktop program builder. Export and offline aren't documented (U).
- **Note:** Metering the plate calculator at 10 uses is the clearest example found of a trivial utility being monetised.

### Alpha Progression
- **Free (vendor):** Unlimited logging, manual plans, offline logging, 795 exercises with video, custom exercises, rest timer, supersets/dropsets, PRs, training reports, body measurements, e1RM, and **CSV export**. **Pro:** plan and workout generator, **weight and rep recommendations**, detailed charts, RIR, periodization and deloads, the **plate calculator** and warm-up calculator, and multiple gym profiles. Source: [alphaprogression.com](https://alphaprogression.com/en).
- **Price:** $12.99/mo or $79.99/yr, with a 14-day trial on yearly.
- **Note:** It paywalls progression suggestions and the plate calculator. A free app could offer both as simple deterministic logic.

### StrengthLog
- **Free (vendor):** No ads, unlimited logging, custom exercises, basic stats and PRs, basic programs, automatic set timer, calculators (1RM, Wilks/IPF, warm-up), **muscle map**, measurements and goals. **Premium:** advanced programs, in-depth stats, RPE/RIR logging, %1RM/RPE-based program writing, and "repeat with adjusted weights". Source: [strengthlog.com](https://strengthlog.com/).
- **Price:** Inconsistent across listings, from $77.99/yr to $109/yr (US) (U). Account registration is required (V).
- **Note:** The plate calculator is reportedly free (U).

### Setgraph
- Free download with Pro at **$9.99/mo, $59.99/yr, or $199.99 lifetime** (US App Store). The listing doesn't say which features are free. CSV export is available. Apple-only: iPhone, iPad, Watch and Vision. Source: [App Store](https://apps.apple.com/us/app/setgraph-gym-workout-tracker/id1209781676).
- **Complaints from visible reviews:** Backup couldn't be restored after an account switch. The add-set button is small and in a corner, causing accidental edits to earlier sets. Exercise search autocorrects to the wrong exercise. Requests for timed exercises. Price.

### MuscleWiki
- The exercise library and video demos are free, work offline, and have no ads. **Premium:** unlimited personalized plans, advanced filters, an interactive muscle map, workout analytics and custom routines. Sources: [App Store](https://apps.apple.com/us/app/-/id1096827640), [musclewiki.com/gopremium](https://musclewiki.com/gopremium).
- **Price:** Conflicting. Roughly $4.99–9.99/mo and $29.99–49.99/yr. The trial is 7 or 30 days depending on the source ([Adapty paywall library](https://adapty.io/paywall-library/musclewiki/), Oct 2026) (U).
- **Note:** Primarily an exercise reference, not a log. Custom routines are paywalled.

### Gymshark Training
- Gymshark's help centre says it is "100% free" with no ads or subscriptions. It offers guided workouts plus custom workout building and logging. The UK support page says the app is **no longer downloadable on Android** (U for other regions). Sources: [Gymshark support](https://support.gymshark.com/en-US/article/the-gymshark-training-app), [Tom's Guide review](https://www.tomsguide.com/wellness/fitness/gymshark-training-app-review-effective-workouts-for-free).
- **Note:** A marketing app. Tom's Guide says it "lacks the customization" of premium rivals.

### Open source: wger, OpenLift
- **wger:** AGPL-3.0. Offers routines with **automatic weight progression rules**, nutrition (Open Food Facts), measurements, progress photos, a REST API and multi-user gym management. Apps for Android/F-Droid, iOS and Flathub, or self-host with Docker. Offline support isn't documented, and the apps sync to a server (U). Source: [README](https://raw.githubusercontent.com/wger-project/wger/master/README.md).
- **OpenLift:** Says "core free forever", with premium features funding development. Per its FAQ, the backend is AGPL but **the mobile app is closed source**. Its self-hosting dates conflict between pages. Treat it as unverified. Source: [FAQ](https://openlift-app-website-stage.pages.dev/docs/overview/faq).
- Also worth knowing: Liftosaur (AGPL, above) and openGym (listed on [AlternativeTo](https://alternativeto.net/software/hevy-workout-tracker/about/)).

---

## Synthesis

### (a) Is "basic functionality is behind expensive subscriptions" true?

**Mostly not, for logging; partly, for routines and history.** The accurate version of the claim:

- **Truly paywalled (no free use at all):** **Fitbod** only ($95.99/yr). Among the mainstream loggers, it's the one case where the claim holds as stated.
- **Logging free, but routines capped low:** **Strong (3 templates)** and **Hevy (4 routines, 7 custom exercises)**. Anyone running a 4–6 day split, or keeping both an A/B and a deload version, hits the cap quickly. This is the real friction behind the "basic features are paywalled" feeling.
- **Logs kept, but you can't see your own history visually:** Hevy limits graph history to about 3 months. Liftosaur and Alpha Progression put charts behind Premium/Pro. Strong limits charts on free. Boostcamp paywalls e1RM charts and analytics. **"Your own progress chart" is the most commonly paywalled feature.**
- **Small utilities monetised:** The plate calculator is paid in Strong, Alpha Progression and Liftosaur (per-side display), and limited to 10 uses in Boostcamp. Hevy and StrengthLog give it away.
- **Progression suggestions** are paid in Alpha Progression, JEFIT (adaptive) and Fitbod.
- **Export is generally not paywalled** where it's documented (Strong, Liftosaur, Alpha Progression, FitNotes, Setgraph). Hevy's tier for export is unclear.
- **Genuinely free with no meaningful limits:** FitNotes (Android only, local only), Gymshark Training (limited customisation, Android availability uncertain), wger (needs a server; UX is web-first).
- **Price perspective:** Hevy ($23.99/yr or $74.99 lifetime) and Strong ($29.99/yr) are cheap. The expensive tier is Fitbod ($95.99), Alpha Progression ($79.99), StrengthLog (up to $109), Boostcamp ($59.99) and JEFIT ($69.99), and those prices are mostly for AI or generated programming, not logging.

**Positioning implication:** "Free logging" is not a differentiator. Hevy, Strong and others already offer it. The differentiators are **no caps on routines or exercises, full-history charts, utilities included, no account required, and a lossless export/import round trip.**

### (b) Five biggest recurring frustrations
Reddit could not be read directly; see Method.

1. **Artificial caps on routines, custom exercises and chart history.** Strong's 3 templates, Hevy's 4 routines, 7 exercises and ~3 months of graphs, and JEFIT's 7 custom exercises. These are the most cited reasons to upgrade.
2. **Bad or opaque auto-progression.** Fitbod's illogical weight drops, JEFIT's months-long auto-progression bug, and Liftosaur's confusing "two suggested weights". Users want suggestions they can understand and override.
3. **Data lock-in and fragile backups.** Strong's export can't be re-imported, Hevy imports only Strong CSV and only once, Setgraph users couldn't restore backups, and FitNotes backups are manual-only.
4. **Logging friction mid-set.** Too many taps per set, small or corner-placed buttons causing mis-edits (Setgraph), autocorrecting exercise search, and rest timers that need the screen on. Secondhand summaries of Reddit say the praised apps need 2–3 taps per set.
5. **Bloat and complexity.** Social feeds you can't turn off (Hevy), scripting-language learning curves (Liftosaur), cluttered ad-supported free tiers (JEFIT, disputed), and plus sync and stability regressions after rewrites (Liftosaur, JEFIT).

Also recurring: platform gaps (Android behind iOS on Strong; Wear OS and Garmin missing) and billing or renewal complaints (Fitbod).

### (c) Opportunities for a free PWA (useful, not bloat)

1. **Fast, one-handed set logging.**
   - *Value:* Addresses frustration #4. A large thumb-zone "Done" button pre-filled from last session, so one tap confirms a set. Swipe or ± steppers adjust weight and reps. Completing a set starts the rest timer automatically. Undo replaces confirmation dialogs.
   - *Tradeoff:* Pre-fill can cause blind confirms with wrong numbers, so it needs a clear diff against last time. On iOS, PWA notifications and vibration are limited, so rest-timer alerts only fire reliably in the foreground (web push on iOS needs Add to Home Screen). Design for an on-screen countdown first.

2. **Rule-based progression suggestions (double progression, linear, RPE-free).**
   - *Value:* Free equivalent of a paid feature in Alpha Progression and JEFIT, and fixes the opacity problem (#2). For example: "Hit 3×12 at 40 kg → next time 42.5 kg × 8". Always show the rule that produced the suggestion, and allow per-exercise rep ranges and increments.
   - *Tradeoff:* Deterministic rules ignore fatigue and deloads, and need a stall rule (e.g. 3 failed sessions → deload 10%). Keep it to 2–3 schemes rather than a scripting language, which is the Liftosaur complexity trap.

3. **Rolling splits instead of calendar-bound scheduling.**
   - *Value:* "Next up: Pull B" no matter what day it is. A missed Monday doesn't break the week. Supports PPL, Upper/Lower and A/B rotations. Optional calendar mode for people who want it.
   - *Tradeoff:* Weekly volume becomes variable. Show a rolling 7-day volume view so users don't lose track.

4. **Plate calculator and warm-up ramp, free and unlimited.**
   - *Value:* Paid or metered in Strong, Alpha Progression, Liftosaur and Boostcamp. Small, offline logic. Shows per-side plates for the configured bar and plate inventory, rounds suggestions to loadable weights, and auto-generates warm-up sets.
   - *Tradeoff:* Needs equipment configuration (bar weight, plates, microplates, kg/lb, dumbbell increments). Keep defaults sensible and settings to one screen.

5. **Smart substitutions.**
   - *Value:* "Bench is taken" → offers alternatives for the same movement pattern and muscle, filtered by available equipment, and carries over the progression baseline (or marks it as fresh). Fitbod does this, but behind a paywall.
   - *Tradeoff:* Requires curated exercise metadata (pattern, primary muscle, equipment). Swapped exercises should keep separate histories, or charts become misleading.

6. **Quick start plus no-account onboarding.**
   - *Value:* Start logging in under 10 seconds: "Empty workout", "Repeat last session", or pick a 3-tap template (full body, PPL, Upper/Lower). No signup, local-first storage (IndexedDB), works offline.
   - *Tradeoff:* Local-only data is fragile; iOS can evict PWA storage. Mitigate with persistent storage requests, prominent "last backup" status, and opt-in file or cloud sync.

7. **Program-balance explanations.**
   - *Value:* A plain-language weekly check, e.g. "Back: 14 sets, Chest: 6 sets, no hamstring work, push:pull 1:2". Paid in Boostcamp (heatmap) and JEFIT (movement balance), free in StrengthLog (muscle map). Explain why it matters and don't nag.
   - *Tradeoff:* Set-counting by muscle needs primary/secondary muscle weights per exercise. The thresholds are opinionated, so present them as ranges with sources rather than verdicts.

8. **Lossless export and import, plus full-history charts.**
   - *Value:* Addresses frustrations #1 and #3. Full JSON export that re-imports cleanly, CSV for spreadsheets, and importers for Strong and Hevy CSV, which removes switching costs. Unlimited e1RM, volume and best-set charts over all of history.
   - *Tradeoff:* Importers need maintenance whenever competitors change their CSV format. Charts over years of data need efficient aggregation on low-end phones.

**Deliberately skip (bloat for this positioning):** social feeds, AI workout generation, nutrition, and video libraries (link out or use simple illustrations instead).
