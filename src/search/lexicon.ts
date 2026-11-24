// Gym abbreviations, slang, equipment words and muscle words.
// Keys are written naturally and normalized at load, so "pull-up bar", "pull up bar"
// and "pullup bar" all hit the same entry.

import { EQUIPMENT_LABEL, MUSCLES, MUSCLE_INFO, type Equipment, type Muscle, type MuscleGroup } from "../shared/domain";
import { normalizeTokens } from "./normalize";

export type LexiconEntry = {
  /** Name-text expansions, e.g. rdl → "romanian deadlift". Matched as whole words. */
  expand?: string[];
  /** Query word means "uses this equipment". */
  equipment?: Equipment[];
  /** Query word means "trains these muscles" (primary outranks secondary). */
  muscles?: Muscle[];
  /** Query phrase means "bodyweight only" (a hard constraint). */
  noEquipment?: boolean;
  /** The literal words never match names (e.g. "at home"). */
  attrOnly?: boolean;
};

const group = (g: MuscleGroup): Muscle[] => MUSCLES.filter((m) => MUSCLE_INFO[m].group === g);

const abbr = (...expand: string[]): LexiconEntry => ({ expand });
const equip = (e: Equipment, ...expand: string[]): LexiconEntry => ({ equipment: [e], expand });
const muscle = (...muscles: Muscle[]): LexiconEntry => ({ muscles });
const NO_EQUIPMENT: LexiconEntry = { noEquipment: true, attrOnly: true };

const RAW: Array<[string[], LexiconEntry]> = [
  // Abbreviations and slang for exercise names
  [["rdl"], abbr("romanian deadlift")],
  [["sldl", "sld"], abbr("stiff leg deadlift")],
  [["slrdl", "sl rdl"], abbr("single leg romanian deadlift")],
  [["ohp"], abbr("overhead press")],
  [["bss"], abbr("bulgarian split squat")],
  [["ghr"], abbr("glute ham raise")],
  [["ghd"], abbr("glute ham")],
  [["cgbp"], abbr("close grip bench press")],
  [["jm"], abbr("jm press")],
  [["skull", "skullies"], abbr("skull crusher")],
  [["pec dec"], abbr("pec deck")],
  [["lat pull", "lat pulldown"], abbr("lat pulldown")],
  [["dl"], abbr("deadlift")],
  [["bp"], abbr("bench press")],
  [["hspu"], abbr("handstand pushup")],
  [["press up"], abbr("pushup")],
  // Exercise names that start with a muscle word but are not about that muscle: matched as text,
  // so "leg raise" finds Hanging Leg Raise (abs) rather than calf raises (legs + "raise").
  [["leg raise", "leg lift"], abbr()],

  // Equipment
  [["dumbbell"], equip("dumbbell")],
  [["db", "dumbell", "dumbel", "dumbells", "dumbels", "dumb bell"], equip("dumbbell", "dumbbell")],
  [["barbell"], equip("barbell")],
  [["bb", "bar bell"], equip("barbell", "barbell")],
  [["kettlebell"], equip("kettlebell")],
  [["kb", "kettle bell"], equip("kettlebell", "kettlebell")],
  [["cable", "cable machine"], equip("cable")],
  [["machine"], equip("machine")],
  [["smith", "smith machine"], equip("smith")],
  [["band", "resistance band", "mini band"], equip("band")],
  [["bodyweight", "bw"], equip("bodyweight", "bodyweight")],
  [["ez", "ez bar"], equip("ez_bar", "ez bar")],
  [["trap bar", "hex bar"], equip("trap_bar", "trap bar")],
  [["pull up bar", "chin up bar"], equip("pull_up_bar")],
  [["medicine ball", "med ball"], equip("medicine_ball")],
  [["stability ball", "swiss ball", "exercise ball"], equip("stability_ball")],

  // No equipment
  [
    [
      "no equipment",
      "bodyweight only",
      "body weight only",
      "at home",
      "home",
      "without equipment",
      "equipment free",
      "no gear",
      "calisthenics",
    ],
    NO_EQUIPMENT,
  ],

  // Muscles and muscle groups
  [["chest", "pec", "pecs", "pectoral", "pectorals"], muscle("chest")],
  [["back"], muscle(...group("back"))],
  [["upper back", "rhomboid", "rhomboids"], muscle("upper_back")],
  [["lower back", "erector", "erectors"], muscle("lower_back")],
  [["lat", "lats", "latissimus"], muscle("lats")],
  [["trap", "traps", "trapezius"], muscle("traps")],
  [["shoulder", "shoulders", "delt", "delts", "deltoid", "deltoids"], muscle(...group("shoulders"))],
  [["front delt", "front delts", "anterior delt"], muscle("front_delts")],
  [["side delt", "side delts", "lateral delt", "middle delt"], muscle("side_delts")],
  [["rear delt", "rear delts", "posterior delt"], muscle("rear_delts")],
  [["rotator cuff"], muscle("rotator_cuff")],
  [["arm", "arms"], muscle(...group("arms"))],
  [["bicep", "biceps", "bi", "bis", "guns"], muscle("biceps")],
  [["tricep", "triceps", "tri", "tris"], muscle("triceps")],
  [["forearm", "forearms", "grip"], muscle("forearms")],
  [["core"], muscle(...group("core"))],
  [["ab", "abs", "abdominal", "abdominals", "six pack"], muscle(...group("core"))],
  [["oblique", "obliques"], muscle("obliques")],
  [["leg", "legs"], muscle(...group("legs"))],
  [["quad", "quads", "quadricep", "quadriceps"], muscle("quads")],
  [["hamstring", "hamstrings", "ham", "hams", "hammies", "hammy"], muscle("hamstrings")],
  [["glute", "glutes", "booty", "butt", "bum"], muscle("glutes")],
  [["calf", "calves"], muscle("calves")],
  [["adductor", "adductors", "inner thigh"], muscle("adductors")],
  [["abductor", "abductors", "outer thigh"], muscle("abductors")],
  [["hip flexor", "hip flexors"], muscle("hip_flexors")],
  [["neck"], muscle("neck")],
  [["tibialis", "shin", "shins"], muscle("tibialis")],
];

export const LEXICON: Map<string, LexiconEntry> = new Map();
for (const [keys, entry] of RAW) {
  for (const key of keys) {
    const k = normalizeTokens(key).join(" ");
    if (k && !LEXICON.has(k)) LEXICON.set(k, entry);
  }
}
// Equipment labels ("Smith machine", "Pull-up bar", …) are always understood.
for (const [e, label] of Object.entries(EQUIPMENT_LABEL) as Array<[Equipment, string]>) {
  if (e === "other" || e === "bench") continue; // "bench" almost always means bench press
  const k = normalizeTokens(label).join(" ");
  if (k && !LEXICON.has(k)) LEXICON.set(k, { equipment: [e] });
}

/** Longest lexicon phrase, in tokens. */
export const LEXICON_MAX_WORDS = Math.max(...[...LEXICON.keys()].map((k) => k.split(" ").length));

/** Single-word keys of 5+ letters that typo tolerance may correct to (e.g. "shoudlers"). */
export const LEXICON_FUZZY_KEYS: string[] = [...LEXICON.keys()].filter((k) => !k.includes(" ") && k.length >= 5);

export function lexiconHasAttributes(e: LexiconEntry): boolean {
  return !!(e.equipment?.length || e.muscles?.length || e.noEquipment);
}
