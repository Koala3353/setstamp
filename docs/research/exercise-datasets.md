# Exercise catalog sources: research and recommendation

Researched 2026-11-23. Licenses, pricing and counts below were checked against live sources on that date: GitHub API and raw files, the wger public API, vendor pricing and terms pages. Counts for free-exercise-db, wger, exercemus and RepDB were computed by downloading the actual data files.

Use case: a free, non-subscription gym-tracking PWA with a Convex backend. We need to import the catalog once, cache it in Convex, ship it to clients (offline) and re-sync it from time to time. Any source that forbids storage, forbids redistribution or requires a paid subscription is unsuitable for the core catalog.

---

## 1. TL;DR

| Decision | Choice |
|---|---|
| **Primary data source** | **yuhonas/free-exercise-db**, structured fields only (Unlicense / public domain). Import `dist/exercises.json` once into Convex and treat it as our own seed. **Do not ship its images.** |
| **Secondary (gap fill + images)** | **wger** (`/api/v2/exerciseinfo/`). Per-entry licenses are CC-BY-SA 3/4 or CC0, and images carry per-image `license` and `license_author`. Use it to fill gaps and to source attributable images. |
| **Alternative for visuals** | **RepDB free tier** (sergei-argutin/exercise-dataset): 708 exercises with original WebP illustrations, free for commercial in-app use **with attribution**, but **no redistribution as a dataset/API**. This is the best option if we want images on every core lift on day 1. |
| **Reject** | ExerciseDB/AscendAPI, MuscleWiki and API Ninjas (paid, storage/caching restricted or commercial use not allowed on the free tier). Kaggle megaGym and exercemus (license/provenance unclear). |

---

## 2. Comparison table

| Source | # exercises | Data license | Media license | Cache/redistribute in-app? | Cost | Fields: force / mechanic / level | Muscle vocab | Last activity |
|---|---|---|---|---|---|---|---|---|
| **yuhonas/free-exercise-db** | **876** (counted) | **Unlicense** (public domain) | **Unclear / likely infringing** (scraped; see §3.1) | Data: **yes**, no attribution needed. Images: **no** | Free | yes / yes / yes (some nulls) | 17 coarse groups | Last commit 2026-09-27 |
| **wger** (wger.de API) | **979** (API `count`); 288 have images, 46 have videos | Per entry: CC-BY-SA 4 (821), CC-BY-SA 3 (132), CC0 (26). Code AGPL-3.0 | Per image: CC-BY-SA 4 (301), CC-BY-SA 3 (88), CC0 (6); 46 flagged AI-generated | **Yes**, with attribution, and **share-alike** on derived data | Free; public reads not throttled | none / none / none (category only) | 15 anatomical muscles + `name_en` common names | Release 2.7, 2026-09-03; commits 2026-11-21 |
| **RepDB free tier** | **708** | Custom "RepDB Free Tier License v1.0" | Same license (original AI-generated WebP, 2 poses) | **In-app yes** with attribution; **no** redistribution as dataset/API | Free (paid tier removes attribution) | yes / yes / yes + unilateral, MET, goals | ~29 granular anatomical | Commit 2026-11-15 |
| **ExerciseDB / AscendAPI** | 1,500 (free v1); "11,000+" (v2, paid) | Proprietary. Terms: data owned by AscendAPI; revocable license only while subscribed | Proprietary GIFs/videos | **No.** Terms describe real-time fetching only (no storage); rights end when the subscription ends | v1 free; v2 via RapidAPI / custom pricing | body part / target / secondary | ExerciseDB-specific | GitHub repo is now a README-only AGPL shell (2025-11-25) |
| **MuscleWiki API** | 1,900+ (7,700+ videos) | Proprietary | Proprietary videos | **No.** Metadata may be cached ≤30 days, thumbnails ≤24 h, videos only transiently; no re-hosting | Free plan is playground only; $10 to $199.99/mo | n/a | MuscleWiki | Active |
| **API Ninjas Exercises** | "over 3,000" | Proprietary | Images on premium only | Storage not addressed; **commercial use not allowed on free tier** | Free 3,000 calls/mo (non-commercial); $39 to $199/mo | type, difficulty only | Same 16 groups as free-exercise-db (likely the same upstream) | Active |
| **exercemus/exercises** | 872 | Code MIT. Per-exercise `license` is present on only **1 of 872** | No images bundled | Unclear: it mixes wger (CC-BY-SA) with exercises.json without per-item license | Free | no force/mechanic | 21 muscles + groups | 2025-07-31 |
| **wrkout/exercises.json** (upstream of free-exercise-db) | ~870 | Unlicense | Maintainer says images were "scraped off the internet" | Images no | Free | yes | same as yuhonas | 2025-02-16 |
| **hasaneyldrm/exercises-dataset** | 1,324 | "MIT + media terms" | GIFs © Gym visual | Media no | Free | ExerciseDB-style | ExerciseDB-style | 2026-07-16 |
| **Everkinetic** | ~100 illustrations | n/a | Original site gone; illustrations survive inside wger as CC-BY-SA 3 (author "Everkinetic", 83 images) | Via wger with attribution | Free | n/a | n/a | Defunct (forks 2014 to 2023) |
| **Kaggle megaGym** (niharika41298/gym-exercise-data) | ~2,900 rows | **Could not verify** (Kaggle page did not render; mirrors list no license) | none | Don't use | Free | type, level, rating | bodybuilding.com-style | Static |

---

## 3. Per-source notes

### 3.1 yuhonas/free-exercise-db (chosen primary, data only)

- Repo: https://github.com/yuhonas/free-exercise-db. GitHub's API reports license `Unlicense`, 2.17k stars, not archived, last push 2026-09-27. The latest commits (2026-08/09) added exercises such as the kettlebell halo.
- **Data URL (combined):** `https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json` (≈982 KB, JSON array of 876 objects).
  - Per-exercise files: `https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/<id>.json`
  - JSON Schema: https://github.com/yuhonas/free-exercise-db/blob/main/schema.json
  - NDJSON build target (`make dist/exercises.nd.json`) is also available.
  - **Pin a commit SHA** in the import URL instead of `main` so imports are reproducible.
- **Image URL pattern (do not ship, see license below):** `https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/` + `images[i]`, e.g. `.../exercises/Barbell_Squat/0.jpg` (verified HTTP 200). Usually two frames, `0.jpg` and `1.jpg`. 3 exercises have no images.

**Field schema (all 11 keys present on all 876 records):**

| Field | Type | Values / notes |
|---|---|---|
| `id` | string `^[0-9a-zA-Z_-]+$` | e.g. `Barbell_Squat`. Unique (0 duplicates). Use as `sourceId`. |
| `name` | string | Unique (0 case-insensitive duplicates) |
| `force` | `pull`/`push`/`static`/null | 371/371/104/30 null |
| `level` | `beginner`/`intermediate`/`expert` | 525/294/57 |
| `mechanic` | `compound`/`isolation`/null | 491/298/87 null |
| `equipment` | enum or null | barbell 170, dumbbell 123, other 122, body only 111, cable 81, **null 77**, machine 67, kettlebells 56, bands 20, medicine ball 17, exercise ball 12, foam roll 11, e-z curl bar 9 |
| `primaryMuscles` | string[] | 17-value enum: abdominals, abductors, adductors, biceps, calves, chest, forearms, glutes, hamstrings, lats, lower back, middle back, neck, quadriceps, shoulders, traps, triceps |
| `secondaryMuscles` | string[] | same enum |
| `instructions` | string[] | step list |
| `category` | enum | strength 584, stretching 123, plyometrics 61, powerlifting 38, olympic weightlifting 35, strongman 21, cardio 14 |
| `images` | string[] | relative paths `"<id>/0.jpg"` |

**Licensing verdict:**

- **Structured data (names, enums, muscles): OK.** The Unlicense permits copying, modifying and distributing for any purpose, commercial or not, with no attribution. Names and muscle and equipment facts are low-risk regardless.
- **Images: NOT OK.** This is confirmed by primary sources:
  - Issue #2: the maintainer says he has "no idea where the images are from", so use is at your own risk. https://github.com/yuhonas/free-exercise-db/issues/2
  - Issue #13 (open): commenters trace images to ExRx.net. The maintainer (2026-08-02) is considering swapping them for placeholders. https://github.com/yuhonas/free-exercise-db/issues/13
  - The upstream wrkout CONTRIBUTING says the images were scraped, and the maintainer advises against using them in commercial projects. A reverse image search in that thread points to bodybuilding.com. https://github.com/wrkout/exercises.json/issues/305
- **Instruction text: medium risk.** The phrasing style ("This will be your starting position.") matches the old bodybuilding.com exercise database. One commenter found no copying vs ExRx, but provenance is unverified. Recommendation: import instructions as a draft, then rewrite or shorten them in our own words before launch, or ship without instructions at first. Names, fields and muscles are fine.

**Coverage of the requested movements:**

| Movement | Present? | Entry |
|---|---|---|
| Barbell back squat | yes | `Barbell Squat` (+ `Barbell Full Squat`, `Wide Stance Barbell Squat`) |
| Front squat | yes | `Front Barbell Squat`, `Front Squat (Clean Grip)` |
| Romanian deadlift | yes | `Romanian Deadlift`, `Stiff-Legged Dumbbell Deadlift` (no "Dumbbell RDL" by name) |
| Hip thrust | yes | `Barbell Hip Thrust`, `Barbell Glute Bridge` |
| Lat pulldown | yes | `Wide-Grip Lat Pulldown`, `Close-Grip Front Lat Pulldown`, `V-Bar Pulldown`, `Underhand Cable Pulldowns` |
| Cable fly | yes | `Cable Crossover`, `Low Cable Crossover`, `Flat Bench Cable Flyes`, `Incline Cable Flye`; `Butterfly` (pec deck) |
| Leg press | yes | `Leg Press`, `Narrow Stance Leg Press` |
| Hack squat | yes | `Hack Squat` (machine), `Barbell Hack Squat` |
| Bulgarian split squat | **weak** | No entry by that name. `Split Squat with Dumbbells` exists. `Split Squats` is miscategorized (see below). |
| Pull-up / assisted | partial | `Pullups`, `Chin-Up`, `Band Assisted Pull-Up`. **No assisted-pull-up machine.** |
| Plank (timed) | yes | `Plank` (`force: static`); no `Side Plank` |
| Dips | yes | `Dips - Chest Version`, `Dips - Triceps Version`, `Parallel Bar Dip`, `Bench Dips`, `Dip Machine`. No assisted-dip machine. |

**Spot check (5+ entries), data-quality findings:**

1. `Split Squats`: category `stretching`, primary `hamstrings`, equipment `null`. **Wrong.** It should be strength/quads+glutes.
2. `Bodyweight Flyes`: equipment `e-z curl bar`. **Odd** (it's a bodyweight/roller movement).
3. `Barbell Hip Thrust`: category `powerlifting`, secondary includes `calves`. **Questionable.** Calves are not meaningfully involved.
4. `Barbell Squat`: primary quadriceps; secondary calves, glutes, hamstrings, lower back. Reasonable, but glutes should arguably be primary.
5. `Plank`: `static`, `isolation`, primary abdominals, secondary none. Acceptable (no `isTimed` flag; derive it from `force: static`).
6. `Band Assisted Pull-Up`: `force: null`, equipment `other`. Missing data.
7. `Leg Press` / `Hack Squat`: quads primary; glutes, hams, calves secondary. Fine.

Other issues:
- 77 null equipment, 87 null mechanic, 30 null force.
- `shoulders` is a single bucket (no front/side/rear delt split).
- Naming style is inconsistent ("Pullups" vs "Chin-Up", "Flyes" vs "Fly").
- `category: powerlifting` is used for gym staples.
- Per the README, 25 duplicate image files exist (irrelevant once images are dropped).

### 3.2 wger (chosen secondary)

- API root: https://wger.de/api/v2/. Docs: https://wger.readthedocs.io/en/latest/api/api.html
- `GET https://wger.de/api/v2/exerciseinfo/?limit=1000` returns all 979 exercises in one call (verified). Also useful: `/exerciseimage/` (395 images), `/video/` (78), `/muscle/`, `/equipment/`, `/exercisecategory/`, `/license/`.
- **Auth and rate limits:** public exercise endpoints need no auth. Per the docs, throttling applies only to ingredient endpoints, POST creation (20/h) and logins; "All other endpoints are unthrottled." Be polite anyway: sync weekly from a Convex cron and keep our own copy.
- **License split (verified):**
  - Code: AGPL-3.0-or-later (README "License" section: https://github.com/wger-project/wger). This does not affect us, since we only consume the data.
  - Exercise data: "Creative Commons (see individual entries)". Each exercise has a `license` object plus `license_author`. Each translation has `license`, `license_author`, `license_author_url`, `license_derivative_source_url` and `author_history`.
  - Images and videos: each `exerciseimage`/`video` object carries `license` (id → `/license/`), `license_title`, `license_object_url`, `license_author`, `license_author_url`, `license_derivative_source_url`, `author_history`, and (images) `is_ai_generated`. **So yes, the API exposes per-image license and author.**
  - License ids: 1 = CC-BY-SA 3, 2 = CC-BY-SA 4, 3 = CC0, 4 = CC-BY 4, 5 = ODbL.
- **Obligations if we use wger content:** show attribution (author, license name/link, source link to wger) next to the exercise or on a credits screen. **Share-alike:** if we modify a CC-BY-SA entry (e.g. edit its description), our modified version must be released CC-BY-SA. Keep wger-derived text in separate fields with its license so this stays contained. Commercial use and caching are allowed under CC.
- **Gaps in attribution metadata:** 104/395 images and 95/979 exercises have an empty `license_author`. They still carry a license (mostly CC-BY-SA 3 from early uploads), so attribute those as "wger.de contributors".
- **Coverage:** good modern gym coverage, including `Pendulum Squat`, `Belt Squat`, `Hip Thrust`, `Bulgarian split squats`, `Assisted Pull-Up`, `Triceps Dips (Assisted)`, `Side Plank`, `Machine Hip Abduction`, `Plate-Loaded Lat Pulldown`, `Machine chest fly`, `Pec deck rear delt fly`.
- **Data-quality problems (significant):**
  - 160/979 have **no primary muscles** and 229/979 have **no equipment**. There is no "machine" equipment value at all; the list is Barbell, Bench, Cable machine, Dumbbell, Gym mat, Incline bench, Kettlebell, Pull-up bar, Resistance band, SZ-Bar, Swiss Ball, none.
  - 38 entries end in "(Custom)" (user duplicates). 14 are split into "left"/"right" (e.g. `Bulgarian split squats left`).
  - Non-English names appear in the English translation (`Jalón al pecho con agarre ancho`, `Curl De Muñeca Con Barra`).
  - Odd names: `Bodyweight Squat HD`, `Single-Leg Lunge with Kettlebell:`.
  - No force/mechanic/level fields.
  - Spot checks:
    - `Leg Press`: primary = hamstrings, calves, glutes, quads, no equipment (wrong/overbroad).
    - `Plank`: secondary = biceps, quads, triceps (odd).
    - `Squats` (id 615): Quads + Glutes, Barbell, OK.
    - `Romanian Deadlift`: hams+glutes / trapezius, OK.
    - `Dips`: chest+triceps, OK.
  - **Do not bulk-import wger.** Cherry-pick by id.
- Maintenance: very active (release 2.7 on 2026-09-03; commits 2026-11-21).

### 3.3 RepDB free tier (alternative for visuals)

- Repo: https://github.com/sergei-argutin/exercise-dataset. License: `LICENSE-DATA.md` (RepDB Free Tier License v1.0). Data: `exercises.json` (also at https://exercise-dataset.com/exercises.json). Images: `images/flat/<id>-start.webp`, `-peak.webp` or `-main.webp`. Last commit 2026-11-15.
- Fields:
  - `id`, `name_en/de/es`, `description_*`, `instructions_*`, `tips_*`
  - `category`, `force_type`, `mechanic`, `difficulty`, `body_part`
  - `primary_muscles`, `secondary_muscles` (granular: gluteus_maximus/medius, anterior/lateral/posterior_deltoid, erector_spinae, rhomboids, hip_flexors, …)
  - `goals`, `tags`, `is_unilateral`, `is_bodyweight`, `met`, `equipment` (granular: smith_machine, leg_press, hack_squat, lat_pulldown_machine, assisted_pullup_machine, dip_machine, …), `images`
- Coverage of the requested list is the best of any free source: `Barbell Back Squat`, `Front Squat`, `Romanian Deadlift`, `Barbell Hip Thrust`, `Lat Pulldown`, `Cable Fly`, `Leg Press`, `Hack Squat`, `Bulgarian Split Squat`, `Assisted Pull Ups` (machine) + `Band Assisted Pull Ups`, `Plank`/`Side Plank`, `Chest Dips`/`Machine Assisted Dips`. Spot checks (Lat Pulldown, RDL, Hip Thrust, Plank, Assisted Pull Ups) all had sensible muscles.
- **Terms (verified in LICENSE-DATA.md):**
  1. Free for personal and commercial use inside applications.
  2. Attribution is required: "Exercise data by RepDB (repdb.co)" link on an about/credits screen.
  3. **No republishing as a dataset, dataset repo or API**, including modified or derived versions.
  4. Images may be resized, cropped or recolored for in-app use.
  5. No generative-AI derivation from the images.
  6. Premium sample animations are evaluation-only.
  7. The license claims a sui generis database right (Germany).
- Fit: caching in Convex and serving to our own PWA clients is "inside applications". We must not expose a public catalog API or let users export the catalog as a dataset. Risk: a single-vendor custom license that is new in 2026 and could change. **Snapshot the license file alongside the import.**

### 3.4 ExerciseDB (exercisedb.dev / AscendAPI / RapidAPI): reject

- https://exercisedb.dev advertises a free V1 API ("1,500 exercises with GIFs", no key) and custom pricing via support@ascendapi.com.
- https://github.com/ExerciseDB/exercisedb-api is now just a README (AGPL file, last commit 2025-11-25) that links to the RapidAPI/Notion pricing. Its README warns the playground endpoints are "not recommended for production".
- Terms of Use: https://exercisedb.notion.site/ExerciseDB-API-Terms-of-Use-226983b728ca8090bf7be79564e4b356. The Notion page is JS-rendered, so I could not fetch it directly. Its indexed text states:
  - data and content are AscendAPI's exclusive property;
  - subscribers get a non-exclusive, non-transferable, revocable license for the subscription period only;
  - the API is for real-time fetching (no storage);
  - rights end on cancellation or non-payment.
- This is **incompatible with caching and offline redistribution** in a free app.

### 3.5 MuscleWiki API: reject

- Pricing: https://api.musclewiki.com/pricing. Basic is free (500 calls, playground only, no API key); Testing $10/mo (1k calls); Growth $39.99 (30k); Professional $99.99 (100k); Enterprise $199.99 (300k). Paid plans include commercial use rights.
- Terms: https://api.musclewiki.com/api-terms.
  - Text metadata may be cached ≤30 days, thumbnails and bodymaps ≤24 h, videos only transiently.
  - No re-hosting media on our servers/CDN; no passing data to third parties.
  - Attribution line required in the ToS/privacy policy.
- This needs a recurring cost and gives no durable copy, so it does not fit.

### 3.6 API Ninjas Exercises: reject

- https://api-ninjas.com/api/exercises: "over 3,000 exercises". `/v1/exercises` returns at most 5 results per call; `offset` and `images` are premium; `/v1/allexercises` needs Business+.
- FAQ: "Commercial use of the Exercises API is not permitted on the free tier."
- Pricing (https://api-ninjas.com/pricing): Free 3,000 calls/mo (non-commercial); Developer $39; Business $99; Professional $199 (shown as annual-billing rates).
- Storage terms are not stated on the page.
- Its muscle and type enums are identical to free-exercise-db's, which suggests the same upstream.

### 3.7 exercemus/exercises: reject as a source (useful as a reference)

- https://github.com/exercemus/exercises (code MIT, last commit 2025-07-31), 872 exercises.
- The README says each exercise has its own license that must be followed, yet only 1/872 records actually has a `license` field. Most content derives from exercises.json (same provenance concern) and wger (CC-BY-SA), now unlabeled.
- Nice schema ideas worth borrowing: `aliases`, `variation_on`, `tips`, `muscle_groups` map.

### 3.8 Others

- **wrkout/exercises.json** (https://github.com/wrkout/exercises.json): the upstream of free-exercise-db. Unlicense, but the images were scraped; the author now sells a commercial dataset (wrkout.xyz).
- **hasaneyldrm/exercises-dataset**: 1,324 ExerciseDB-style entries; GIFs are "© Gym visual". Media is not usable.
- **Everkinetic**: original site/repo gone (the `everkinetic/everkinetic-data` repo returns 404). Its ~83 illustrations live on inside wger as CC-BY-SA 3 with author "Everkinetic". Take them from there with attribution.
- **Kaggle megaGym** (https://www.kaggle.com/datasets/niharika41298/gym-exercise-data): the license could not be verified (page didn't render; mirrors on baselight and Hugging Face show no license), and its columns look scraped. Avoid.

---

## 4. Recommendation

**Primary: free-exercise-db (structured data only).**

- Import `dist/exercises.json` from a pinned commit into a Convex `exercises` table with `source: "fedb"` and `sourceId: id`.
- Drop the `images` field (or keep the paths for internal reference only, and never render them).
- Re-normalize equipment, muscles and category into our own taxonomy (§6).
- Fix known bad rows (§3.1 spot checks).
- Treat `instructions` as draft text to rewrite. We get public-domain data with no attribution or share-alike strings attached, so our curated catalog stays ours.

**Secondary: wger, cherry-picked.**

- Fill the gaps (§5) with wger entries by id. Store `license`, `license_author` and a source URL per entry, and keep wger-derived descriptions in fields tagged CC-BY-SA (attribution plus share-alike apply only to those).
- Pull images from `/exerciseimage/` with `license` in {1, 2, 3, 4}. Render the author and license under the image, and list all of them on a Credits page.
- Skip `is_ai_generated` images if desired.

**Optional: RepDB for visuals and gap names.**

- Adopt it if illustrated core lifts on day 1 matter more than avoiding a custom license.
- It covers every movement on the test list, including the gaps.
- Requires a credits link and an in-app-only promise: no public catalog API and no catalog export feature.

Otherwise ship v1 text-only with muscle-map SVGs. wger's muscle SVGs are AGPL code assets, so draw our own body map instead.

Import architecture: a Convex `internalAction` fetches the pinned URL, normalizes it and upserts by `(source, sourceId)`. Exercises get our own stable `slug`, so a source can be swapped later. Users' custom exercises live in a separate table.

---

## 5. Gaps: common exercises missing or weak in free-exercise-db

Fill these from wger (W) or RepDB (R), or author them ourselves (O):

| Missing / weak | Notes | Fill from |
|---|---|---|
| Bulgarian split squat (rear-foot elevated), DB/BB | Only `Split Squat with Dumbbells`; `Split Squats` is mislabeled stretching | W, R |
| Assisted pull-up (machine) | Only band-assisted | W `Assisted Pull-Up`, R |
| Assisted dip (machine) | none | W `Triceps Dips (Assisted)`, R |
| Side plank | Only `Push Up to Side Plank` | W, R |
| Pendulum squat | none | W |
| Belt squat | none | W |
| Hip abduction machine (seated) | `Thigh Abductor` exists; naming should be modernized | W `Machine Hip Abduction`, R |
| Chest-supported row (DB / machine / T-bar) | none (`Leverage Iso Row` only) | R |
| Pec deck (named) | `Butterfly` exists; rename/alias it | O (alias) |
| Dumbbell Romanian deadlift (named) | `Stiff-Legged Dumbbell Deadlift` only; add alias | W, R |
| Single-leg RDL (DB) | only `Kettlebell One-Legged Deadlift` | W, R |
| Smith machine hip thrust, Smith squat | partial Smith coverage | R |
| Two-handed kettlebell swing | only `One-Arm Kettlebell Swings` | W |
| Pendlay row | none | O |
| Hollow hold, burpee, jump rope, jumping jacks | none | W, O |
| Cable lateral raise (standing, single-arm) | only `Cable Seated Lateral Raise` | W, R |
| Machine lateral raise | none | W |
| Glute kickback machine | only cable/bodyweight | W |
| Seated row machine (plate-loaded / selectorized) | none | R, O |
| Nordic hamstring curl (named) | `Natural Glute Ham Raise` = alias | O (alias) |
| Copenhagen plank | none | R |

Also add aliases (e.g. "Back Squat" → `Barbell Squat`, "Pec Deck" → `Butterfly`, "RDL" → `Romanian Deadlift`, "Pull-up" → `Pullups`).

---

## 6. Recommended internal muscle taxonomy

Two levels: a fine `muscle` for storage, and a `group` for filters and volume charts. Store `primary: Muscle[]` and `secondary: Muscle[]`. Volume counting: primary = 1.0 set, secondary = 0.5.

| Internal muscle (`id`) | Group | free-exercise-db | wger (id: name / name_en) | RepDB |
|---|---|---|---|---|
| `chest_upper` / `chest` | Chest | chest | 4 Pectoralis major / Chest | pectoralis_major |
| `front_delts` | Shoulders | shoulders* | 2 Anterior deltoid / Shoulders | anterior_deltoid |
| `side_delts` | Shoulders | shoulders* | none | lateral_deltoid |
| `rear_delts` | Shoulders | shoulders* | none | posterior_deltoid |
| `rotator_cuff` | Shoulders | none | none | infraspinatus_teres_minor |
| `lats` | Back | lats | 12 Latissimus dorsi / Lats | latissimus_dorsi |
| `upper_back` (rhomboids, mid traps) | Back | middle back | none | rhomboids |
| `traps` | Back | traps | 9 Trapezius | trapezius |
| `lower_back` | Back | lower back | none | erector_spinae, quadratus_lumborum |
| `biceps` | Arms | biceps | 1 Biceps brachii | biceps_brachii |
| `brachialis` | Arms | (biceps) | 13 Brachialis | brachialis, brachioradialis |
| `triceps` | Arms | triceps | 5 Triceps brachii | triceps_brachii |
| `forearms` | Arms | forearms | none | forearm_flexors, forearm_extensors |
| `abs` | Core | abdominals | 6 Rectus abdominis / Abs | rectus_abdominis, transverse_abdominis |
| `obliques` | Core | abdominals* | 14 Obliquus externus abdominis | obliques |
| `serratus` | Core | none | 3 Serratus anterior | none |
| `hip_flexors` | Core/Legs | none | none | hip_flexors |
| `glutes` | Legs | glutes | 8 Gluteus maximus / Glutes | gluteus_maximus |
| `glute_med` / `abductors` | Legs | abductors | none | gluteus_medius, abductors |
| `adductors` | Legs | adductors | none | adductors |
| `quads` | Legs | quadriceps | 10 Quadriceps femoris / Quads | quadriceps |
| `hamstrings` | Legs | hamstrings | 11 Biceps femoris / Hamstrings | hamstrings |
| `calves` | Legs | calves | 7 Gastrocnemius, 15 Soleus | gastrocnemius, soleus |
| `tibialis` | Legs | none | none | tibialis_anterior |
| `neck` | Other | neck | none | none |

\* Coarse source values: map fedb `shoulders` to `front_delts` by default. Then override per exercise with a curated table, e.g.:
- lateral raises → `side_delts`
- rear-delt fly, face pull → `rear_delts`
- obliques work (Russian twist, side bend, side plank) → `obliques` instead of `abs`

Also normalize:
- **Equipment:** `barbell`, `dumbbell`, `kettlebell`, `cable`, `machine` (with subtype: `selectorized`, `plate_loaded`, `smith`), `bodyweight`, `band`, `ez_bar`, `trap_bar`, `bench`, `pull_up_bar`, `dip_station`, `medicine_ball`, `stability_ball`, `foam_roller`, `other`.
- **Movement pattern** (none of the free sources provide this; derive it once via a curated mapping): `squat`, `hinge`, `lunge`, `horizontal_push`, `vertical_push`, `horizontal_pull`, `vertical_pull`, `carry`, `core_anti_extension`, `core_rotation`, `isolation_upper`, `isolation_lower`, `cardio`, `mobility`.
- **Tracking type:** `weight_reps`, `bodyweight_reps`, `assisted_reps` (negative load), `duration` (plank, holds; derive from `force: static`), `distance_time` (cardio, carries).

---

## 7. Sources

- https://github.com/yuhonas/free-exercise-db (README, schema.json, LICENSE via GitHub API = Unlicense)
- https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json
- https://github.com/yuhonas/free-exercise-db/issues/2, /issues/12, /issues/13
- https://github.com/wrkout/exercises.json and https://github.com/wrkout/exercises.json/issues/305
- https://wger.de/api/v2/exerciseinfo/, https://wger.de/api/v2/exerciseimage/, https://wger.de/api/v2/license/, https://wger.de/api/v2/video/
- https://wger.readthedocs.io/en/latest/api/api.html
- https://github.com/wger-project/wger (README License section; releases)
- https://github.com/sergei-argutin/exercise-dataset (LICENSE-DATA.md, exercises.json)
- https://exercisedb.dev/, https://github.com/ExerciseDB/exercisedb-api, https://exercisedb.notion.site/ExerciseDB-API-Terms-of-Use-226983b728ca8090bf7be79564e4b356
- https://api.musclewiki.com/pricing, https://api.musclewiki.com/api-terms
- https://api-ninjas.com/api/exercises, https://api-ninjas.com/pricing
- https://github.com/exercemus/exercises
- https://github.com/hasaneyldrm/exercises-dataset
- https://www.kaggle.com/datasets/niharika41298/gym-exercise-data (license unverifiable)
