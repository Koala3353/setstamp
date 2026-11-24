// Text normalization shared by the index builder, the query parser and the lexicon.
// Every string that is compared (names, aliases, lexicon keys, queries) goes through
// `normalizeTokens`, so both sides of a comparison always agree.

/** Whole-token rewrites: British/US spellings, common typos, glued compounds. Values may hold spaces. */
const SPELLING: Record<string, string> = {
  tyre: "tire",
  centre: "center",
  plough: "plow",
  flye: "fly",
  calve: "calf",
  dumbell: "dumbbell",
  dumbel: "dumbbell",
  dumbbel: "dumbbell",
  barbel: "barbell",
  kettlebel: "kettlebell",
  kettelbell: "kettlebell",
  skullcrusher: "skull crusher",
  pecdeck: "pec deck",
  legpress: "leg press",
  benchpress: "bench press",
  ezbar: "ez bar",
  hexbar: "hex bar",
  trapbar: "trap bar",
  stiffleg: "stiff leg",
  stiffleged: "stiff leg",
  legged: "leg",
  "1": "one",
  "2": "two",
};

/** Particles glued to the previous word, so "pull-up", "pull up" and "pullup" are one token. */
const PARTICLES = new Set(["up", "down", "over"]);

/** Adjacent word pairs that are one word in canonical form. Values may hold spaces. */
const PAIRS: Record<string, string> = {
  "dead lift": "deadlift",
  "body weight": "bodyweight",
  "dumb bell": "dumbbell",
  "bar bell": "barbell",
  "kettle bell": "kettlebell",
  "hand stand": "handstand",
  "pec dec": "pec deck",
};

/** Lowercase, strip accents and punctuation; hyphens and slashes become spaces. */
export function normalizeText(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Light English plural stemmer: curls→curl, presses→press, flies→fly, raises→raise. */
export function stem(token: string): string {
  const t = token;
  if (t.length < 3 || !t.endsWith("s")) return t;
  if (t.endsWith("ss") || t.endsWith("us") || t.endsWith("is")) return t;
  if (t.length > 4 && t.endsWith("ies")) return t.slice(0, -3) + "y";
  if (t.length > 4 && /(ss|sh|ch|x)es$/.test(t)) return t.slice(0, -2);
  return t.slice(0, -1);
}

function canon(token: string): string[] {
  let t = SPELLING[token] ?? token;
  if (t.includes(" ")) return t.split(" ");
  t = stem(t);
  t = SPELLING[t] ?? t;
  return t.includes(" ") ? t.split(" ") : [t];
}

/** Full pipeline: text → canonical tokens (stemmed, spelling-unified, compounds joined). */
export function normalizeTokens(input: string): string[] {
  const text = normalizeText(input);
  if (!text) return [];
  const out: string[] = [];
  for (const raw of text.split(" ")) {
    for (const t of canon(raw)) {
      const last = out.length - 1;
      if (last >= 0 && PARTICLES.has(t)) {
        out[last] = out[last] + t;
        continue;
      }
      const pair = last >= 0 ? PAIRS[`${out[last]} ${t}`] : undefined;
      if (pair) {
        out.pop();
        out.push(...pair.split(" "));
        continue;
      }
      out.push(t);
    }
  }
  return out;
}

/** Prefixes of a particle: a trailing "pull u" may still become "pullup". */
export const PARTICLE_PREFIXES = new Set(["u", "d", "do", "dow", "o", "ov", "ove"]);
