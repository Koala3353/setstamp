// Hand-authored editorial layer for the exercise catalog.
// Consumed by scripts/build-catalog.ts. Committed (contains no RepDB data, only our own
// judgements plus source IDs used as join keys).
//
// Source refs are "<source>:<sourceId>", built with fe() (free-exercise-db) and rd() (RepDB).
// The build fails loudly if a ref does not exist in the pinned source data.

import type { Equipment, Muscle, Pattern, Tracking } from "../src/shared/domain.ts";

export const fe = (id: string) => `free-exercise-db:${id}`;
export const rd = (id: string) => `repdb:${id}`;

export type Commonness = 1 | 2 | 3 | 4 | 5;

export type CuratedEntry = {
  /** Unique key for this entry. For `create` entries it is also the "curated" sourceId. */
  key: string;
  /** Source rows that are the SAME exercise; they are merged into one catalog row. Empty for `create`. */
  match?: string[];
  /** Author a new exercise that neither dataset has (source "curated"). */
  create?: boolean;
  name?: string;
  aliases?: string[];
  commonness?: Commonness;
  pattern?: Pattern;
  family?: string | null;
  tracking?: Tracking;
  equipment?: Equipment[];
  primary?: Muscle[];
  secondary?: Muscle[];
  mechanic?: "compound" | "isolation" | null;
  unilateral?: boolean;
  level?: "beginner" | "intermediate" | "expert" | null;
  instructions?: string[];
  /** Why we overrode source data (surfaced in the report). */
  note?: string;
};

// ---------------------------------------------------------------------------
// Cross-source matching helpers
// ---------------------------------------------------------------------------

/** Name tokens rewritten before automatic name matching (plural/spelling normalisation). */
export const MATCH_TOKEN_MAP: Record<string, string> = {
  pullups: "pull up", pullup: "pull up", pushups: "push up", pushup: "push up", chinups: "chin up",
  chinup: "chin up", situps: "sit up", situp: "sit up", ups: "up", curls: "curl", squats: "squat",
  crunches: "crunch", raises: "raise", flyes: "fly", flye: "fly", flys: "fly", dips: "dip", rows: "row",
  lunges: "lunge", extensions: "extension", presses: "press", deadlifts: "deadlift", kicks: "kick",
  swings: "swing", shrugs: "shrug", twists: "twist", windmills: "windmill", pulls: "pull",
  pulldowns: "pulldown", kickbacks: "kickback", bridges: "bridge", climbers: "climber",
  tricep: "triceps", bicep: "biceps", legged: "leg", db: "dumbbell", kb: "kettlebell", bb: "barbell",
  dumbbells: "dumbbell", kettlebells: "kettlebell", barbells: "barbell", ezbar: "ez bar",
};
/** Tokens ignored for matching. Equipment words are dropped because equipment is compared separately. */
export const MATCH_STOP_TOKENS = new Set([
  "the", "a", "an", "with", "barbell", "dumbbell", "kettlebell", "cable", "machine", "left", "right",
]);

// ---------------------------------------------------------------------------
// Rule tables (first match wins). Tested against the lower-cased canonical name.
// ---------------------------------------------------------------------------

export const PATTERN_RULES: Array<[RegExp, Pattern]> = [
  [/stretch|pose\b|-smr|\bsmr\b|circles|cat-cow|child's|savasana|corpse|90\/90|world's greatest|inchworm|leg swing|thread the needle|cocoons|hip flexor rock|thoracic bridge|downward dog|upward dog|warrior|pilates|tandem stance|single-leg stand|heel-to-toe|balance dome stand|mountain pose|forward fold|half lift|standing split|balance board|shoulderstand/, "mobility"],
  [/treadmill|bicycl|cycling|stationary bike|air bike|elliptical|rowing|skierg|stair ?(climber|master|mill)|step mill|jump rope|rope jumping|running|jogging|^walking|jumping jacks|star jump|burpee|high knees|heel flicks|butt kick|mountain climber|sprint|skating|battle rope|battling rope|wind sprints|fast skipping|\bskip\b|\bhops?\b|\bbound\b|carioca|(box|stride|long|tuck|depth|scissors|rocket|bench|lateral) jump/, "cardio"],
  [/carry|farmer|yoke walk|overhead backward walk|bear crawl|sled drag|backward drag|forward drag|sled push|prowler/, "carry"],
  [/neck|chin tuck/, "isolation_upper"],
  [/step[- ]?ups?\b|step-up/, "lunge"],
  [/\bfly\b|\bflyes?\b|crossover(?! reverse lunge)/, "isolation_upper"],
  [/shrug/, "isolation_upper"],
  [/pallof|twists?\b|wood ?chop|cable lift|judo flip|windmill|side bend|oblique|heel touch|toe touchers|wipers|landmine 180|torso rotation|russian|side jackknife|spell caster|figure 8|halo|around the worlds|medicine ball side throw/, "core_rotation"],
  [/plank|hollow|dead bug|rollout|ab roller|ab wheel|bird.?dog|fallout|body saw|bear plank|stomach vacuum|six inch hold|reverse tabletop/, "core_anti_extension"],
  [/crunch|sit-?ups?\b|leg raise|knee raise|knee\/hip raise|v-?ups?\b|v-sit|toes to bar|hanging pike|ball pike|jackknife|leg pull-in|tuck\b|flutter|scissor kick|l-?sit|dragon flag|boat|elbow to knee|leg lift|bottoms up|butt-ups|janda|gorilla|flat bench lying leg|front leg raises|exercise ball pull-in|bench leg pull-in/, "core_flexion"],
  [/leg curl|hamstring curl|ball leg curl|leg extension|calf|tibialis|abduct|adduct|clamshell|fire hydrant|lateral walk|sumo walk|monster walk|terminal knee|glute kickback|cable kickback|one-legged cable kickback|rear leg raises|side leg raises|hip circles|hip flexion|lying crossover|reverse nordic|groiners|copenhagen|glute[- ]ham|hamstring slides/, "isolation_lower"],
  [/deadlift|rdl|good morning|stiff legs|hip thrust|glute bridge|bridge|swing|pull[- ]?through|hyperextension|back extension|clean|snatch|rack pull|glute drive|kickstand|nordic|reverse hyper|superman|hip lift|hip raise|hip extension|butt lift|jefferson curl|kettlebell pass|atlas|keg load|sandbag load|tire flip|log lift|car deadlift|axle|power partials|vertical swing|sledgehammer|high pull\b|wall ball|slam|throw/, "hinge"],
  [/lunge|split squat|split jump|bulgarian|cossack|pistol|shrimp|single[- ]leg (high )?box squat|side split|one leg barbell squat|skater squat/, "lunge"],
  [/squat|leg press|hack|thruster|wall sit|sissy|chair pose|turkish get/, "squat"],
  [/straight[- ]arm (dumbbell )?pull|pullover|pull-over/, "isolation_upper"],
  [/pull[- ]?ups?\b|chin[- ]?ups?\b|(?<!to )\bchins?\b|pulldown|pull-down|muscle[- ]?ups?|rope climb|front lever|back lever|body-up|dead hang|flexed arm hang|hanging|one handed hang|rocky pull/, "vertical_pull"],
  [/upright row/, "isolation_upper"],
  [/row|face pull|pull apart|bench pull|bent over .*lateral|sled reverse flye/, "horizontal_pull"],
  [/floor press|svend|close-grip dumbbell press/, "horizontal_push"],
  [/overhead press|shoulder press|military|push press|jerk|arnold|handstand|pike push|landmine press|behind the neck press|press behind neck|bradford|see-?saw press|para press|bent press|clean and press|curl and press|lunge press|overhead hold|anti-gravity|neck press|linear jammer|kettlebell .*press|press sit-up|cuban press|bottoms-up press|z press|bodyweight overhead press|standing .*dumbbell press|standing palms?-in/, "vertical_push"],
  [/bench press|chest press|push[- ]?ups?\b|dips?\b|jm press|guillotine|incline .*press|decline .*press|board press|pin press|chest push|spoto|planche|support hold|body tricep press|chain press|heavy bag thrust|incline dumbbell bench|smith press|ez-bar press|tate press/, "horizontal_push"],
  [/curl|extension|kickback|pushdown|pressdown|skull|crusher|crossover|pec deck|butterfly|raise|lateral|rotation|wrist|pronation|supination|finger|plate pinch|hand squeeze|iron cross|crucifix|deltoid|scaption|towel/, "isolation_upper"],
];

/** Default family by name. Variants stay separate rows; family groups them. */
export const FAMILY_RULES: Array<[RegExp, string]> = [
  [/romanian deadlift|\brdl\b|stiff[- ]leg|single leg rdl|one-legged deadlift|kickstand deadlift/, "romanian_deadlift"],
  [/hip thrust|glute bridge|glute drive|hip bridge|butt lift|hip raise/, "hip_thrust"],
  [/deadlift|rack pull/, "deadlift"],
  [/good morning/, "good_morning"],
  [/leg press/, "leg_press"],
  [/split squat|bulgarian/, "split_squat"],
  [/lunge/, "lunge"],
  [/step[- ]?ups?\b/, "step_up"],
  [/squat|hack/, "squat"],
  [/leg curl|hamstring curl|nordic|glute ham/, "leg_curl"],
  [/leg extension/, "leg_extension"],
  [/calf/, "calf_raise"],
  [/hip abduct|thigh abduct/, "hip_abduction"],
  [/hip adduct|thigh adduct/, "hip_adduction"],
  [/bench press|chest press|floor press|smith press|guillotine|board press|pin press|spoto/, "bench_press"],
  [/push[- ]?ups?\b/, "push_up"],
  [/dips?\b/, "dip"],
  [/fly|flye|crossover|pec deck|butterfly/, "chest_fly"],
  [/overhead press|shoulder press|military|push press|arnold|landmine press|behind the neck press|press behind neck/, "overhead_press"],
  [/lateral raise|side lateral|deltoid raise/, "lateral_raise"],
  [/front raise|front .*raise/, "front_raise"],
  [/rear delt|reverse fly|reverse flye/, "rear_delt_fly"],
  [/face pull/, "face_pull"],
  [/upright row/, "upright_row"],
  [/shrug/, "shrug"],
  [/pull[- ]?ups?\b|chin[- ]?ups?\b|(?<!to )\bchins?\b/, "pull_up"],
  [/pulldown|pull-down/, "lat_pulldown"],
  [/row/, "row"],
  [/hammer curl|preacher hammer/, "biceps_curl"],
  [/wrist curl|wrist roller/, "wrist_curl"],
  [/curl/, "biceps_curl"],
  [/skull|lying triceps|triceps? extension|pushdown|pressdown|kickback(?!.*glute)|tate press|jm press/, "triceps_extension"],
  [/plank|side bridge/, "plank"],
  [/crunch|sit-?up/, "crunch"],
  [/leg raise|knee raise|toes to bar/, "leg_raise"],
  [/swing/, "kettlebell_swing"],
  [/clean|snatch|jerk/, "olympic_lift"],
  [/carry|farmer/, "carry"],
];

/** Equipment added from the name, on top of the source's equipment. */
export const EQUIPMENT_NAME_RULES: Array<[RegExp, Equipment]> = [
  [/smith/, "smith"],
  [/trap bar|hex bar/, "trap_bar"],
  [/ez[- ]?bar|e-z/, "ez_bar"],
  [/pull[- ]?ups?\b|chin[- ]?ups?\b|hanging (leg|knee|pike|l-sit|tuck)|(?<!ring )dead hang|toes to bar|(?<!ring )muscle[- ]?ups?/, "pull_up_bar"],
  [/parallel bar|chest dips|triceps dip\b|dips - |weighted dips/, "dip_station"],
  [/bench dips|bench press|incline .*press|decline .*press|incline .*curl|preacher|flat bench|incline bench|hip thrust|chest-supported|on a bench|to a bench|over a bench/, "bench"],
];

/** Tracking rules, checked in order after curated overrides. */
export const DURATION_NAME = /\bholds?\b|plank(?!.*(raises|dips|lift\b|tuck|jack))|dead hang|flexed arm hang|one handed hang|wall sit|l-?sit|v-sit|hollow body|support hold|stretch|pose\b|\bsmr\b|-smr|isometric|vacuum|front lever|back lever|human flag|planche(?! push)|handstand hold|chin tuck|\bstand\b|tandem stance|side bridge|six inch hold/;
/** RepDB marks a few dynamic lifts "static"; never treat these as holds unless the name says hold. */
export const NEVER_DURATION = /deadlift|press|row\b|curl|squat\b|raise|push[- ]?ups?|pull[- ]?ups?|dips?\b|lunge/;
/** Bodyweight movements: logged as bodyweight reps unless weighted or done with load equipment. */
export const BODYWEIGHT_MOVE = /push[- ]?ups?|pull[- ]?ups?|chin[- ]?ups?|\bdips?\b|muscle[- ]?ups?|inverted row|\btrx\b|\brings?\b|suspended|pistol squat$|sit-?ups?|crunch(es)?$|leg raise|knee raise|toes to bar|burpee/;
export const ASSISTED_NAME = /assisted (pull|dip|chin)|machine assisted|assisted .*machine/;
/** Band-assisted moves are logged as bodyweight reps: band assistance cannot be expressed in kg. */
export const BAND_ASSISTED_NAME = /band assisted|band-assisted/;
export const WEIGHTED_BODYWEIGHT_NAME = /weighted|with (a )?weight|plate/;

/** Aliases generated from the canonical name: [pattern, replacement(s)]. */
export const ALIAS_RULES: Array<[RegExp, string[]]> = [
  [/Romanian Deadlift/, ["RDL"]],
  [/Stiff[- ]Leg(ged)? Deadlift/, ["SLDL", "Stiff-Leg Deadlift"]],
  [/Barbell Overhead Press/, ["OHP", "Overhead Press", "Military Press", "Standing Press"]],
  [/Bulgarian Split Squat/, ["BSS", "Rear-Foot Elevated Split Squat", "RFESS"]],
  [/Skull ?[Cc]rusher/, ["Lying Triceps Extension"]],
  [/Lying Triceps? (Extension|Press)/, ["Skull Crusher"]],
  [/Pull[- ]?Ups?\b/, ["Pullup"]],
  [/Push[- ]?Ups?\b/, ["Pushup", "Press-Up"]],
  [/Chin-?Ups?\b/, ["Chinup"]],
  [/Hex Bar/, ["Trap Bar"]],
  [/Trap Bar/, ["Hex Bar"]],
  [/Dumbbell/, ["DB"]],
  [/Kettlebell/, ["KB"]],
  [/Tricep(s)? Pushdown/, ["Triceps Pressdown"]],
  [/Lat Pulldown/, ["Lat Pull-Down"]],
  [/Leg Curl/, ["Hamstring Curl"]],
  [/Leg Extension/, ["Quad Extension"]],
  [/Farmer's Walk/, ["Farmer's Carry"]],
];

/** Name patterns for obscure source rows, given commonness 1 unless curated. */
export const OBSCURE_NAME = /with chains|with bands|from blocks|axle|car deadlift|car drivers|keg|tire flip|atlas|conan|log lift|yoke|rickshaw|circus bell|-smr|\bsmr\b|frankenstein|heavy bag|anti-gravity|gironda|otis|bradford|rocky|linear jammer|kneeling jump squat|jerk balance|jerk dip|rack delivery|heaving|power stairs|spell caster|chain handle|london bridges|pirate ships|guillotine|sled overhead|sled reverse|bench sprint|drop push|return push|moving claw|linear 3-part|kneeling arm drill|backward drag/;

// ---------------------------------------------------------------------------
// Curated entries. Order does not matter for IDs (IDs come from catalog/id-map.json).
// ---------------------------------------------------------------------------

const LEGS_NO_HAMS = "Hamstrings dropped: knee-dominant squatting keeps hamstring length roughly constant, so they contribute little. Adductors (adductor magnus) added as secondary hip extensors.";

export const CURATED: CuratedEntry[] = [
  // ----- Squat family --------------------------------------------------------------------
  { key: "barbell-back-squat", match: [rd("squat"), fe("Barbell_Squat"), fe("Barbell_Full_Squat")],
    name: "Barbell Back Squat", aliases: ["Back Squat", "Squat", "High-Bar Squat", "Low-Bar Squat", "Full Squat", "ATG Squat"],
    commonness: 5, family: "squat", primary: ["quads", "glutes"], secondary: ["adductors", "lower_back"], note: LEGS_NO_HAMS },
  { key: "front-squat", match: [rd("front-squat"), fe("Front_Barbell_Squat"), fe("Front_Squat_Clean_Grip")],
    name: "Front Squat", aliases: ["Barbell Front Squat", "Clean-Grip Front Squat"], commonness: 4, family: "squat",
    primary: ["quads", "glutes"], secondary: ["adductors", "upper_back", "lower_back"], note: LEGS_NO_HAMS },
  { key: "goblet-squat", match: [rd("goblet-squat"), fe("Goblet_Squat")], commonness: 4, family: "squat",
    primary: ["quads", "glutes"], secondary: ["adductors", "abs"] },
  { key: "db-goblet-squat", match: [rd("db-goblet-squat")], commonness: 4, family: "squat",
    primary: ["quads", "glutes"], secondary: ["adductors", "abs"] },
  { key: "leg-press", match: [rd("leg-press"), fe("Leg_Press")], name: "Leg Press", aliases: ["45-Degree Leg Press", "Sled Leg Press"],
    commonness: 5, family: "leg_press", primary: ["quads", "glutes"], secondary: ["adductors"], note: LEGS_NO_HAMS },
  { key: "hack-squat", match: [rd("hack-squat"), fe("Hack_Squat")], name: "Hack Squat", aliases: ["Machine Hack Squat"],
    commonness: 4, family: "squat", primary: ["quads", "glutes"], secondary: ["adductors"], note: LEGS_NO_HAMS + " Calves dropped (no meaningful plantar flexion)." },
  { key: "smith-squat", match: [rd("smith-machine-squat"), fe("Smith_Machine_Squat")], commonness: 4, family: "squat",
    primary: ["quads", "glutes"], secondary: ["adductors"] },
  { key: "box-squat", match: [rd("barbell-box-squat"), fe("Box_Squat")], commonness: 3, family: "squat" },
  { key: "bodyweight-squat", match: [fe("Bodyweight_Squat"), rd("bodyweight-squat")], aliases: ["Air Squat", "Squat (Bodyweight)"],
    commonness: 4, family: "squat", note: "Staple home/warm-up movement; was default commonness 3 with no aliases." },
  { key: "pendulum-squat", create: true, name: "Pendulum Squat", aliases: ["Pendulum Squat Machine"], equipment: ["machine"],
    primary: ["quads", "glutes"], secondary: ["adductors"], pattern: "squat", family: "squat", mechanic: "compound",
    tracking: "weight_reps", commonness: 4, level: "beginner", unilateral: false,
    instructions: [
      "Set the shoulder pads so you start standing tall with your back flat against the pad.",
      "Place your feet mid-platform, about hip-width apart, and release the safety handle.",
      "Bend your knees and let the platform swing back until your thighs pass parallel, keeping your back on the pad.",
      "Drive through the whole foot to return to the top, then re-engage the safety when finished.",
    ] },
  { key: "belt-squat", create: true, name: "Belt Squat", aliases: ["Belt Squat Machine", "Hip Belt Squat"], equipment: ["machine"],
    primary: ["quads", "glutes"], secondary: ["adductors"], pattern: "squat", family: "squat", mechanic: "compound",
    tracking: "weight_reps", commonness: 3, level: "beginner", unilateral: false,
    instructions: [
      "Attach the belt around your hips and stand on the platform with feet shoulder-width apart.",
      "Unlock the lever and stand tall with the load hanging from your hips.",
      "Squat down by bending your knees and hips, keeping your chest up, to a comfortable depth.",
      "Push the platform away to stand back up, then lock the lever when finished.",
    ] },

  // ----- Lunge / single leg --------------------------------------------------------------
  { key: "bulgarian-split-squat", match: [rd("bulgarian-split-squat")], name: "Dumbbell Bulgarian Split Squat",
    aliases: ["Bulgarian Split Squat", "Rear-Foot Elevated Split Squat"], commonness: 5, family: "split_squat",
    primary: ["quads", "glutes"], secondary: ["adductors"], unilateral: true,
    note: "RepDB lists hamstrings secondary; dropped (front-leg hamstrings barely shorten). Adductors added." },
  { key: "barbell-bss", match: [rd("barbell-bulgarian-split-squat")], commonness: 3, family: "split_squat", unilateral: true },
  { key: "db-split-squat", match: [rd("dumbbell-split-squat"), fe("Split_Squat_with_Dumbbells")], commonness: 3, family: "split_squat", unilateral: true },
  { key: "split-squat", match: [rd("split-squat"), fe("Split_Squats")], name: "Split Squat", commonness: 3, family: "split_squat",
    pattern: "lunge", primary: ["quads", "glutes"], secondary: ["adductors"], unilateral: true,
    note: "fedb Split_Squats is miscategorised as a hamstring stretch; treated as the strength movement." },
  { key: "walking-lunge", match: [rd("walking-lunge"), fe("Bodyweight_Walking_Lunge")], commonness: 4, unilateral: true,
    pattern: "lunge", family: "lunge", tracking: "bodyweight_reps", note: "RepDB categorises it as cardio; it is a lunge." },
  { key: "lunge", match: [rd("lunge")], aliases: ["Forward Lunge", "Bodyweight Lunge"], commonness: 4, unilateral: true, family: "lunge" },
  { key: "db-lunge", match: [rd("db-lunge"), fe("Dumbbell_Lunges")], commonness: 4, unilateral: true },
  { key: "reverse-lunge", match: [rd("reverse-lunge"), fe("Dumbbell_Rear_Lunge")], name: "Dumbbell Reverse Lunge", commonness: 4, unilateral: true },
  { key: "step-ups", match: [rd("step-ups")], commonness: 3, unilateral: true },
  { key: "db-step-ups", match: [fe("Dumbbell_Step_Ups")], name: "Dumbbell Step-Up", commonness: 4, unilateral: true },
  { key: "single-leg-rdl", match: [rd("single-leg-romanian-deadlift")], name: "Dumbbell Single-Leg Romanian Deadlift",
    aliases: ["Single-Leg RDL", "SL RDL", "Single Leg Romanian Deadlift"], commonness: 4, unilateral: true, family: "romanian_deadlift" },

  // ----- Hinge ---------------------------------------------------------------------------
  { key: "deadlift", match: [rd("deadlift"), fe("Barbell_Deadlift")], name: "Barbell Deadlift",
    aliases: ["Deadlift", "Conventional Deadlift"], commonness: 5, family: "deadlift",
    primary: ["glutes", "hamstrings", "lower_back"], secondary: ["quads", "adductors", "traps", "forearms"],
    note: "fedb lists only lower back as primary; RepDB (erectors, glutes, hamstrings) kept. Adductors and forearms (grip) added as secondary." },
  { key: "romanian-deadlift", match: [rd("romanian-deadlift"), fe("Romanian_Deadlift")], name: "Barbell Romanian Deadlift",
    aliases: ["Romanian Deadlift", "RDL", "Barbell RDL"], commonness: 5, family: "romanian_deadlift",
    primary: ["hamstrings", "glutes"], secondary: ["lower_back", "adductors"],
    note: "RepDB kept; adductors (adductor magnus, a hip extensor) added secondary. fedb's calves rejected." },
  { key: "db-rdl", match: [rd("dumbbell-romanian-deadlift")], aliases: ["DB RDL", "Dumbbell RDL"], commonness: 5,
    family: "romanian_deadlift", primary: ["hamstrings", "glutes"], secondary: ["lower_back", "adductors"] },
  { key: "sldl", match: [rd("stiff-leg-deadlift"), fe("Stiff-Legged_Barbell_Deadlift")], name: "Stiff-Leg Deadlift",
    aliases: ["SLDL", "Stiff-Legged Deadlift", "Barbell Stiff-Leg Deadlift"], commonness: 3, family: "romanian_deadlift" },
  { key: "db-sldl", match: [fe("Stiff-Legged_Dumbbell_Deadlift")], name: "Dumbbell Stiff-Leg Deadlift", aliases: ["Dumbbell SLDL"],
    commonness: 2, family: "romanian_deadlift", primary: ["hamstrings", "glutes"], secondary: ["lower_back"] },
  { key: "trap-bar-deadlift", match: [rd("hex-bar-deadlift"), fe("Trap_Bar_Deadlift")], name: "Trap Bar Deadlift",
    aliases: ["Hex Bar Deadlift"], commonness: 4, family: "deadlift", equipment: ["trap_bar"] },
  { key: "sumo-deadlift", match: [rd("sumo-deadlift"), fe("Sumo_Deadlift")], commonness: 3, family: "deadlift",
    primary: ["glutes", "quads", "adductors"], secondary: ["hamstrings", "lower_back", "traps", "forearms"] },
  { key: "hip-thrust", match: [rd("hip-thrust"), fe("Barbell_Hip_Thrust")], name: "Barbell Hip Thrust", aliases: ["Hip Thrust", "Glute Thrust"],
    commonness: 5, family: "hip_thrust", primary: ["glutes"], secondary: ["hamstrings"],
    note: "RepDB kept (glute max + med -> glutes). fedb's calves secondary rejected." },
  { key: "glute-bridge", match: [rd("glute-bridge"), fe("Butt_Lift_Bridge")], name: "Glute Bridge", commonness: 4, family: "hip_thrust" },
  { key: "barbell-glute-bridge", match: [rd("barbell-glute-bridge"), fe("Barbell_Glute_Bridge")], commonness: 3, family: "hip_thrust" },
  { key: "glute-drive", match: [rd("plate-loaded-glute-drive")], name: "Hip Thrust Machine",
    aliases: ["Glute Drive", "Plate-Loaded Glute Drive", "Machine Hip Thrust"], commonness: 4, family: "hip_thrust" },
  { key: "smith-hip-thrust", match: [rd("smith-machine-hip-thrust")], commonness: 3, family: "hip_thrust" },
  { key: "kb-swing", match: [rd("kettlebell-swing")], name: "Kettlebell Swing",
    aliases: ["Two-Hand Kettlebell Swing", "Russian Kettlebell Swing", "KB Swing"], commonness: 4, family: "kettlebell_swing", pattern: "hinge" },
  { key: "one-arm-kb-swing", match: [rd("one-arm-kettlebell-swing"), fe("One-Arm_Kettlebell_Swings")], commonness: 2,
    family: "kettlebell_swing", unilateral: true, primary: ["glutes", "hamstrings"], secondary: ["lower_back", "obliques", "forearms"] },
  { key: "good-morning", match: [rd("good-morning"), fe("Good_Morning")], commonness: 3 },
  { key: "back-extension", match: [rd("back-extension"), fe("Hyperextensions_Back_Extensions")], name: "Back Extension",
    aliases: ["Hyperextension", "45-Degree Back Extension", "Roman Chair Back Extension"], commonness: 4,
    primary: ["lower_back", "glutes"], secondary: ["hamstrings"] },
  { key: "nordic", match: [rd("nordic-hamstring-curl"), fe("Natural_Glute_Ham_Raise")], name: "Nordic Hamstring Curl",
    aliases: ["Nordic Curl", "Natural Glute-Ham Raise"], commonness: 3, pattern: "isolation_lower", family: "leg_curl", tracking: "bodyweight_reps" },
  { key: "rack-pull", match: [rd("rack-pull"), fe("Rack_Pulls")], commonness: 3, family: "deadlift" },

  // ----- Knee/hip isolation --------------------------------------------------------------
  { key: "leg-extension", match: [rd("leg-extension"), fe("Leg_Extensions")], name: "Leg Extension", commonness: 5,
    primary: ["quads"], secondary: [] },
  { key: "lying-leg-curl", match: [rd("leg-curl"), fe("Lying_Leg_Curls")], name: "Lying Leg Curl", commonness: 5,
    primary: ["hamstrings"], secondary: ["calves"], note: "RepDB kept: gastrocnemius crosses the knee and assists knee flexion." },
  { key: "seated-leg-curl", match: [rd("seated-leg-curl"), fe("Seated_Leg_Curl")], commonness: 5, primary: ["hamstrings"], secondary: ["calves"] },
  { key: "hip-abduction", match: [rd("hip-abduction"), fe("Thigh_Abductor")], name: "Hip Abduction Machine",
    aliases: ["Machine Hip Abduction", "Seated Hip Abduction", "Thigh Abductor", "Abductor Machine"], commonness: 4,
    primary: ["abductors", "glutes"], secondary: [], pattern: "isolation_lower", family: "hip_abduction" },
  { key: "hip-adduction", match: [rd("hip-adduction"), fe("Thigh_Adductor")], name: "Hip Adduction Machine",
    aliases: ["Machine Hip Adduction", "Seated Hip Adduction", "Thigh Adductor", "Adductor Machine"], commonness: 4,
    primary: ["adductors"], secondary: [], pattern: "isolation_lower", family: "hip_adduction" },
  { key: "standing-calf-raise", match: [rd("standing-calf-raise"), fe("Standing_Calf_Raises")], name: "Standing Calf Raise",
    aliases: ["Machine Calf Raise"], commonness: 4, primary: ["calves"], secondary: [] },
  { key: "seated-calf-raise", match: [rd("seated-calf-raise"), fe("Seated_Calf_Raise")], commonness: 4, primary: ["calves"], secondary: [] },
  { key: "leg-press-calf", match: [fe("Calf_Press_On_The_Leg_Press_Machine")], name: "Leg Press Calf Raise",
    aliases: ["Calf Press on Leg Press"], commonness: 3 },
  { key: "glute-kickback-machine", create: true, name: "Glute Kickback Machine", aliases: ["Machine Glute Kickback", "Hip Extension Machine"],
    equipment: ["machine"], primary: ["glutes"], secondary: ["hamstrings"], pattern: "isolation_lower", family: "glute_kickback",
    mechanic: "isolation", tracking: "weight_reps", commonness: 3, level: "beginner", unilateral: true,
    instructions: [
      "Set the pad so it sits on the back of your working leg (or foot plate under your foot) and hold the handles.",
      "Brace your trunk and keep your hips square to the machine.",
      "Push the leg back by extending the hip until the glute is fully contracted, without arching your lower back.",
      "Return under control and repeat, then switch legs.",
    ] },
  { key: "cable-glute-kickback", match: [rd("cable-kickback"), fe("One-Legged_Cable_Kickback")], name: "Cable Glute Kickback",
    commonness: 3, family: "glute_kickback", unilateral: true },

  // ----- Horizontal push -----------------------------------------------------------------
  { key: "bench-press", match: [rd("bench-press"), fe("Barbell_Bench_Press_-_Medium_Grip")], name: "Barbell Bench Press",
    aliases: ["Bench Press", "Flat Bench Press", "Bench"], commonness: 5, family: "bench_press",
    primary: ["chest"], secondary: ["front_delts", "triceps"] },
  { key: "incline-bench-press", match: [rd("incline-bench-press"), fe("Barbell_Incline_Bench_Press_-_Medium_Grip")],
    name: "Incline Barbell Bench Press", aliases: ["Incline Bench Press", "Incline Bench"], commonness: 4, family: "bench_press",
    primary: ["chest"], secondary: ["front_delts", "triceps"] },
  { key: "db-bench-press", match: [rd("db-bench-press"), fe("Dumbbell_Bench_Press")], commonness: 5, family: "bench_press",
    primary: ["chest"], secondary: ["front_delts", "triceps"] },
  { key: "incline-db-press", match: [rd("incline-db-press"), fe("Incline_Dumbbell_Press")], name: "Incline Dumbbell Press",
    aliases: ["Incline DB Press", "Incline Dumbbell Bench Press"], commonness: 5, family: "bench_press",
    primary: ["chest"], secondary: ["front_delts", "triceps"] },
  { key: "decline-db-press", match: [rd("decline-bench-press"), fe("Decline_Dumbbell_Bench_Press")], name: "Decline Dumbbell Bench Press",
    commonness: 2, family: "bench_press" },
  { key: "close-grip-bench", match: [rd("close-grip-bench-press"), fe("Close-Grip_Barbell_Bench_Press")], name: "Close-Grip Bench Press",
    aliases: ["CGBP"], commonness: 4, family: "bench_press", primary: ["triceps", "chest"], secondary: ["front_delts"] },
  { key: "machine-chest-press", match: [rd("chest-press-machine"), fe("Machine_Bench_Press")], name: "Machine Chest Press",
    aliases: ["Chest Press Machine", "Seated Chest Press"], commonness: 5, family: "bench_press",
    primary: ["chest"], secondary: ["front_delts", "triceps"] },
  { key: "smith-bench", match: [rd("smith-machine-bench-press"), fe("Smith_Machine_Bench_Press")], commonness: 4, family: "bench_press" },
  { key: "smith-incline", match: [rd("smith-machine-incline-bench-press"), fe("Smith_Machine_Incline_Bench_Press")],
    aliases: ["Incline Smith Press"], commonness: 4, family: "bench_press" },
  { key: "push-up", match: [rd("push-up"), fe("Pushups")], name: "Push-Up", commonness: 5, family: "push_up",
    primary: ["chest", "triceps"], secondary: ["front_delts", "abs"], tracking: "bodyweight_reps" },
  { key: "chest-dips", match: [rd("dips"), fe("Dips_-_Chest_Version")], name: "Chest Dip", aliases: ["Dips", "Dip", "Parallel Bar Dip (Chest)"],
    commonness: 5, family: "dip", primary: ["chest", "triceps"], secondary: ["front_delts"], tracking: "bodyweight_reps",
    equipment: ["dip_station"], pattern: "horizontal_push" },
  { key: "triceps-dips", match: [fe("Parallel_Bar_Dip"), fe("Dips_-_Triceps_Version")], name: "Triceps Dip",
    aliases: ["Parallel Bar Dip", "Upright Dip"], commonness: 4, family: "dip", primary: ["triceps"], secondary: ["chest", "front_delts"],
    tracking: "bodyweight_reps", equipment: ["dip_station"], pattern: "horizontal_push" },
  { key: "weighted-dips", match: [rd("weighted-dips")], commonness: 3, family: "dip", tracking: "weight_reps", pattern: "horizontal_push" },
  { key: "assisted-dip", match: [rd("assisted-dips")], name: "Assisted Dip Machine", aliases: ["Machine Assisted Dip", "Assisted Dip"],
    commonness: 4, family: "dip", tracking: "assisted_reps", equipment: ["machine"], pattern: "horizontal_push",
    primary: ["chest", "triceps"], secondary: ["front_delts"] },
  { key: "seated-dip-machine", match: [rd("seated-dip-machine"), fe("Dip_Machine")], name: "Seated Dip Machine",
    aliases: ["Dip Machine", "Triceps Dip Machine"], commonness: 3, family: "dip", tracking: "weight_reps", pattern: "horizontal_push" },
  { key: "bench-dips", match: [rd("bench-dips"), fe("Bench_Dips")], commonness: 3, family: "dip", tracking: "bodyweight_reps",
    primary: ["triceps"], secondary: ["chest", "front_delts"] },
  { key: "cable-fly", match: [rd("cable-fly"), fe("Cable_Crossover")], name: "Cable Fly", aliases: ["Cable Crossover", "Standing Cable Fly", "Cable Chest Fly"],
    commonness: 5, family: "chest_fly", primary: ["chest"], secondary: ["front_delts"] },
  { key: "pec-deck", match: [rd("pec-deck"), rd("machine-chest-fly"), fe("Butterfly")], name: "Pec Deck",
    aliases: ["Machine Chest Fly", "Machine Fly", "Butterfly", "Pec Fly"], commonness: 5, family: "chest_fly",
    primary: ["chest"], secondary: ["front_delts"], note: "RepDB Pec Deck and Machine Chest Fly are the same movement; merged." },
  { key: "db-fly", match: [rd("db-fly"), fe("Dumbbell_Flyes")], commonness: 4, family: "chest_fly", primary: ["chest"], secondary: ["front_delts"] },
  { key: "incline-db-fly", match: [rd("incline-dumbbell-fly"), fe("Incline_Dumbbell_Flyes")], commonness: 3, family: "chest_fly" },

  // ----- Vertical push / shoulders -------------------------------------------------------
  { key: "ohp", match: [rd("ohp"), fe("Standing_Military_Press")], name: "Barbell Overhead Press",
    aliases: ["OHP", "Overhead Press", "Military Press", "Standing Press", "Shoulder Press"], commonness: 5, family: "overhead_press",
    primary: ["front_delts", "side_delts"], secondary: ["triceps", "traps"] },
  { key: "seated-bb-ohp", match: [rd("seated-barbell-overhead-press"), fe("Barbell_Shoulder_Press"), fe("Seated_Barbell_Military_Press")],
    name: "Seated Barbell Overhead Press", aliases: ["Seated Military Press", "Seated Barbell Shoulder Press"], commonness: 3, family: "overhead_press" },
  { key: "db-shoulder-press", match: [rd("dumbbell-shoulder-press"), fe("Dumbbell_Shoulder_Press")], commonness: 5, family: "overhead_press",
    primary: ["front_delts", "side_delts"], secondary: ["triceps", "traps"] },
  { key: "seated-db-press", match: [rd("seated-db-press"), fe("Seated_Dumbbell_Press")], aliases: ["Seated DB Shoulder Press"],
    commonness: 5, family: "overhead_press", primary: ["front_delts", "side_delts"], secondary: ["triceps", "traps"] },
  { key: "machine-shoulder-press", match: [rd("machine-shoulder-press"), fe("Machine_Shoulder_Military_Press")], name: "Machine Shoulder Press",
    aliases: ["Shoulder Press Machine"], commonness: 5, family: "overhead_press" },
  { key: "arnold-press", match: [rd("arnold-press"), fe("Arnold_Dumbbell_Press")], name: "Arnold Press", commonness: 4, family: "overhead_press" },
  { key: "lateral-raise", match: [rd("lateral-raise"), fe("Side_Lateral_Raise")], name: "Dumbbell Lateral Raise",
    aliases: ["Lateral Raise", "Side Lateral Raise", "Side Raise", "Lat Raise"], commonness: 5, family: "lateral_raise",
    primary: ["side_delts"], secondary: ["front_delts", "traps"] },
  { key: "cable-lateral-raise", match: [rd("cable-lateral-raise")], name: "Cable Lateral Raise",
    aliases: ["Single-Arm Cable Lateral Raise", "Standing Cable Lateral Raise"], commonness: 4, family: "lateral_raise",
    primary: ["side_delts"], secondary: ["front_delts", "traps"] },
  { key: "plate-lateral-raise", match: [rd("plate-loaded-lateral-raise")], commonness: 2, family: "lateral_raise" },
  { key: "machine-lateral-raise", create: true, name: "Machine Lateral Raise", aliases: ["Lateral Raise Machine", "Seated Machine Lateral Raise"],
    equipment: ["machine"], primary: ["side_delts"], secondary: ["traps"], pattern: "isolation_upper", family: "lateral_raise",
    mechanic: "isolation", tracking: "weight_reps", commonness: 4, level: "beginner", unilateral: false,
    instructions: [
      "Adjust the seat so your shoulders line up with the machine's pivot points.",
      "Rest your arms against the pads with elbows slightly bent and grip the handles lightly.",
      "Raise your arms out to the sides until they are about level with your shoulders, leading with the elbows.",
      "Lower under control without letting the weight stack touch down between reps.",
    ] },
  { key: "front-raise", match: [rd("dumbbell-front-raise"), fe("Front_Dumbbell_Raise")], name: "Dumbbell Front Raise", commonness: 3,
    primary: ["front_delts"], secondary: ["side_delts"] },
  { key: "face-pull", match: [rd("face-pull"), fe("Face_Pull")], name: "Face Pull", aliases: ["Cable Face Pull", "Rope Face Pull"],
    commonness: 5, family: "face_pull", primary: ["rear_delts", "upper_back"], secondary: ["traps", "rotator_cuff"],
    note: "RepDB kept; rotator cuff (external rotators) added as secondary. fedb's generic 'shoulders' replaced." },
  { key: "rear-delt-fly", match: [rd("rear-delt-fly"), fe("Reverse_Flyes")], name: "Dumbbell Rear Delt Fly",
    aliases: ["Rear Delt Fly", "Reverse Fly", "Bent-Over Reverse Fly"], commonness: 4, family: "rear_delt_fly",
    primary: ["rear_delts"], secondary: ["upper_back", "traps"] },
  { key: "reverse-pec-deck", match: [rd("machine-reverse-fly"), fe("Reverse_Machine_Flyes")], name: "Reverse Pec Deck",
    aliases: ["Machine Reverse Fly", "Rear Delt Machine", "Pec Deck Rear Delt Fly"], commonness: 5, family: "rear_delt_fly",
    primary: ["rear_delts"], secondary: ["upper_back", "traps"] },
  { key: "cable-reverse-fly", match: [rd("cable-reverse-fly"), fe("Cable_Rear_Delt_Fly")], name: "Cable Rear Delt Fly",
    aliases: ["Cable Reverse Fly"], commonness: 4, family: "rear_delt_fly", primary: ["rear_delts"], secondary: ["upper_back", "traps"] },
  { key: "bb-shrug", match: [rd("shrug"), fe("Barbell_Shrug")], commonness: 4 },
  { key: "db-shrug", match: [rd("db-shrug"), fe("Dumbbell_Shrug")], commonness: 4 },
  { key: "upright-row", match: [rd("upright-row"), fe("Upright_Barbell_Row")], name: "Barbell Upright Row", commonness: 3,
    primary: ["side_delts", "traps"], secondary: ["front_delts", "biceps"] },

  // ----- Vertical pull -------------------------------------------------------------------
  { key: "pull-up", match: [rd("pull-up"), fe("Pullups")], name: "Pull-Up", aliases: ["Pullup", "Pull Up", "Overhand Pull-Up"],
    commonness: 5, family: "pull_up", primary: ["lats"], secondary: ["biceps", "upper_back", "rear_delts"], tracking: "bodyweight_reps" },
  { key: "chin-up", match: [rd("chin-ups"), fe("Chin-Up")], name: "Chin-Up", aliases: ["Chinup", "Underhand Pull-Up", "Supinated Pull-Up"],
    commonness: 5, family: "pull_up", primary: ["lats", "biceps"], secondary: ["upper_back", "brachialis"], tracking: "bodyweight_reps" },
  { key: "neutral-pull-up", match: [rd("neutral-grip-pull-ups")], aliases: ["Neutral-Grip Pull-Up", "Hammer-Grip Pull-Up"],
    commonness: 3, family: "pull_up", tracking: "bodyweight_reps" },
  { key: "weighted-pull-up", match: [rd("weighted-pull-up"), fe("Weighted_Pull_Ups")], commonness: 3, family: "pull_up", tracking: "weight_reps" },
  { key: "assisted-pull-up", match: [rd("assisted-pull-ups")], name: "Assisted Pull-Up Machine",
    aliases: ["Assisted Pull-Up", "Machine Assisted Pull-Up", "Assisted Chin-Up", "Gravitron"], commonness: 5, family: "pull_up",
    tracking: "assisted_reps", equipment: ["machine"], primary: ["lats"], secondary: ["biceps", "upper_back", "rear_delts"] },
  { key: "band-assisted-pull-up", match: [rd("band-assisted-pull-ups"), fe("Band_Assisted_Pull-Up")], name: "Band-Assisted Pull-Up",
    commonness: 3, family: "pull_up", tracking: "bodyweight_reps", equipment: ["band", "pull_up_bar"],
    primary: ["lats"], secondary: ["biceps", "upper_back"] },
  { key: "lat-pulldown", match: [rd("lat-pulldown"), fe("Wide-Grip_Lat_Pulldown")], name: "Lat Pulldown",
    aliases: ["Wide-Grip Lat Pulldown", "Cable Pulldown", "Pulldown", "Lat Pull-Down"], commonness: 5, family: "lat_pulldown",
    primary: ["lats"], secondary: ["biceps", "upper_back", "rear_delts"] },
  { key: "close-grip-pulldown", match: [rd("close-grip-lat-pulldown"), fe("Close-Grip_Front_Lat_Pulldown")], name: "Close-Grip Lat Pulldown",
    commonness: 4, family: "lat_pulldown" },
  { key: "v-bar-pulldown", match: [rd("v-bar-lat-pulldown"), fe("V-Bar_Pulldown")], name: "V-Bar Lat Pulldown",
    aliases: ["Neutral-Grip Lat Pulldown", "V-Handle Pulldown"], commonness: 4, family: "lat_pulldown" },
  { key: "reverse-pulldown", match: [rd("reverse-grip-lat-pulldown"), fe("Underhand_Cable_Pulldowns")], name: "Reverse-Grip Lat Pulldown",
    aliases: ["Underhand Lat Pulldown", "Supinated Pulldown"], commonness: 3, family: "lat_pulldown" },
  { key: "straight-arm-pulldown", match: [rd("straight-arm-pulldown"), fe("Straight-Arm_Pulldown")], name: "Straight-Arm Pulldown",
    aliases: ["Cable Pullover", "Straight-Arm Lat Pulldown"], commonness: 4, family: "lat_pulldown", pattern: "isolation_upper",
    primary: ["lats"], secondary: ["triceps", "rear_delts"] },
  { key: "dead-hang", match: [rd("dead-hang")], commonness: 3, tracking: "duration", pattern: "vertical_pull" },

  // ----- Horizontal pull -----------------------------------------------------------------
  { key: "barbell-row", match: [rd("barbell-row"), fe("Bent_Over_Barbell_Row")], name: "Barbell Row",
    aliases: ["Bent-Over Barbell Row", "Bent-Over Row", "BB Row"], commonness: 5, family: "row",
    primary: ["lats", "upper_back"], secondary: ["biceps", "rear_delts", "lower_back"],
    note: "RepDB kept; lower back added (isometric erector load holding the hinge). fedb's 'shoulders' read as rear delts." },
  { key: "pendlay-row", match: [rd("pendlay-row")], commonness: 3, family: "row" },
  { key: "db-row", match: [rd("single-arm-db-row"), fe("One-Arm_Dumbbell_Row")], name: "Single-Arm Dumbbell Row",
    aliases: ["One-Arm Dumbbell Row", "DB Row", "Dumbbell Row"], commonness: 5, family: "row", unilateral: true,
    primary: ["lats", "upper_back"], secondary: ["biceps", "rear_delts"] },
  { key: "bent-db-row", match: [rd("bent-over-db-row"), fe("Bent_Over_Two-Dumbbell_Row")], commonness: 3, family: "row" },
  { key: "seated-cable-row", match: [rd("seated-cable-row"), fe("Seated_Cable_Rows")], name: "Seated Cable Row",
    aliases: ["Cable Row", "Low Row", "Seated Row"], commonness: 5, family: "row",
    primary: ["lats", "upper_back"], secondary: ["biceps", "rear_delts", "lower_back"] },
  { key: "cs-db-row", match: [rd("chest-supported-db-row"), fe("Dumbbell_Incline_Row")], name: "Chest-Supported Dumbbell Row",
    aliases: ["Incline Dumbbell Row", "Seal Row (Dumbbell)"], commonness: 4, family: "row" },
  { key: "cs-machine-row", match: [rd("chest-supported-machine-row")], name: "Chest-Supported Machine Row",
    aliases: ["Seated Row Machine", "Machine Row", "Seated Machine Row"], commonness: 5, family: "row" },
  { key: "cs-t-bar-row", create: true, name: "Chest-Supported T-Bar Row", aliases: ["Incline T-Bar Row", "Lying T-Bar Row Machine"],
    equipment: ["machine"], primary: ["lats", "upper_back"], secondary: ["rear_delts", "biceps", "traps"], pattern: "horizontal_pull",
    family: "row", mechanic: "compound", tracking: "weight_reps", commonness: 4, level: "beginner", unilateral: false,
    instructions: [
      "Lie face down on the angled pad with your chest supported and feet on the platform.",
      "Grip the handles with straight arms and lift the load off the rack.",
      "Row the handles toward your lower ribs, squeezing your shoulder blades together without lifting your chest off the pad.",
      "Lower until your arms are straight and your shoulder blades spread, then repeat.",
    ] },
  { key: "t-bar-row", match: [rd("t-bar-row"), fe("T-Bar_Row_with_Handle")], name: "T-Bar Row", aliases: ["Landmine Row"], commonness: 4, family: "row" },
  { key: "inverted-row", match: [rd("inverted-row"), fe("Inverted_Row")], commonness: 3, family: "row", tracking: "bodyweight_reps",
    equipment: ["barbell", "bodyweight"] },

  // ----- Arms ----------------------------------------------------------------------------
  { key: "bb-curl", match: [rd("barbell-curl"), fe("Barbell_Curl")], name: "Barbell Curl", commonness: 5, family: "biceps_curl",
    primary: ["biceps"], secondary: ["brachialis", "forearms"] },
  { key: "db-curl", match: [rd("bicep-curl"), fe("Dumbbell_Bicep_Curl")], name: "Dumbbell Curl", aliases: ["Dumbbell Bicep Curl", "Bicep Curl", "DB Curl"],
    commonness: 5, family: "biceps_curl", primary: ["biceps"], secondary: ["brachialis", "forearms"] },
  { key: "hammer-curl", match: [rd("hammer-curl"), fe("Hammer_Curls")], name: "Hammer Curl", aliases: ["Dumbbell Hammer Curl"],
    commonness: 5, family: "biceps_curl", primary: ["brachialis", "biceps"], secondary: ["forearms"] },
  { key: "ez-curl", match: [rd("ez-bar-curl"), fe("EZ-Bar_Curl")], commonness: 5, family: "biceps_curl" },
  { key: "preacher-curl", match: [rd("preacher-curl"), fe("Preacher_Curl")], name: "EZ-Bar Preacher Curl", aliases: ["Preacher Curl"],
    commonness: 4, family: "biceps_curl", equipment: ["ez_bar", "bench"] },
  { key: "incline-db-curl", match: [rd("incline-db-curl"), fe("Incline_Dumbbell_Curl")], commonness: 4, family: "biceps_curl" },
  { key: "cable-curl", match: [rd("cable-curl"), fe("Standing_Biceps_Cable_Curl")], name: "Cable Curl", commonness: 4, family: "biceps_curl" },
  { key: "machine-curl", match: [rd("machine-bicep-curl"), fe("Machine_Bicep_Curl")], commonness: 3, family: "biceps_curl" },
  { key: "concentration-curl", match: [rd("concentration-curl"), fe("Concentration_Curls")], commonness: 3, family: "biceps_curl" },
  { key: "triceps-pushdown", match: [rd("tricep-pushdown"), fe("Triceps_Pushdown")], name: "Triceps Pushdown",
    aliases: ["Cable Pushdown", "Tricep Pushdown", "Triceps Pressdown", "Straight-Bar Pushdown"], commonness: 5, family: "triceps_extension",
    primary: ["triceps"], secondary: [] },
  { key: "rope-pushdown", match: [fe("Triceps_Pushdown_-_Rope_Attachment")], name: "Rope Triceps Pushdown",
    aliases: ["Rope Pushdown", "Cable Rope Pushdown"], commonness: 5, family: "triceps_extension", primary: ["triceps"], secondary: [] },
  { key: "overhead-cable-ext", match: [rd("cable-overhead-tricep-extension"), fe("Cable_Rope_Overhead_Triceps_Extension")],
    name: "Overhead Cable Triceps Extension", aliases: ["Cable Overhead Triceps Extension", "Rope Overhead Extension"],
    commonness: 4, family: "triceps_extension", primary: ["triceps"], secondary: [] },
  { key: "skull-crusher", match: [rd("skull-crusher")], name: "Barbell Skull Crusher", aliases: ["Skull Crusher", "Lying Triceps Extension", "Barbell Lying Triceps Extension"],
    commonness: 4, family: "triceps_extension", primary: ["triceps"], secondary: [] },
  { key: "ez-skull-crusher", match: [rd("ez-bar-lying-tricep-extension"), fe("EZ-Bar_Skullcrusher"), fe("Lying_Triceps_Press")],
    name: "EZ-Bar Skull Crusher", aliases: ["EZ-Bar Lying Triceps Extension", "Skull Crusher", "Lying Triceps Press"],
    commonness: 4, family: "triceps_extension", primary: ["triceps"], secondary: [] },
  { key: "db-overhead-ext", match: [rd("overhead-tricep-extension")], name: "Dumbbell Overhead Triceps Extension", commonness: 4,
    family: "triceps_extension", primary: ["triceps"], secondary: [] },
  { key: "db-kickback", match: [rd("tricep-kickback"), fe("Tricep_Dumbbell_Kickback")], commonness: 3, family: "triceps_extension" },

  // ----- Core ----------------------------------------------------------------------------
  { key: "plank", match: [rd("plank"), fe("Plank")], name: "Plank", aliases: ["Front Plank", "Forearm Plank"], commonness: 5,
    family: "plank", tracking: "duration", primary: ["abs"], secondary: ["obliques", "lower_back"],
    note: "RepDB kept (rectus + transverse abdominis); obliques added secondary." },
  { key: "side-plank", match: [rd("side-plank"), fe("Side_Bridge")], name: "Side Plank", aliases: ["Side Bridge"], commonness: 4,
    family: "plank", tracking: "duration", primary: ["obliques"], secondary: ["abs", "abductors"], pattern: "core_anti_extension" },
  { key: "copenhagen", match: [rd("copenhagen-plank")], commonness: 2, family: "plank", tracking: "duration", unilateral: true },
  { key: "hanging-leg-raise", match: [rd("hanging-leg-raise"), fe("Hanging_Leg_Raise")], commonness: 4, primary: ["abs", "hip_flexors"], secondary: ["obliques"] },
  { key: "hanging-knee-raise", match: [rd("hanging-knee-raise")], commonness: 4 },
  { key: "cable-crunch", match: [rd("cable-crunch"), fe("Cable_Crunch")], commonness: 4, primary: ["abs"], secondary: ["obliques"] },
  { key: "crunch", match: [rd("crunches"), fe("Crunches")], name: "Crunch", commonness: 4 },
  { key: "ab-wheel", match: [rd("ab-wheel-rollout"), fe("Ab_Roller")], name: "Ab Wheel Rollout", aliases: ["Ab Roller", "Ab Rollout"], commonness: 4 },
  { key: "hollow-hold", match: [rd("hollow-body-hold")], aliases: ["Hollow Hold"], commonness: 3, tracking: "duration" },
  { key: "dead-bug", match: [rd("dead-bug"), fe("Dead_Bug")], commonness: 3 },
  { key: "russian-twist", match: [rd("russian-twist"), fe("Russian_Twist")], commonness: 3, primary: ["obliques"], secondary: ["abs"] },
  { key: "pallof", match: [rd("cable-pallof-press"), fe("Pallof_Press")], name: "Pallof Press", commonness: 3, pattern: "core_rotation",
    primary: ["obliques", "abs"], secondary: [] },
  { key: "bicycle-crunch", match: [rd("bicycle-crunch"), fe("Air_Bike")], name: "Bicycle Crunch",
    note: "fedb 'Air Bike' is a bicycle crunch, not the cardio machine.", commonness: 3, pattern: "core_rotation", tracking: "bodyweight_reps", primary: ["abs", "obliques"], secondary: ["hip_flexors"] },
  { key: "machine-crunch", match: [rd("machine-seated-crunch"), fe("Ab_Crunch_Machine")], name: "Ab Crunch Machine", commonness: 3 },

  // ----- Carries / conditioning ---------------------------------------------------------
  { key: "farmers-walk", match: [rd("dumbbell-farmers-walk"), fe("Farmers_Walk")], name: "Farmer's Walk", aliases: ["Farmer's Carry", "Dumbbell Farmer's Walk"],
    commonness: 4, family: "carry", primary: ["forearms", "traps"], secondary: ["abs", "obliques", "glutes", "quads"] },
  { key: "treadmill-run", match: [rd("treadmill-running"), fe("Running_Treadmill")], name: "Treadmill Run", commonness: 2 },
  { key: "rower", match: [rd("rowing-machine"), fe("Rowing_Stationary")], name: "Rowing Machine", aliases: ["Rower", "Erg"], commonness: 2 },
  { key: "stationary-bike", match: [rd("stationary-bike"), fe("Bicycling_Stationary")], name: "Stationary Bike", aliases: ["Exercise Bike"], commonness: 2 },
  { key: "stair-climber", match: [rd("stair-climber"), fe("Stairmaster")], name: "Stair Climber", aliases: ["StairMaster", "Stepmill"], commonness: 2 },
  { key: "jump-rope", match: [rd("jump-rope"), fe("Rope_Jumping")], name: "Jump Rope", aliases: ["Skipping Rope"], commonness: 2 },
  { key: "elliptical", match: [rd("elliptical-trainer"), fe("Elliptical_Trainer")], commonness: 2 },
  { key: "incline-walk", match: [rd("incline-treadmill-walk")], name: "Incline Treadmill Walk", commonness: 2 },
  { key: "burpees", match: [rd("burpees")], name: "Burpee", commonness: 2, tracking: "bodyweight_reps" },
  { key: "jumping-jacks", match: [rd("jumping-jacks")], commonness: 2, tracking: "bodyweight_reps" },
  { key: "sled-push", match: [rd("sled-push"), fe("Sled_Push")], commonness: 2 },
];
