// Builds the exercise catalog from pinned upstream datasets plus catalog/curated.ts.
//
//   node --experimental-strip-types scripts/build-catalog.ts            # use pins in catalog/sources.lock.json
//   node --experimental-strip-types scripts/build-catalog.ts --update   # re-resolve upstream HEAD and re-pin
//   node --experimental-strip-types scripts/build-catalog.ts --offline  # never touch the network (cache only)
//
// Outputs:
//   catalog/.cache/*                 downloaded source files (git-ignored, untrusted: parsed as JSON only)
//   catalog/catalog.generated.json   CatalogExercise[] (git-ignored: contains RepDB data, which may not be republished)
//   catalog/catalog.meta.json        version hash, build time, source commits, counts
//   catalog/id-map.json              append-only "<source>:<sourceId>" -> exId registry (committed)
//   catalog/sources.lock.json        pinned commits + file hashes (committed)
//   catalog/.cache/build-report.json diagnostics used for docs/research/catalog-report.md

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  EQUIPMENT,
  EQUIPMENT_LABEL,
  MUSCLES,
  PATTERNS,
  TRACKING,
  type CatalogExercise,
  type Equipment,
  type ExerciseImage,
  type Muscle,
  type Pattern,
  type SourceRef,
  type Tracking,
} from "../src/shared/domain.ts";
import * as C from "../catalog/curated.ts";

const ROOT = path.resolve(import.meta.dirname, "..");
const CATALOG = path.join(ROOT, "catalog");
const CACHE = path.join(CATALOG, ".cache");
const LOCK_PATH = path.join(CATALOG, "sources.lock.json");
const IDMAP_PATH = path.join(CATALOG, "id-map.json");
const OUT_PATH = path.join(CATALOG, "catalog.generated.json");
const META_PATH = path.join(CATALOG, "catalog.meta.json");
const REPORT_PATH = path.join(CACHE, "build-report.json");
const MAX_DOWNLOAD_BYTES = 20 * 1024 * 1024;
const CURATED_VERSION = "curated-v1";

const args = new Set(process.argv.slice(2));
const UPDATE = args.has("--update");
const OFFLINE = args.has("--offline");

type SourceName = "free-exercise-db" | "repdb";
const SOURCES: Record<SourceName, { repo: string; file: string; extraFiles: string[] }> = {
  "free-exercise-db": { repo: "yuhonas/free-exercise-db", file: "dist/exercises.json", extraFiles: ["LICENSE.md"] },
  // The repo was moved from sergei-argutin/exercise-dataset; GitHub's API reports this canonical name.
  repdb: { repo: "RepDB/exercise-dataset", file: "exercises.json", extraFiles: ["LICENSE-DATA.md"] },
};
const ATTRIBUTION = {
  repdb: "Exercise data by RepDB (repdb.co)",
  "free-exercise-db": "free-exercise-db (unverified provenance)",
} as const;

class BuildError extends Error {}
const fail = (msg: string): never => {
  throw new BuildError(msg);
};
const sha256 = (s: string | Buffer) => createHash("sha256").update(s).digest("hex");
const readJson = (p: string) => JSON.parse(fs.readFileSync(p, "utf8"));
/** JSON with object keys sorted, so committed files diff cleanly and deterministically. */
const stableStringify = (v: unknown): string =>
  JSON.stringify(
    v,
    (_k, val) =>
      val && typeof val === "object" && !Array.isArray(val)
        ? Object.fromEntries(Object.keys(val).sort().map((k) => [k, (val as Record<string, unknown>)[k]]))
        : val,
    2,
  ) + "\n";

// ---------------------------------------------------------------------------------------------
// 1. Pin + download
// ---------------------------------------------------------------------------------------------

type LockEntry = { repo: string; commit: string; committedAt: string; file: string; sha256: string; resolvedAt: string };
type Lock = Record<SourceName, LockEntry>;

async function githubJson(url: string) {
  const res = await fetch(url, { headers: { Accept: "application/vnd.github+json", "User-Agent": "catalog-build-script" } });
  if (!res.ok) fail(`GitHub API ${url} -> HTTP ${res.status}`);
  return res.json();
}

async function download(url: string): Promise<Buffer> {
  const res = await fetch(url, { headers: { "User-Agent": "catalog-build-script" } });
  if (!res.ok) fail(`Download ${url} -> HTTP ${res.status}`);
  const len = Number(res.headers.get("content-length") ?? 0);
  if (len > MAX_DOWNLOAD_BYTES) fail(`Download ${url} too large (${len} bytes)`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_DOWNLOAD_BYTES) fail(`Download ${url} too large (${buf.length} bytes)`);
  return buf;
}

const cachePath = (source: SourceName, commit: string, file: string) =>
  path.join(CACHE, `${source}-${commit}-${file.replace(/[^A-Za-z0-9.]+/g, "_")}`);

async function resolvePins(): Promise<Lock> {
  const existing: Partial<Lock> = fs.existsSync(LOCK_PATH) ? readJson(LOCK_PATH) : {};
  const lock = {} as Lock;
  for (const source of Object.keys(SOURCES) as SourceName[]) {
    const cfg = SOURCES[source];
    const prev = existing[source];
    if (prev && !UPDATE) {
      lock[source] = prev;
      continue;
    }
    if (OFFLINE) fail(`No pin for ${source} and --offline was given`);
    const head = await githubJson(`https://api.github.com/repos/${cfg.repo}/commits/HEAD`);
    const commit = String(head.sha);
    if (!/^[0-9a-f]{40}$/.test(commit)) fail(`Bad commit sha for ${source}: ${commit}`);
    lock[source] = {
      repo: cfg.repo,
      commit,
      committedAt: String(head.commit?.committer?.date ?? ""),
      file: cfg.file,
      sha256: "", // filled after download
      resolvedAt: new Date().toISOString(),
    };
    if (prev && prev.commit === commit) lock[source] = prev;
  }
  return lock;
}

async function fetchSource(source: SourceName, pin: LockEntry): Promise<string> {
  fs.mkdirSync(CACHE, { recursive: true });
  const files = [pin.file, ...SOURCES[source].extraFiles];
  let mainText = "";
  for (const file of files) {
    const p = cachePath(source, pin.commit, file);
    if (!fs.existsSync(p)) {
      if (OFFLINE) fail(`Missing cache file ${p} (--offline)`);
      const url = `https://raw.githubusercontent.com/${pin.repo}/${pin.commit}/${file}`;
      console.log(`download ${url}`);
      fs.writeFileSync(p, await download(url));
    }
    if (file === pin.file) mainText = fs.readFileSync(p, "utf8");
  }
  const hash = sha256(mainText);
  if (pin.sha256 && pin.sha256 !== hash) fail(`${source}@${pin.commit}: cached file hash ${hash} != pinned ${pin.sha256}`);
  pin.sha256 = hash;
  return mainText;
}

// ---------------------------------------------------------------------------------------------
// 2. Parse + normalise (inputs are untrusted: JSON.parse only, strict shape checks)
// ---------------------------------------------------------------------------------------------

type Candidate = {
  ref: string;
  source: SourceName | "curated";
  sourceId: string;
  name: string;
  equipment: Equipment[];
  /** Source had no equipment value at all (fedb null): compatible with anything when matching. */
  eqUnknown: boolean;
  primary: Muscle[];
  secondary: Muscle[];
  rawPrimary: string[];
  rawSecondary: string[];
  mechanic: "compound" | "isolation" | null;
  level: "beginner" | "intermediate" | "expert" | null;
  force: string | null;
  category: string;
  unilateral: boolean | null;
  isBodyweight: boolean | null;
  instructions: string[];
  images: ExerciseImage[];
};

const unmapped: Record<string, Record<string, number>> = {};
const noteUnmapped = (kind: string, value: string) => {
  unmapped[kind] ??= {};
  unmapped[kind][value] = (unmapped[kind][value] ?? 0) + 1;
};

const isStrArr = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === "string");
const optStrArr = (v: unknown, what: string): string[] => {
  if (v === undefined || v === null) return [];
  if (!isStrArr(v)) fail(`${what}: expected string[]`);
  return v as string[];
};
const uniq = <T>(xs: T[]) => [...new Set(xs)];

const FEDB_EQUIPMENT: Record<string, Equipment[]> = {
  "body only": ["bodyweight"], barbell: ["barbell"], dumbbell: ["dumbbell"], cable: ["cable"], machine: ["machine"],
  kettlebells: ["kettlebell"], bands: ["band"], "medicine ball": ["medicine_ball"], "exercise ball": ["stability_ball"],
  "foam roll": ["foam_roller"], "e-z curl bar": ["ez_bar"], other: ["other"],
};
const REPDB_EQUIPMENT: Record<string, Equipment[]> = {
  barbell: ["barbell"], dumbbell: ["dumbbell"], kettlebell: ["kettlebell"], cable: ["cable"], ez_bar: ["ez_bar"],
  trap_bar: ["trap_bar"], smith_machine: ["smith"], pull_up_bar: ["pull_up_bar"], dip_station: ["dip_station"],
  flat_bench: ["bench"], stability_ball: ["stability_ball"], bosu_ball: ["other"], resistance_band: ["band"],
  loop_band: ["band"], medicine_ball: ["medicine_ball"], slam_ball: ["medicine_ball"], wall_ball: ["medicine_ball"],
  plates: ["other"], rings: ["other"], suspension_trainer: ["other"], climbing_rope: ["other"], sled: ["other"],
  sandbag: ["other"], battle_rope: ["other"], jump_rope: ["other"], plyo_box: ["other"], ab_wheel: ["other"],
  wrist_roller: ["other"],
  // Selectorized / plate-loaded machines and cardio machines all collapse to "machine".
  assisted_pullup_machine: ["machine"], dip_machine: ["machine"], plate_loaded_dip_machine: ["machine"],
  lat_pulldown_machine: ["cable"], chest_press_machine: ["machine"], seated_row_machine: ["machine"], leg_press: ["machine"],
  hack_squat: ["machine"], hip_abduction_machine: ["machine"], hip_adduction_machine: ["machine"], leg_curl: ["machine"],
  leg_extension: ["machine"], back_extension_machine: ["machine"], bicep_curl_machine: ["machine"],
  standing_calf_raise_machine: ["machine"], chest_fly_machine: ["machine"], preacher_curl_machine: ["machine"],
  reverse_fly_machine: ["machine"], ab_crunch_machine: ["machine"], shoulder_press_machine: ["machine"],
  tricep_extension_machine: ["machine"], glute_ham_developer: ["machine"], pec_deck: ["machine"],
  donkey_calf_raise_machine: ["machine"], hip_thrust_machine: ["machine"], plate_loaded_lateral_raise_machine: ["machine"],
  shrug_machine: ["machine"], seated_calf_raise_machine: ["machine"], air_bike: ["machine"], bicycle: ["other"],
  elliptical: ["machine"], treadmill: ["machine"], rower: ["machine"], ski_erg: ["machine"], stair_climber: ["machine"],
  stationary_bike: ["machine"],
};

const FEDB_MUSCLE: Record<string, (n: string) => Muscle> = {
  abdominals: (n) => (/oblique|twist|side bend|side bridge|wood ?chop|windmill|russian|side jackknife|judo|cable lift|plate twist/.test(n) ? "obliques" : "abs"),
  abductors: () => "abductors", adductors: () => "adductors", biceps: () => "biceps", calves: () => "calves",
  chest: () => "chest", forearms: () => "forearms", glutes: () => "glutes", hamstrings: () => "hamstrings",
  lats: () => "lats", "lower back": () => "lower_back", "middle back": () => "upper_back", neck: () => "neck",
  quadriceps: () => "quads", traps: () => "traps", triceps: () => "triceps",
  // fedb has one coarse "shoulders" bucket. Default front delts; split by movement name (research §6).
  shoulders: (n) =>
    /rear|reverse fl|face pull|bent over .*(lateral|raise|fly|flye)|bent-over .*(lateral|raise)|back fly|sled reverse/.test(n)
      ? "rear_delts"
      : /lateral|side lateral|deltoid raise|upright|scaption|lat raise|cuban/.test(n)
        ? "side_delts"
        : /external rotation|internal rotation/.test(n)
          ? "rotator_cuff"
          : "front_delts",
};
const ABDUCTION_NAME = /abduct|clamshell|fire hydrant|lateral walk|sumo walk|monster|side-lying hip|side leg|side plank (with )?leg lift/;
const REPDB_MUSCLE: Record<string, (n: string) => Muscle> = {
  pectoralis_major: () => "chest", anterior_deltoid: () => "front_delts", lateral_deltoid: () => "side_delts",
  posterior_deltoid: () => "rear_delts", infraspinatus_teres_minor: () => "rotator_cuff", supraspinatus: () => "rotator_cuff",
  latissimus_dorsi: () => "lats", rhomboids: () => "upper_back", trapezius: () => "traps", erector_spinae: () => "lower_back",
  quadratus_lumborum: () => "lower_back", biceps_brachii: () => "biceps", brachialis: () => "brachialis",
  // Brachioradialis is anatomically a forearm muscle (research §6 lumps it with brachialis; we follow anatomy).
  brachioradialis: () => "forearms", triceps_brachii: () => "triceps", forearm_flexors: () => "forearms",
  forearm_extensors: () => "forearms", forearms: () => "forearms", rectus_abdominis: () => "abs",
  transverse_abdominis: () => "abs", obliques: () => "obliques", serratus_anterior: () => "serratus",
  hip_flexors: () => "hip_flexors", gluteus_maximus: () => "glutes",
  // Glute med is the main hip abductor; in squats/lunges/thrusts it acts as a stabiliser and is shown as glutes.
  gluteus_medius: (n) => (ABDUCTION_NAME.test(n) ? "abductors" : "glutes"),
  abductors: () => "abductors", adductors: () => "adductors", quadriceps: () => "quads", hamstrings: () => "hamstrings",
  gastrocnemius: () => "calves", soleus: () => "calves", tibialis_anterior: () => "tibialis",
};

function mapMuscles(kind: string, table: Record<string, (n: string) => Muscle>, raw: string[], name: string): Muscle[] {
  const out: Muscle[] = [];
  for (const r of raw) {
    const f = table[r];
    if (!f) {
      noteUnmapped(kind, r);
      continue;
    }
    out.push(f(name.toLowerCase()));
  }
  return uniq(out);
}
const LEVEL: Record<string, Candidate["level"]> = { beginner: "beginner", intermediate: "intermediate", expert: "expert", advanced: "expert" };

function parseFedb(text: string, commit: string): Candidate[] {
  const data: unknown = JSON.parse(text);
  if (!Array.isArray(data)) fail("fedb: expected a JSON array");
  return (data as Record<string, unknown>[]).map((x, i) => {
    const where = `fedb[${i}]`;
    if (typeof x !== "object" || !x) fail(`${where}: not an object`);
    const id = x.id;
    if (typeof id !== "string" || !/^[0-9A-Za-z_-]+$/.test(id)) fail(`${where}: bad id`);
    if (typeof x.name !== "string" || !x.name.trim()) fail(`${where}: bad name`);
    const name = (x.name as string).trim();
    const eqRaw = x.equipment;
    if (eqRaw !== null && typeof eqRaw !== "string") fail(`${where}: bad equipment`);
    let equipment: Equipment[] = [];
    if (typeof eqRaw === "string") {
      if (FEDB_EQUIPMENT[eqRaw]) equipment = FEDB_EQUIPMENT[eqRaw];
      else noteUnmapped("fedb.equipment", eqRaw);
    }
    const rawPrimary = optStrArr(x.primaryMuscles, `${where}.primaryMuscles`);
    const rawSecondary = optStrArr(x.secondaryMuscles, `${where}.secondaryMuscles`);
    const images = optStrArr(x.images, `${where}.images`).map((p) => {
      if (!/^[0-9A-Za-z_-]+\/\d+\.jpg$/.test(p)) fail(`${where}: unexpected image path ${p}`);
      return {
        url: `https://raw.githubusercontent.com/${SOURCES["free-exercise-db"].repo}/${commit}/exercises/${p}`,
        source: "free-exercise-db" as const,
        attribution: ATTRIBUTION["free-exercise-db"],
      };
    });
    const mech = x.mechanic;
    const lvl = x.level;
    const cat = x.category;
    if (typeof cat !== "string") fail(`${where}: bad category`);
    return {
      ref: C.fe(id),
      source: "free-exercise-db",
      sourceId: id,
      name,
      equipment,
      eqUnknown: eqRaw === null,
      primary: mapMuscles("fedb.muscle", FEDB_MUSCLE, rawPrimary, name),
      secondary: mapMuscles("fedb.muscle", FEDB_MUSCLE, rawSecondary, name),
      rawPrimary,
      rawSecondary,
      mechanic: mech === "compound" || mech === "isolation" ? mech : null,
      level: typeof lvl === "string" ? (LEVEL[lvl] ?? null) : null,
      force: typeof x.force === "string" ? x.force : null,
      category: cat as string,
      unilateral: null,
      isBodyweight: null,
      instructions: optStrArr(x.instructions, `${where}.instructions`).map((s) => s.trim()).filter(Boolean),
      images,
    } satisfies Candidate;
  });
}

const REPDB_IMAGE_ORDER = ["start", "peak", "main"];
function parseRepdb(text: string, commit: string): Candidate[] {
  const data = JSON.parse(text) as { exercises?: unknown };
  if (!data || typeof data !== "object" || !Array.isArray(data.exercises)) fail("repdb: expected {exercises: []}");
  return (data.exercises as Record<string, unknown>[]).map((x, i) => {
    const where = `repdb[${i}]`;
    const id = x.id;
    if (typeof id !== "string" || !/^[a-z0-9-]+$/.test(id)) fail(`${where}: bad id`);
    if (typeof x.name_en !== "string" || !x.name_en.trim()) fail(`${where}: bad name_en`);
    const name = (x.name_en as string).trim();
    const eqRaw = x.equipment;
    if (eqRaw !== undefined && typeof eqRaw !== "string") fail(`${where}: bad equipment`);
    let equipment: Equipment[] = ["bodyweight"];
    if (typeof eqRaw === "string") {
      if (REPDB_EQUIPMENT[eqRaw]) equipment = REPDB_EQUIPMENT[eqRaw];
      else noteUnmapped("repdb.equipment", eqRaw);
    }
    const rawPrimary = optStrArr(x.primary_muscles, `${where}.primary_muscles`);
    const rawSecondary = optStrArr(x.secondary_muscles, `${where}.secondary_muscles`);
    const images: ExerciseImage[] = [];
    const flat = (x.images as { flat?: Record<string, unknown> } | undefined)?.flat ?? {};
    if (typeof flat !== "object") fail(`${where}: bad images`);
    const keys = Object.keys(flat).sort((a, b) => {
      const ia = REPDB_IMAGE_ORDER.indexOf(a), ib = REPDB_IMAGE_ORDER.indexOf(b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
    });
    for (const k of keys) {
      const p = flat[k];
      if (typeof p !== "string" || !/^images\/flat\/[a-z0-9-]+\.webp$/.test(p)) fail(`${where}: unexpected image path ${String(p)}`);
      images.push({
        url: `https://raw.githubusercontent.com/${SOURCES.repdb.repo}/${commit}/${p}`,
        source: "repdb",
        attribution: ATTRIBUTION.repdb,
      });
    }
    const mech = x.mechanic;
    const diff = x.difficulty;
    if (typeof x.category !== "string") fail(`${where}: bad category`);
    return {
      ref: C.rd(id),
      source: "repdb",
      sourceId: id,
      name,
      equipment,
      eqUnknown: false,
      primary: mapMuscles("repdb.muscle", REPDB_MUSCLE, rawPrimary, name),
      secondary: mapMuscles("repdb.muscle", REPDB_MUSCLE, rawSecondary, name),
      rawPrimary,
      rawSecondary,
      mechanic: mech === "compound" || mech === "isolation" ? mech : null,
      level: typeof diff === "string" ? (LEVEL[diff] ?? null) : null,
      force: typeof x.force_type === "string" ? x.force_type : null,
      category: x.category as string,
      unilateral: typeof x.is_unilateral === "boolean" ? x.is_unilateral : null,
      isBodyweight: typeof x.is_bodyweight === "boolean" ? x.is_bodyweight : null,
      instructions: optStrArr(x.instructions_en, `${where}.instructions_en`).map((s) => s.trim()).filter(Boolean),
      images,
    } satisfies Candidate;
  });
}

function curatedCandidate(e: C.CuratedEntry): Candidate {
  const where = `curated "${e.key}"`;
  if (!e.name || !e.equipment?.length || !e.primary?.length || !e.pattern || !e.tracking || !e.commonness)
    fail(`${where}: create entries need name, equipment, primary, pattern, tracking, commonness`);
  return {
    ref: `curated:${e.key}`,
    source: "curated",
    sourceId: e.key,
    name: e.name!,
    equipment: e.equipment!,
    eqUnknown: false,
    primary: e.primary!,
    secondary: e.secondary ?? [],
    rawPrimary: [],
    rawSecondary: [],
    mechanic: e.mechanic ?? null,
    level: e.level ?? null,
    force: null,
    category: "strength",
    unilateral: e.unilateral ?? null,
    isBodyweight: null,
    instructions: e.instructions ?? [],
    images: [],
  };
}

// ---------------------------------------------------------------------------------------------
// 3. Grouping: curated matches, automatic cross-source matches, in-source duplicates
// ---------------------------------------------------------------------------------------------

function matchKey(name: string): string {
  const s = name.toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
  return s
    .split(" ")
    .flatMap((t) => (C.MATCH_TOKEN_MAP[t] ?? t).split(" "))
    .filter((t) => t && !C.MATCH_STOP_TOKENS.has(t))
    .join(" ");
}
const LOAD_EQ = new Set<Equipment>(["barbell", "dumbbell", "kettlebell", "cable", "machine", "smith", "band", "ez_bar", "trap_bar", "medicine_ball"]);
/** Smith machines are labelled "machine" in fedb, so smith/machine compare equal for matching. */
const loadEq = (c: Candidate) =>
  uniq(c.equipment.filter((e) => LOAD_EQ.has(e)).map((e) => (e === "smith" ? "machine" : e))).sort().join(",");
function eqCompatible(a: Candidate, b: Candidate) {
  // fedb rows with no equipment are mostly bodyweight moves/stretches: only match bodyweight rows.
  if (a.eqUnknown) return loadEq(b) === "";
  if (b.eqUnknown) return loadEq(a) === "";
  return loadEq(a) === loadEq(b);
}

class UnionFind {
  parent = new Map<string, string>();
  find(x: string): string {
    let p = this.parent.get(x) ?? x;
    if (p !== x) {
      p = this.find(p);
      this.parent.set(x, p);
    }
    return p;
  }
  union(a: string, b: string) {
    const ra = this.find(a), rb = this.find(b);
    if (ra === rb) return;
    // Deterministic: the lexicographically smaller root wins.
    if (ra < rb) this.parent.set(rb, ra);
    else this.parent.set(ra, rb);
  }
}

// ---------------------------------------------------------------------------------------------
// 4. Derivations (pattern, tracking, family, commonness, aliases)
// ---------------------------------------------------------------------------------------------

const firstRule = <T>(rules: Array<[RegExp, T]>, s: string): T | undefined => rules.find(([re]) => re.test(s))?.[1];
const LOWER_MUSCLES = new Set<Muscle>(["glutes", "abductors", "adductors", "quads", "hamstrings", "calves", "tibialis"]);
const CORE_MUSCLES = new Set<Muscle>(["abs", "obliques", "hip_flexors", "serratus"]);

function derivePattern(name: string, cands: Candidate[], primary: Muscle[], mechanic: string | null): Pattern {
  const n = name.toLowerCase();
  const cats = new Set(cands.map((c) => c.category));
  if (cats.has("stretching")) return "mobility";
  if (cats.has("cardio")) return "cardio";
  const byName = firstRule(C.PATTERN_RULES, n);
  if (byName) return byName;
  if (cats.has("plyometrics")) return "cardio";
  if (primary.some((m) => LOWER_MUSCLES.has(m))) return mechanic === "compound" ? "squat" : "isolation_lower";
  if (primary.every((m) => CORE_MUSCLES.has(m)) && primary.length) return "core_flexion";
  return "isolation_upper";
}

const BODYWEIGHT_EQ = new Set<Equipment>(["bodyweight", "pull_up_bar", "dip_station", "bench", "stability_ball", "other", "foam_roller"]);
const DISTANCE_CARDIO = /run|walk|treadmill|bike|bicycl|cycl|row|elliptical|stair|skierg|jump rope|rope jumping|sprint|skating|jogging|step mill|sled|prowler/;
const DYNAMIC_MOBILITY = /circles|swings?\b|cat-cow|switch|flow|inchworm|rock\b|\bto\b|pedal|pulses|roll down|roll over|saw\b|twist|knee drive|world's greatest|thread the needle$/;

function deriveTracking(name: string, cands: Candidate[], pattern: Pattern, equipment: Equipment[]): Tracking {
  const n = name.toLowerCase();
  const rep = cands.find((c) => c.source === "repdb");
  const isStatic = cands.some((c) => c.force === "static");
  if (pattern === "cardio") {
    if (/battle rope|battling rope/.test(n)) return "duration";
    return DISTANCE_CARDIO.test(n) || equipment.includes("machine") ? "distance_time" : "bodyweight_reps";
  }
  if (pattern === "carry") return "distance_time";
  if (pattern === "mobility") return DYNAMIC_MOBILITY.test(n) && !isStatic ? "bodyweight_reps" : "duration";
  if (C.ASSISTED_NAME.test(n) && !C.BAND_ASSISTED_NAME.test(n)) return "assisted_reps";
  if (/\bholds?\b/.test(n)) return "duration";
  if (!C.NEVER_DURATION.test(n) && (C.DURATION_NAME.test(n) || (rep ? rep.force === "static" : isStatic))) return "duration";
  if (C.WEIGHTED_BODYWEIGHT_NAME.test(n)) return "weight_reps";
  const loaded = equipment.some((e) => LOAD_EQ.has(e) && e !== "band");
  if (C.BODYWEIGHT_MOVE.test(n) && !loaded) return "bodyweight_reps";
  if (rep?.isBodyweight === true) return "bodyweight_reps";
  if (equipment.every((e) => BODYWEIGHT_EQ.has(e)) && !equipment.includes("other")) return "bodyweight_reps";
  if (equipment.length === 1 && equipment[0] === "other" && !rep) return "weight_reps";
  return "weight_reps";
}

function defaultCommonness(name: string, cands: Candidate[], pattern: Pattern): C.Commonness {
  const n = name.toLowerCase();
  const hasRep = cands.some((c) => c.source === "repdb");
  const cats = new Set(cands.map((c) => c.category));
  if (C.OBSCURE_NAME.test(n) || cats.has("strongman")) return 1;
  if (pattern === "mobility") return hasRep ? 2 : 1;
  if (pattern === "cardio") return hasRep ? 2 : 1;
  if (cats.has("olympic weightlifting") || cats.has("olympic") || cats.has("plyometrics")) return 2;
  return hasRep ? 3 : 2;
}

function deriveAliases(name: string, curated: string[], sourceNames: string[]): string[] {
  const out: string[] = [];
  const seen = new Set([name.toLowerCase()]);
  const add = (a: string) => {
    const t = a.trim();
    if (t && !seen.has(t.toLowerCase())) {
      seen.add(t.toLowerCase());
      out.push(t);
    }
  };
  curated.forEach(add);
  sourceNames.forEach(add);
  for (const base of [name, ...sourceNames]) {
    for (const [re, reps] of C.ALIAS_RULES) {
      if (!re.test(base)) continue;
      // Abbreviation-style rules (single all-caps token) substitute in place; others replace the matched phrase.
      for (const r of reps) add(base.replace(re, r));
    }
  }
  return out;
}

const slugify = (s: string) =>
  s.toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

// ---------------------------------------------------------------------------------------------
// 5. ID map (append-only)
// ---------------------------------------------------------------------------------------------

type IdInfo = { seq: number; name: string; status: "active" | "merged"; mergedInto: string | null; createdAt: string };
type IdMap = { schema: 1; note: string; refs: Record<string, string>; ids: Record<string, IdInfo> };

function loadIdMap(): IdMap {
  if (!fs.existsSync(IDMAP_PATH))
    return {
      schema: 1,
      note: "Append-only. refs: '<source>:<sourceId>' -> exId as first assigned. ids: every exId ever issued; never renamed, deleted or reused. Merged IDs keep status 'merged' and point at mergedInto.",
      refs: {},
      ids: {},
    };
  const m = readJson(IDMAP_PATH) as IdMap;
  if (m.schema !== 1) fail("id-map.json: unknown schema");
  return m;
}
function resolveId(m: IdMap, id: string): string {
  const seen = new Set<string>();
  let cur = id;
  while (m.ids[cur]?.status === "merged") {
    if (seen.has(cur)) fail(`id-map cycle at ${cur}`);
    seen.add(cur);
    cur = m.ids[cur].mergedInto ?? fail(`id-map: ${cur} merged without mergedInto`);
  }
  if (!m.ids[cur]) fail(`id-map: unknown id ${cur}`);
  return cur;
}

// ---------------------------------------------------------------------------------------------
// 6. Validation
// ---------------------------------------------------------------------------------------------

const MUSCLE_SET = new Set<string>(MUSCLES), EQ_SET = new Set<string>(EQUIPMENT), PAT_SET = new Set<string>(PATTERNS),
  TRACK_SET = new Set<string>(TRACKING);

function validate(rows: CatalogExercise[]) {
  const errors: string[] = [];
  const ids = new Set<string>();
  const names = new Map<string, string>();
  for (const r of rows) {
    const e = (msg: string) => errors.push(`${r.exId} (${r.name}): ${msg}`);
    if (!/^ex_[a-z0-9_]+$/.test(r.exId)) e("bad exId");
    if (ids.has(r.exId)) e("duplicate exId");
    ids.add(r.exId);
    if (!r.name.trim()) e("empty name");
    if (r.status === "active") {
      const k = r.name.toLowerCase();
      if (names.has(k)) e(`duplicate active name (also ${names.get(k)})`);
      names.set(k, r.exId);
    }
    if (!r.equipment.length) e("no equipment");
    for (const x of r.equipment) if (!EQ_SET.has(x)) e(`bad equipment ${x}`);
    for (const x of [...r.primary, ...r.secondary]) if (!MUSCLE_SET.has(x)) e(`bad muscle ${x}`);
    if (!r.primary.length && r.pattern !== "mobility" && r.pattern !== "cardio") e("no primary muscles");
    if (r.primary.some((m) => r.secondary.includes(m))) e("muscle both primary and secondary");
    if (!PAT_SET.has(r.pattern)) e(`bad pattern ${r.pattern}`);
    if (!TRACK_SET.has(r.tracking)) e(`bad tracking ${r.tracking}`);
    if (![1, 2, 3, 4, 5].includes(r.commonness)) e(`bad commonness ${r.commonness}`);
    if (r.mechanic !== null && r.mechanic !== "compound" && r.mechanic !== "isolation") e("bad mechanic");
    if (r.level !== null && !["beginner", "intermediate", "expert"].includes(r.level)) e("bad level");
    if (typeof r.unilateral !== "boolean") e("bad unilateral");
    if (r.family !== null && !/^[a-z0-9_]+$/.test(r.family)) e(`bad family ${r.family}`);
    if (!r.sources.length) e("no sources");
    for (const s of r.sources) {
      if (!["free-exercise-db", "repdb", "curated"].includes(s.source)) e(`bad source ${s.source}`);
      if (s.source !== "curated" && !/^[0-9a-f]{40}$/.test(s.version)) e(`source ${s.source} without commit`);
    }
    for (const im of r.images) {
      if (!im.url.startsWith("https://raw.githubusercontent.com/")) e(`bad image url ${im.url}`);
      if (im.source !== "repdb" && im.source !== "free-exercise-db") e("bad image source");
    }
    if (r.status !== "active" && r.status !== "merged") e("bad status");
    if ((r.status === "merged") !== (r.mergedInto !== null)) e("status/mergedInto mismatch");
    if (r.mergedInto !== null && !rows.some((x) => x.exId === r.mergedInto && x.status === "active")) e("mergedInto not active");
    if (r.aliases.some((a) => a.toLowerCase() === r.name.toLowerCase())) e("alias equals name");
  }
  if (errors.length) fail(`Validation failed (${errors.length}):\n  ` + errors.join("\n  "));
}

// ---------------------------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------------------------

async function main() {
  const lock = await resolvePins();
  const fedbText = await fetchSource("free-exercise-db", lock["free-exercise-db"]);
  const repdbText = await fetchSource("repdb", lock.repdb);
  const fedb = parseFedb(fedbText, lock["free-exercise-db"].commit);
  const repdb = parseRepdb(repdbText, lock.repdb.commit);
  const commitOf = (s: string) => (s === "curated" ? CURATED_VERSION : lock[s as SourceName].commit);

  const byRef = new Map<string, Candidate>();
  for (const c of [...fedb, ...repdb]) {
    if (byRef.has(c.ref)) fail(`duplicate source id ${c.ref}`);
    byRef.set(c.ref, c);
  }

  // Curated entries: validate and claim refs.
  const entryByKey = new Map<string, C.CuratedEntry>();
  const claimedBy = new Map<string, string>();
  for (const e of C.CURATED) {
    if (entryByKey.has(e.key)) fail(`curated: duplicate key ${e.key}`);
    entryByKey.set(e.key, e);
    if (e.create) {
      if (e.match?.length) fail(`curated "${e.key}": create entries cannot also match`);
      const c = curatedCandidate(e);
      byRef.set(c.ref, c);
      claimedBy.set(c.ref, e.key);
      continue;
    }
    if (!e.match?.length) fail(`curated "${e.key}": needs match[] or create`);
    for (const ref of e.match) {
      if (!byRef.has(ref)) fail(`curated "${e.key}": unknown source ref ${ref}`);
      if (claimedBy.has(ref)) fail(`curated "${e.key}": ${ref} already claimed by "${claimedBy.get(ref)}"`);
      claimedBy.set(ref, e.key);
    }
  }

  const uf = new UnionFind();
  const allRefs = [...byRef.keys()].sort();
  for (const e of C.CURATED) for (const ref of e.match ?? []) uf.union(e.match![0], ref);

  // In-source true duplicates (identical normalised name + equipment, incl. left/right splits).
  const duplicates: Array<{ kept: string; removed: string; key: string }> = [];
  const unclaimed = allRefs.filter((r) => !claimedBy.has(r));
  for (const source of ["free-exercise-db", "repdb"] as const) {
    const seen = new Map<string, string>();
    for (const ref of unclaimed) {
      const c = byRef.get(ref)!;
      if (c.source !== source) continue;
      const k = `${matchKey(c.name)}|${c.eqUnknown ? "?" : loadEq(c)}`;
      const prev = seen.get(k);
      if (prev) {
        uf.union(prev, ref);
        duplicates.push({ kept: prev, removed: ref, key: k });
      } else seen.set(k, ref);
    }
  }

  // Automatic cross-source matches (unclaimed rows only; curated entries own their refs).
  const autoMatches: Array<{ fedb: string; repdb: string; key: string }> = [];
  const ambiguous: Array<{ fedb: string; candidates: string[] }> = [];
  const repIndex = new Map<string, Candidate[]>();
  for (const ref of unclaimed) {
    const c = byRef.get(ref)!;
    if (c.source !== "repdb") continue;
    const k = matchKey(c.name);
    repIndex.set(k, [...(repIndex.get(k) ?? []), c]);
  }
  const repTaken = new Set<string>();
  for (const ref of unclaimed) {
    const f = byRef.get(ref)!;
    if (f.source !== "free-exercise-db") continue;
    if (duplicates.some((d) => d.removed === ref)) continue;
    const k = matchKey(f.name);
    let cands = (repIndex.get(k) ?? []).filter((r) => !repTaken.has(r.ref) && eqCompatible(f, r));
    if (cands.length > 1) {
      const exact = cands.filter((r) => (f.eqUnknown ? r.equipment.includes("bodyweight") : loadEq(r) === loadEq(f)));
      if (exact.length === 1) cands = exact;
    }
    if (cands.length === 1) {
      uf.union(f.ref, cands[0].ref);
      repTaken.add(cands[0].ref);
      autoMatches.push({ fedb: f.ref, repdb: cands[0].ref, key: k });
    } else if (cands.length > 1) ambiguous.push({ fedb: f.ref, candidates: cands.map((c) => c.ref) });
  }

  // Collect groups.
  const groups = new Map<string, string[]>();
  for (const ref of allRefs) {
    const root = uf.find(ref);
    groups.set(root, [...(groups.get(root) ?? []), ref]);
  }

  // Build exercises (without IDs yet).
  type Built = Omit<CatalogExercise, "exId" | "status" | "mergedInto"> & { refs: string[]; curatedKey: string | null };
  const built: Built[] = [];
  const verification: Record<string, unknown> = {};
  for (const refs of groups.values()) {
    const keys = uniq(refs.map((r) => claimedBy.get(r)).filter((k): k is string => !!k));
    if (keys.length > 1) fail(`group mixes curated entries ${keys.join(", ")}`);
    const entry = keys[0] ? entryByKey.get(keys[0])! : null;
    const order = entry?.match ?? (entry?.create ? [`curated:${entry.key}`] : []);
    const ordered = [...refs].sort((a, b) => {
      const ia = order.indexOf(a), ib = order.indexOf(b);
      return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib) || a.localeCompare(b);
    });
    const cands = ordered.map((r) => byRef.get(r)!);
    const rep = cands.find((c) => c.source === "repdb");
    const fe = cands.find((c) => c.source === "free-exercise-db");
    const cur = cands.find((c) => c.source === "curated");
    const base = cur ?? rep ?? fe!;

    const name = entry?.name ?? base.name;
    const n = name.toLowerCase();
    let equipment = entry?.equipment ?? [...base.equipment];
    if (!entry?.equipment) {
      if (!equipment.length) equipment = base.eqUnknown ? ["bodyweight"] : ["other"];
      for (const [re, eq] of C.EQUIPMENT_NAME_RULES) if (re.test(n) && !equipment.includes(eq)) equipment.push(eq);
      // "smith" replaces the generic "machine" bucket fedb uses for Smith exercises.
      if (equipment.includes("smith")) equipment = equipment.filter((e) => e !== "machine");
      if (equipment.length > 1) equipment = equipment.filter((e) => e !== "other");
    }
    const primary = entry?.primary ?? base.primary;
    const secondary = (entry?.secondary ?? base.secondary).filter((m) => !primary.includes(m));
    const mechanic = entry?.mechanic !== undefined ? entry.mechanic : (rep?.mechanic ?? fe?.mechanic ?? cur?.mechanic ?? null);
    const pattern = entry?.pattern ?? derivePattern(name, cands, primary, mechanic);
    const mech: CatalogExercise["mechanic"] =
      mechanic ?? (pattern === "cardio" || pattern === "mobility" ? null : pattern.startsWith("isolation") ? "isolation" : "compound");
    const tracking = entry?.tracking ?? deriveTracking(name, cands, pattern, equipment);
    const unilateral =
      entry?.unilateral ??
      rep?.unilateral ??
      /one[- ]arm|one[- ]leg|single[- ](arm|leg)|unilateral|lunge|split squat|step[- ]?up|pistol|side plank|side bridge/.test(
        cands.map((c) => c.name.toLowerCase()).join(" | "),
      );
    const level = entry?.level !== undefined ? entry.level : (rep?.level ?? fe?.level ?? null);
    const commonness = entry?.commonness ?? defaultCommonness(name, cands, pattern);
    const family = entry && "family" in entry ? (entry.family ?? null) : (firstRule(C.FAMILY_RULES, n) ?? null);
    const instructions = entry?.instructions ?? (rep?.instructions.length ? rep.instructions : (fe?.instructions ?? []));
    const images = [...(rep?.images ?? []), ...(fe?.images ?? [])];
    const sourceNames = uniq(cands.filter((c) => c.source !== "curated").map((c) => c.name));
    const aliases = deriveAliases(name, entry?.aliases ?? [], sourceNames);
    const sources: SourceRef[] = cands.map((c) => ({ source: c.source, sourceId: c.sourceId, version: commitOf(c.source) }));

    built.push({
      name, aliases, equipment: uniq(equipment), primary, secondary, pattern, mechanic: mech, tracking, unilateral, level,
      commonness, family, instructions, images, sources, refs: ordered, curatedKey: entry?.key ?? null,
    });
  }
  built.sort((a, b) => a.name.localeCompare(b.name) || a.refs[0].localeCompare(b.refs[0]));
  // Same display name, different exercise (e.g. dumbbell vs EZ-bar "Spider Curl"): suffix the
  // equipment on the row that does not come from RepDB/curated so names stay unique.
  const renamed: Array<{ from: string; to: string }> = [];
  const byName = new Map<string, Built[]>();
  for (const b of built) byName.set(b.name.toLowerCase(), [...(byName.get(b.name.toLowerCase()) ?? []), b]);
  for (const list of byName.values()) {
    if (list.length < 2) continue;
    const rank = (b: Built) => (b.curatedKey ? 0 : b.refs.some((r) => r.startsWith("repdb:")) ? 1 : 2);
    for (const b of [...list].sort((x, y) => rank(x) - rank(y)).slice(1)) {
      const to = `${b.name} (${b.equipment.map((e) => EQUIPMENT_LABEL[e]).join(", ")})`;
      renamed.push({ from: b.name, to });
      if (!b.aliases.includes(b.name)) b.aliases.unshift(b.name);
      b.name = to;
    }
  }
  built.sort((a, b) => a.name.localeCompare(b.name) || a.refs[0].localeCompare(b.refs[0]));

  // Assign stable IDs.
  const idMap = loadIdMap();
  const now = new Date().toISOString();
  let nextSeq = Math.max(0, ...Object.values(idMap.ids).map((i) => i.seq)) + 1;
  const claimedIds = new Map<string, string>();
  const newIds: string[] = [];
  const mergedNow: Array<{ loser: string; winner: string }> = [];
  const rows: CatalogExercise[] = [];
  for (const b of built) {
    const existing = uniq(b.refs.map((r) => idMap.refs[r]).filter((x): x is string => !!x).map((id) => resolveId(idMap, id)));
    let exId: string;
    if (!existing.length) {
      const baseSlug = "ex_" + slugify(b.name);
      exId = baseSlug;
      for (let i = 2; idMap.ids[exId]; i++) exId = `${baseSlug}_${i}`;
      idMap.ids[exId] = { seq: nextSeq++, name: b.name, status: "active", mergedInto: null, createdAt: now };
      newIds.push(exId);
    } else {
      existing.sort((a, c) => idMap.ids[a].seq - idMap.ids[c].seq);
      exId = existing[0];
      for (const loser of existing.slice(1)) {
        idMap.ids[loser] = { ...idMap.ids[loser], status: "merged", mergedInto: exId };
        mergedNow.push({ loser, winner: exId });
      }
    }
    if (claimedIds.has(exId))
      fail(`ID split: ${exId} is claimed by "${claimedIds.get(exId)}" and "${b.name}". Resolve in curated.ts (merge them or give one a new curated entry).`);
    claimedIds.set(exId, b.name);
    for (const r of b.refs) idMap.refs[r] ??= exId;
    const { refs: _r, curatedKey: _k, ...rest } = b;
    rows.push({ exId, ...rest, status: "active", mergedInto: null });
  }
  // Merged IDs stay resolvable: emit them as rows pointing at their winner.
  const activeById = new Map(rows.map((r) => [r.exId, r]));
  const orphaned: string[] = [];
  for (const [id, info] of Object.entries(idMap.ids)) {
    if (info.status === "merged") {
      const winner = activeById.get(resolveId(idMap, id));
      if (!winner) fail(`merged id ${id} resolves to missing ${resolveId(idMap, id)}`);
      rows.push({ ...winner!, exId: id, name: info.name, aliases: [], status: "merged", mergedInto: winner!.exId });
    } else if (!activeById.has(id)) orphaned.push(id);
  }
  if (orphaned.length) console.warn(`WARNING: ${orphaned.length} exIds no longer have source rows: ${orphaned.join(", ")}`);
  rows.sort((a, b) => a.exId.localeCompare(b.exId));

  const unmappedTotal = Object.values(unmapped).reduce((n, o) => n + Object.keys(o).length, 0);
  if (unmappedTotal) fail(`Unmapped source values: ${JSON.stringify(unmapped)}`);
  validate(rows);

  // Write outputs.
  const body = "[\n" + rows.map((r) => JSON.stringify(r)).join(",\n") + "\n]\n";
  const version = sha256(body).slice(0, 16);
  fs.writeFileSync(OUT_PATH, body);
  fs.writeFileSync(IDMAP_PATH, stableStringify(idMap));
  fs.writeFileSync(LOCK_PATH, stableStringify(lock));
  const active = rows.filter((r) => r.status === "active");
  const count = <K extends string>(f: (r: CatalogExercise) => K | K[]) => {
    const o: Record<string, number> = {};
    for (const r of active) for (const k of ([] as K[]).concat(f(r))) o[k] = (o[k] ?? 0) + 1;
    return Object.fromEntries(Object.entries(o).sort());
  };
  const counts = {
    input: { "free-exercise-db": fedb.length, repdb: repdb.length, curatedCreated: C.CURATED.filter((e) => e.create).length },
    active: active.length,
    merged: rows.length - active.length,
    crossSourceMerged: active.filter((r) => new Set(r.sources.map((s) => s.source)).size > 1).length,
    bySourceMix: count((r) => uniq(r.sources.map((s) => s.source)).sort().join("+")),
    duplicatesRemoved: duplicates.length + C.CURATED.reduce((n, e) => n + Math.max(0, (e.match?.length ?? 0) - new Set((e.match ?? []).map((m) => m.split(":")[0])).size), 0),
    withImages: active.filter((r) => r.images.length).length,
    withRepdbImages: active.filter((r) => r.images.some((i) => i.source === "repdb")).length,
    pattern: count((r) => r.pattern),
    tracking: count((r) => r.tracking),
    commonness: count((r) => String(r.commonness)),
  };
  const meta = {
    version,
    builtAt: now,
    schema: 1,
    sources: Object.fromEntries(
      (Object.keys(lock) as SourceName[]).map((s) => [s, { ...lock[s], license: s === "repdb" ? "RepDB Free Tier License v1.0 (attribution; no dataset republishing)" : "Unlicense" }]),
    ),
    curated: { version: CURATED_VERSION, sha256: sha256(fs.readFileSync(path.join(CATALOG, "curated.ts"))) },
    counts,
  };
  fs.writeFileSync(META_PATH, JSON.stringify(meta, null, 2) + "\n");

  // Diagnostics for the report.
  const vt: Record<string, string> = {
    "Barbell back squat": "barbell-back-squat", "Front squat": "front-squat", RDL: "romanian-deadlift",
    "Conventional deadlift": "deadlift", "Hip thrust": "hip-thrust", "Leg press": "leg-press", "Hack squat": "hack-squat",
    "Bulgarian split squat": "bulgarian-split-squat", "Leg extension": "leg-extension", "Lying leg curl": "lying-leg-curl",
    "Bench press": "bench-press", "Incline DB press": "incline-db-press", OHP: "ohp", "Lateral raise": "lateral-raise",
    "Face pull": "face-pull", "Pull-up": "pull-up", "Lat pulldown": "lat-pulldown", "Barbell row": "barbell-row",
    "Cable fly": "cable-fly", Dips: "chest-dips", Plank: "plank",
  };
  for (const [label, key] of Object.entries(vt)) {
    const b = built.find((x) => x.curatedKey === key);
    if (!b) fail(`verification target ${key} missing`);
    const cands = b!.refs.map((r) => byRef.get(r)!);
    verification[label] = {
      exId: rows.find((r) => r.name === b!.name && r.status === "active")?.exId,
      repdb: cands.filter((c) => c.source === "repdb").map((c) => ({ id: c.sourceId, P: c.rawPrimary, S: c.rawSecondary })),
      fedb: cands.filter((c) => c.source === "free-exercise-db").map((c) => ({ id: c.sourceId, P: c.rawPrimary, S: c.rawSecondary })),
      final: { P: b!.primary, S: b!.secondary },
      note: entryByKey.get(key)?.note ?? null,
    };
  }
  const report = {
    counts, autoMatches, ambiguous, duplicates, renamed, newIds: newIds.length, mergedNow, orphaned, verification,
    curatedMerges: C.CURATED.filter((e) => (e.match?.length ?? 0) > 1).map((e) => ({ key: e.key, refs: e.match })),
    created: C.CURATED.filter((e) => e.create).map((e) => e.name),
    unmatchedStaples: active.filter((r) => r.commonness >= 4 && r.sources.length === 1).map((r) => `${r.name} [${r.sources[0].source}]`),
  };
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2) + "\n");

  console.log(
    `catalog ${version}: ${active.length} active (+${counts.merged} merged ids), ${counts.crossSourceMerged} cross-source merges, ` +
      `${autoMatches.length} auto matches, ${ambiguous.length} ambiguous, ${duplicates.length} in-source dupes, ${newIds.length} new ids`,
  );
}

main().catch((err) => {
  console.error(err instanceof BuildError ? `BUILD FAILED: ${err.message}` : err);
  process.exit(1);
});
