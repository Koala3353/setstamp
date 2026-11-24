# Exercise catalog build report

Built 2026-11-23 by `scripts/build-catalog.ts` (run with `node --experimental-strip-types scripts/build-catalog.ts`). Catalog content hash (`catalog.meta.json` `version`): `47390c3c4a1250fa`.

## Pinned sources

| Source | Repo | Commit | Committed | File sha256 |
|---|---|---|---|---|
| free-exercise-db | yuhonas/free-exercise-db | `f00c92c7dcf1216a928a52c3706c7ce8e2f71ed5` | 2026-09-27 | `5bb747e3…d40bf` |
| RepDB free tier | RepDB/exercise-dataset | `f12da458a90f353a86c953f204304d5a8bd98275` | 2026-11-15 | `ad7c602f…5948f` |

- Pins live in `catalog/sources.lock.json` (committed). A normal run reuses the pins and checks the file hash. `--update` resolves upstream HEAD through the GitHub API and re-pins. `--offline` uses only `catalog/.cache/`.
- **The RepDB repo has moved.** `sergei-argutin/exercise-dataset` now redirects to `RepDB/exercise-dataset` (GitHub API `full_name`). Image and data URLs use the canonical name. The old raw URL still serves the same bytes.
- RepDB image path pattern, verified: `https://raw.githubusercontent.com/RepDB/exercise-dataset/<commit>/images/flat/<id>-{start,peak,main}.webp` (HTTP 200). The `images.flat` object lists the poses, and the build orders them start, peak, main.
- free-exercise-db image pattern: `https://raw.githubusercontent.com/yuhonas/free-exercise-db/<commit>/exercises/<id>/<n>.jpg` (HTTP 200).
- The license files (`LICENSE.md`, `LICENSE-DATA.md`) are snapshotted into the cache next to the data, as research §3.3 recommends.
- Downloads are parsed only with `JSON.parse`. Rows are shape-checked: ID regex, string arrays, image-path regex. Every source enum value must map to a domain enum or the build fails.

## Counts

| | n |
|---|---|
| free-exercise-db rows in | 876 |
| RepDB rows in | 708 |
| Curated gap exercises authored | 5 |
| **Active catalog rows** | **1,383** |
| Cross-source merged (fedb + RepDB) | 200 (114 curated match entries, 87 automatic name+equipment matches) |
| fedb only / RepDB only / curated only | 671 / 507 / 5 |
| In-source duplicate rows folded | 6 (see below); 0 found automatically |
| Merged (retired) exIds | 0 (first build) |
| Rows with any image / with a RepDB image | 1,377 / 707 |
| Commonness 5 / 4 / 3 / 2 / 1 | 40 / 54 / 452 / 599 / 238 |
| Tracking: weight_reps / bodyweight_reps / duration / distance_time / assisted_reps | 793 / 262 / 284 / 42 / 2 |
| Patterns | isolation_upper 281, mobility 241, hinge 156, horizontal_push 120, squat 83, cardio 73, isolation_lower 69, vertical_push 63, horizontal_pull 62, core_flexion 59, lunge 52, core_rotation 38, vertical_pull 36, core_anti_extension 33, carry 17 |

Images: RepDB images come first, then fedb images (source `free-exercise-db`, attribution "free-exercise-db (unverified provenance)"), so the UI can filter fedb images out behind the `communityImages` flag. 6 rows have no image: the 5 curated rows and fedb "Kettlebell Halo with Overhead Extension".

## How matching works

1. **Curated `match` entries** (`catalog/curated.ts`) take priority. Each lists the source rows that are the same exercise. Curated entries own their refs, so automatic matching never touches them. An unknown ref, or a ref claimed twice, fails the build.
2. **Automatic matching** runs on unclaimed rows only. It compares a normalised name and the load equipment. Normalising lower-cases the name, maps plurals and spellings (Pullups → pull up, Flyes → fly, tricep → triceps, legged → leg), and drops equipment words and "with/the/left/right". Load equipment treats smith and machine as equal, because fedb labels Smith exercises "machine". A fedb row with `null` equipment only matches RepDB bodyweight rows. That rule stopped a false match of fedb "Windmills" (a stretch) with RepDB "Dumbbell Windmill". When several candidates remain, the exact equipment match wins; still-ambiguous pairs are logged (0 this run).
3. **Field precedence in a merged row:** curated override, then RepDB, then fedb. This covers name, muscles, equipment, level, mechanic and unilateral. Instructions use RepDB `instructions_en` when present, otherwise fedb.
4. **Variants stay separate rows** and are linked by `family` (39 families, 872 rows have one). Examples: barbell vs dumbbell bench, flat vs incline, back vs front squat, RDL vs stiff-leg deadlift. fedb "Air Bike" (a bicycle crunch) is merged with RepDB "Bicycle Crunch", not with the cardio machine.
5. **Name collisions** between different exercises get the equipment appended on the non-RepDB row. One so far: fedb "Spider Curl" became "Spider Curl (EZ bar)", with the old name kept as an alias.

### Duplicates folded (true duplicates, same movement)

| Kept as | Folded rows |
|---|---|
| Barbell Back Squat | fedb `Barbell_Squat` + `Barbell_Full_Squat` |
| Front Squat | fedb `Front_Barbell_Squat` + `Front_Squat_Clean_Grip` |
| Triceps Dip | fedb `Parallel_Bar_Dip` + `Dips_-_Triceps_Version` |
| Pec Deck | RepDB `pec-deck` + `machine-chest-fly` |
| Seated Barbell Overhead Press | fedb `Barbell_Shoulder_Press` (seated, per its instructions) + `Seated_Barbell_Military_Press` |
| EZ-Bar Skull Crusher | fedb `EZ-Bar_Skullcrusher` + `Lying_Triceps_Press` |

No left/right split rows exist in either source at these commits; the left/right rule is in place for future versions.

### Gaps filled

These are in RepDB and were missing or weak in fedb: Bulgarian split squat, assisted pull-up machine, assisted dip machine, side plank, hip abduction machine, chest-supported DB and machine rows, dumbbell RDL, single-leg RDL, Smith hip thrust, two-hand kettlebell swing, Pendlay row, hollow hold, burpee, jump rope, jumping jacks, cable lateral raise, nordic curl, Copenhagen plank, hip thrust machine (Glute Drive).

Authored as source `curated`, because neither dataset has them: **Pendulum Squat, Belt Squat, Chest-Supported T-Bar Row, Machine Lateral Raise, Glute Kickback Machine**. They have short instructions in our own words and no images.

Aliases cover the §5 naming gaps, e.g. "Seated Row Machine" → Chest-Supported Machine Row, "Butterfly" → Pec Deck, "Natural Glute-Ham Raise" → Nordic Hamstring Curl, plus RDL, SLDL, OHP, BSS, skull crusher ↔ lying triceps extension, and chin-up vs pull-up.

### Unmapped values

None. The build fails on any unmapped muscle or equipment value. Mappings that lose detail:

- **RepDB equipment:** every machine subtype (`leg_press`, `pec_deck`, `assisted_pullup_machine`, cardio machines, …) → `machine`. `lat_pulldown_machine` → `cable`. `smith_machine` → `smith`. `flat_bench` → `bench`. `bosu_ball`, `rings`, `suspension_trainer`, `sled`, `plates`, `sandbag`, `battle_rope`, `jump_rope`, `plyo_box`, `ab_wheel`, `wrist_roller` and `bicycle` → `other`. `slam_ball` and `wall_ball` → `medicine_ball`. A missing value → `bodyweight`.
- **RepDB muscles:**
  - `gluteus_medius` → `glutes`, or `abductors` when the name is an abduction move.
  - `brachioradialis` → `forearms`. Research §6 put it under brachialis; anatomy puts it in the forearm.
  - `erector_spinae` and `quadratus_lumborum` → `lower_back`.
  - `rhomboids` → `upper_back`.
  - `transverse_abdominis` → `abs`.
  - `soleus` and `gastrocnemius` → `calves`.
- **fedb muscles:**
  - `shoulders` → `rear_delts` for rear/reverse fly, face pull and bent-over lateral; `side_delts` for lateral, upright and scaption; `rotator_cuff` for external/internal rotation; `front_delts` otherwise.
  - `abdominals` → `obliques` for twist, side bend, oblique, woodchop and windmill names; `abs` otherwise.
  - `middle back` → `upper_back`.
- **fedb equipment:** `null` → `bodyweight`, plus equipment inferred from the name (pull-up bar, dip station, Smith, trap bar, EZ bar, bench).
- **Category:** fedb/RepDB `stretching` → pattern `mobility`, `cardio` → `cardio`. fedb `plyometrics` → `cardio` unless a name rule fits (e.g. plyo push-up → horizontal_push).

## Muscle verification (research item 7)

Source columns use raw source vocabulary. "Final" is what ships. "Override" means we changed what the preferred source (RepDB) says. Rationale is anatomical: which joints the movement loads and which muscles cross them.

| Exercise (exId) | RepDB P / S | fedb P / S | Final P / S | Override? |
|---|---|---|---|---|
| Barbell back squat (`ex_barbell_back_squat`) | glute max, quads / erectors, hamstrings | quads / calves, glutes, hams, lower back | quads, glutes / adductors, lower_back | **Yes.** Hamstrings dropped: they cross both hip and knee, so their length barely changes in a squat and their contribution is small. Adductors added (adductor magnus is a strong hip extensor at depth). fedb's calves rejected. |
| Front squat (`ex_front_squat`) | glute max, quads / erectors, hamstrings | quads / calves, glutes, hams (+abs) | quads, glutes / adductors, upper_back, lower_back | **Yes.** Same as back squat. Upper back added (it holds the front rack). |
| Barbell RDL (`ex_barbell_romanian_deadlift`) | glute max, hamstrings / erectors | hamstrings / calves, glutes, lower back | hamstrings, glutes / lower_back, adductors | **Minor.** RepDB kept; adductors added. fedb's calves rejected. |
| Conventional deadlift (`ex_barbell_deadlift`) | erectors, glute max, hamstrings / quads, traps | lower back / calves, forearms, glutes, hams, lats, mid back, quads, traps | glutes, hamstrings, lower_back / quads, adductors, traps, forearms | **Minor.** RepDB primaries kept; adductors and forearms (grip) added. fedb's single "lower back" primary is too narrow. |
| Barbell hip thrust (`ex_barbell_hip_thrust`) | glute max, glute med / hamstrings | glutes / calves, hamstrings | glutes / hamstrings | No (RepDB). fedb's calves rejected. |
| Leg press (`ex_leg_press`) | glute max, quads / hamstrings | quads / calves, glutes, hams | quads, glutes / adductors | **Yes.** Hamstrings dropped and adductors added, same reasoning as the squat. |
| Hack squat (`ex_hack_squat`) | glute max, quads / gastrocnemius, hamstrings | quads / calves, glutes, hams | quads, glutes / adductors | **Yes.** Hamstrings and calves dropped (the ankle doesn't plantar-flex under load); adductors added. |
| Bulgarian split squat (`ex_dumbbell_bulgarian_split_squat`) | glute max, quads / hamstrings | (not in fedb) | quads, glutes / adductors | **Yes.** Front-leg hamstrings dropped; adductors added. |
| Leg extension (`ex_leg_extension`) | quads / – | quads / – | quads / – | No. |
| Lying leg curl (`ex_lying_leg_curl`) | hamstrings / gastrocnemius | hamstrings / – | hamstrings / calves | No (RepDB). The gastrocnemius crosses the knee and assists knee flexion. |
| Barbell bench press (`ex_barbell_bench_press`) | pec major / front delt, triceps | chest / shoulders, triceps | chest / front_delts, triceps | No. |
| Incline DB press (`ex_incline_dumbbell_press`) | pec major / front delt, triceps | chest / shoulders, triceps | chest / front_delts, triceps | No. |
| Barbell OHP (`ex_barbell_overhead_press`) | front + side delt / traps, triceps | shoulders / triceps | front_delts, side_delts / triceps, traps | No (RepDB). |
| DB lateral raise (`ex_dumbbell_lateral_raise`) | side delt / front delt | shoulders / – | side_delts / front_delts, traps | **Minor.** Upper traps added (they shrug toward the top of the raise). fedb's "shoulders" → side delts by rule. |
| Face pull (`ex_face_pull`) | rear delt, rhomboids / traps | shoulders / middle back | rear_delts, upper_back / traps, rotator_cuff | **Minor.** Rotator cuff added: the external rotation at the end of the pull is the cuff's job. |
| Pull-up (`ex_pull_up`) | lats / biceps, rear delt, rhomboids | lats / biceps, mid back | lats / biceps, upper_back, rear_delts | No. |
| Lat pulldown (`ex_lat_pulldown`) | lats / biceps, rear delt, rhomboids | lats / biceps, mid back, shoulders | lats / biceps, upper_back, rear_delts | No. fedb's "shoulders" read as rear delts. |
| Barbell row (`ex_barbell_row`) | lats, rhomboids / biceps, rear delt | mid back / biceps, lats, shoulders | lats, upper_back / biceps, rear_delts, lower_back | **Minor.** Lower back added: the erectors hold the hinge isometrically. |
| Cable fly (`ex_cable_fly`) | pec major / front delt | chest / shoulders | chest / front_delts | No. |
| Chest dip (`ex_chest_dip`) | pec major, triceps / front delt | chest / shoulders, triceps | chest, triceps / front_delts | No (RepDB). |
| Plank (`ex_plank`) | rectus + transverse abdominis / erectors | abdominals / – | abs / obliques, lower_back | **Minor.** Obliques added; they resist the trunk sagging and rotating in a plank. |

Data-quality problems in fedb that the overrides fixed:

- `Split_Squats` is filed as a hamstring stretch; it ships as a strength lunge.
- Hip thrust lists calves as secondary.
- Squat, leg press and hack squat list hamstrings and calves as secondary.
- "Air Bike" is a crunch, not the cardio machine.

## Uncertain / follow-ups

- **Commonness is editorial.** It is 5 only for curated staples and 4 for common variants. Uncurated rows default to 3 (RepDB-backed strength), 2 (fedb-only strength, Olympic lifts, plyometrics, RepDB mobility/cardio) or 1 (strongman, bands/chains variants, SMR, fedb-only stretches/cardio). Expect to promote some rows once search testing shows gaps.
- **Pattern and tracking for the ~1,000 uncurated rows come from regex rules.** A few edge cases remain, e.g. "Barbell Zercher Hold" → core_flexion. Carries use `distance_time` as research §6 specifies, so the carried weight is not a tracked field.
- **Dips use `horizontal_push`** so their substitutes are presses and push-ups. Some taxonomies call dips a vertical push.
- `id-map.json` is committed and holds source IDs and first-assigned names, RepDB's among them. It is a join table, not the dataset, but it is the only committed file that derives from RepDB.
- **TypeScript:** `curated.ts` and the script import `../src/shared/domain.ts` with a `.ts` extension, which Node strip-types requires. Type-checking them with `tsc` needs `allowImportingTsExtensions`, or excluding `scripts/` and `catalog/` from the app tsconfig.
