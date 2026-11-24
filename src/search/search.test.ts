import { describe, expect, it } from "vitest";
import { EQUIPMENT, MUSCLE_INFO, MUSCLES, PATTERNS, type Equipment, type Muscle } from "../shared/domain";
import { FIXTURE } from "./fixtures";
import { buildSearchIndex, normalizeTokens, search, type SearchableExercise, type SearchOptions } from "./index";

const index = buildSearchIndex(FIXTURE);
const ids = (q: string, opts?: SearchOptions) => search(index, q, opts).results.map((r) => r.exercise.exId);
const top = (q: string, opts?: SearchOptions) => search(index, q, opts).results[0];
const LEG_MUSCLES = MUSCLES.filter((m) => MUSCLE_INFO[m].group === "legs");

describe("normalization", () => {
  it("unifies hyphens, spaces, plurals, accents and spelling", () => {
    expect(normalizeTokens("Pull-Ups")).toEqual(["pullup"]);
    expect(normalizeTokens("pull ups")).toEqual(["pullup"]);
    expect(normalizeTokens("pullup")).toEqual(["pullup"]);
    expect(normalizeTokens("Bench Presses")).toEqual(["bench", "press"]);
    expect(normalizeTokens("Curls")).toEqual(["curl"]);
    expect(normalizeTokens("Dumbbell Flyes")).toEqual(["dumbbell", "fly"]);
    expect(normalizeTokens("Farmer’s Carry")).toEqual(["farmer", "carry"]);
    expect(normalizeTokens("Développé couché")).toEqual(["developpe", "couche"]);
    expect(normalizeTokens("Lat pull down")).toEqual(["lat", "pulldown"]);
    expect(normalizeTokens("calves")).toEqual(["calf"]);
  });
});

describe("abbreviations and slang", () => {
  it("RDL / rdl → Romanian Deadlift first", () => {
    expect(top("RDL").exercise.exId).toBe("ex_romanian_deadlift");
    expect(top("rdl").exercise.exId).toBe("ex_romanian_deadlift");
    expect(top("rdl").matchKind).toBe("exact");
  });
  it("db rdl → Dumbbell Romanian Deadlift", () => {
    expect(top("db rdl").exercise.exId).toBe("ex_db_rdl");
  });
  it("ohp, bss, cgbp, ghr, sldl, jm press", () => {
    expect(top("ohp").exercise.exId).toBe("ex_ohp");
    expect(top("bss").exercise.exId).toBe("ex_bulgarian_split_squat");
    expect(top("cgbp").exercise.exId).toBe("ex_close_grip_bench");
    expect(top("ghr").exercise.exId).toBe("ex_glute_ham_raise");
    expect(top("sldl").exercise.exId).toBe("ex_stiff_leg_deadlift");
    expect(top("jm press").exercise.exId).toBe("ex_jm_press");
  });
  it("skulls / skull → Skull Crusher", () => {
    expect(top("skulls").exercise.exId).toBe("ex_skull_crusher");
    expect(top("skull").exercise.exId).toBe("ex_skull_crusher");
  });
  it("pec deck / pec dec, lat pull down / lat pulldown", () => {
    expect(top("pec deck").exercise.exId).toBe("ex_pec_deck");
    expect(top("pec dec").exercise.exId).toBe("ex_pec_deck");
    expect(top("lat pull down").exercise.exId).toBe("ex_lat_pulldown");
    expect(top("lat pulldown").exercise.exId).toBe("ex_lat_pulldown");
  });
  it("kb swing, ez curl, db bench", () => {
    expect(top("kb swing").exercise.exId).toBe("ex_kb_swing");
    expect(top("ez curl").exercise.exId).toBe("ex_ez_curl");
    expect(top("db bench").exercise.exId).toBe("ex_db_bench");
  });
});

describe("compound words and plurals", () => {
  it("pullup / pull-ups / pull up / Pull-Up all find Pull-Up first", () => {
    for (const q of ["pullup", "pull-ups", "pull up", "Pull-Up", "pullups"]) {
      expect(top(q).exercise.exId).toBe("ex_pull_up");
    }
  });
  it("a half-typed particle still matches (pull u)", () => {
    expect(ids("pull u").slice(0, 2)).toContain("ex_pull_up");
  });
  it("push ups / press-up → Push-Up", () => {
    expect(top("push ups").exercise.exId).toBe("ex_push_up");
    expect(top("press-up").exercise.exId).toBe("ex_push_up");
  });
  it("bench presses → bench press variants, barbell first", () => {
    const r = ids("bench presses");
    expect(r[0]).toBe("ex_bench_press");
    expect(r).toContain("ex_db_bench");
  });
  it("punctuation/apostrophes: farmers carry", () => {
    expect(top("farmers carry").exercise.exId).toBe("ex_farmers_carry");
  });
});

describe("typo tolerance", () => {
  it("romanain deadlift / romanain", () => {
    const r = search(index, "romanain deadlift");
    expect(r.results[0].exercise.exId).toBe("ex_romanian_deadlift");
    expect(r.results[0].matchKind).toBe("fuzzy");
    expect(top("romanain").exercise.exId).toBe("ex_romanian_deadlift");
  });
  it("dumbel row → Dumbbell Row", () => {
    expect(top("dumbel row").exercise.exId).toBe("ex_db_row");
  });
  it("tricep pushdwon → Triceps Pushdown", () => {
    expect(top("tricep pushdwon").exercise.exId).toBe("ex_triceps_pushdown");
  });
  it("hammr curl, bulgrian splt squt", () => {
    expect(top("hammr curl").exercise.exId).toBe("ex_hammer_curl");
    expect(top("bulgrian splt squt").exercise.exId).toBe("ex_bulgarian_split_squat");
  });
  it("no typo tolerance for ≤3-letter words", () => {
    expect(ids("rdk")).toHaveLength(0);
  });
  it("typo in a muscle word (shoudlers)", () => {
    const r = search(index, "shoudlers");
    expect(r.results.length).toBeGreaterThan(0);
    expect(r.results[0].exercise.primary.some((m) => MUSCLE_INFO[m].group === "shoulders")).toBe(true);
  });
});

describe("query intent", () => {
  it("dumbbell chest → dumbbell AND chest, primary chest first", () => {
    const r = search(index, "dumbbell chest");
    expect(r.interpreted.equipment).toEqual(["dumbbell"]);
    expect(r.interpreted.muscles).toContain("chest");
    expect(r.results.length).toBeGreaterThanOrEqual(3);
    for (const res of r.results) expect(res.exercise.equipment).toContain("dumbbell");
    for (const res of r.results.slice(0, 3)) expect(res.exercise.primary).toContain("chest");
  });
  it("leg press → Leg Press #1 (name beats attribute reading of 'leg')", () => {
    const r = search(index, "leg press");
    expect(r.results[0].exercise.exId).toBe("ex_leg_press");
    expect(r.results[0].matchKind).toBe("exact");
    expect(r.interpreted.text).toEqual(["leg", "press"]);
  });
  it("no equipment → bodyweight-only results", () => {
    const r = search(index, "no equipment");
    expect(r.interpreted.noEquipment).toBe(true);
    expect(r.results.length).toBeGreaterThan(3);
    for (const res of r.results) expect(res.exercise.equipment).toEqual(["bodyweight"]);
    expect(ids("no equipment")).toContain("ex_push_up");
    expect(ids("bodyweight only")).toEqual(ids("no equipment"));
    expect(ids("at home")).toEqual(ids("no equipment"));
  });
  it("chest → primary chest ranked above exercises with chest only secondary", () => {
    const r = search(index, "chest").results;
    const lastPrimary = r.map((x) => x.exercise.primary.includes("chest")).lastIndexOf(true);
    const firstSecondary = r.findIndex((x) => !x.exercise.primary.includes("chest"));
    expect(firstSecondary).toBeGreaterThan(lastPrimary);
    expect(r.map((x) => x.exercise.exId)).toContain("ex_close_grip_bench"); // triceps, chest secondary
    // "Chest-Supported Row" mentions chest but doesn't train it: last.
    const ids2 = r.map((x) => x.exercise.exId);
    expect(ids2.indexOf("ex_chest_supported_row")).toBe(ids2.length - 1);
  });
  it("legs dumbbell → dumbbell leg exercises, primary legs first", () => {
    const r = search(index, "legs dumbbell").results;
    expect(r.length).toBeGreaterThanOrEqual(4);
    for (const res of r) {
      expect(res.exercise.equipment).toContain("dumbbell");
      expect([...res.exercise.primary, ...res.exercise.secondary].some((m) => LEG_MUSCLES.includes(m))).toBe(true);
    }
    expect(r[0].exercise.primary.some((m) => LEG_MUSCLES.includes(m))).toBe(true);
  });
  it("slang muscle words: hammies, booty, calves, tris, delts", () => {
    expect(top("hammies").exercise.primary).toContain("hamstrings");
    expect(top("booty").exercise.primary).toContain("glutes");
    expect(top("calves").exercise.primary).toContain("calves");
    expect(top("tris").exercise.primary).toContain("triceps");
    expect(top("delts").exercise.primary.some((m) => MUSCLE_INFO[m].group === "shoulders")).toBe(true);
  });
  it("multi-word queries require every word (prefix on each word)", () => {
    expect(ids("bench zzz")).toHaveLength(0);
    expect(top("inc db pr").exercise.exId).toBe("ex_incline_db_bench");
    expect(top("sea cab ro").exercise.exId).toBe("ex_seated_cable_row");
  });
});

describe("filters", () => {
  it("a filter that excludes an otherwise exact match is respected", () => {
    const r = ids("leg press", { filters: { equipment: ["barbell"] } });
    expect(r).not.toContain("ex_leg_press");
  });
  it("muscle + tracking filters apply to every result", () => {
    const r = search(index, "row", { filters: { muscles: ["lats"], tracking: ["weight_reps"] } }).results;
    expect(r.length).toBeGreaterThan(0);
    for (const res of r) {
      expect([...res.exercise.primary, ...res.exercise.secondary]).toContain("lats");
      expect(res.exercise.tracking).toBe("weight_reps");
    }
  });
});

describe("ranking and personalization", () => {
  it("exact match is not buried by a more common, favorited, frequent exercise", () => {
    const custom: SearchableExercise = {
      exId: "cx_curl",
      name: "Curl",
      aliases: [],
      equipment: ["dumbbell"],
      primary: ["biceps"],
      secondary: [],
      pattern: "isolation_upper",
      family: "curl",
      tracking: "weight_reps",
      custom: true,
    };
    const ix = buildSearchIndex([...FIXTURE, custom]);
    const r = search(ix, "curl", {
      personal: { favorites: new Set(["ex_barbell_curl"]), frequency: { ex_barbell_curl: 200 }, recent: { ex_barbell_curl: 1 } },
      now: 1,
    }).results;
    expect(r[0].exercise.exId).toBe("cx_curl");
    expect(r[0].matchKind).toBe("exact");
    expect(r[0].reasons).toContain("your custom exercise");
  });
  it("favorites nudge within a tier but never above an alias match", () => {
    const plain = ids("bench press");
    expect(plain[0]).toBe("ex_bench_press");
    const fav = search(index, "bench press", { personal: { favorites: new Set(["ex_decline_bench"]) } }).results;
    expect(fav[0].exercise.exId).toBe("ex_bench_press");
    expect(fav[0].matchKind).toBe("alias");
    expect(fav[1].exercise.exId).toBe("ex_decline_bench");
    expect(plain.indexOf("ex_decline_bench")).toBeGreaterThan(1);
    expect(top("hammer curl", { personal: { favorites: new Set(["ex_db_curl"]) } }).exercise.exId).toBe("ex_hammer_curl");
  });
  it("favorites never bypass filters", () => {
    const r = ids("curl", { filters: { equipment: ["cable"] }, personal: { favorites: new Set(["ex_barbell_curl"]) } });
    expect(r).not.toContain("ex_barbell_curl");
  });
  it("available equipment boosts but doesn't hide", () => {
    const base = ids("row");
    expect(base.indexOf("ex_barbell_row")).toBeLessThan(base.indexOf("ex_db_row"));
    const r = ids("row", { personal: { availableEquipment: ["dumbbell", "bench"] } });
    expect(r.indexOf("ex_db_row")).toBeLessThan(r.indexOf("ex_barbell_row"));
    expect(r).toContain("ex_barbell_row");
  });
  it("muscles not yet trained this session get a slight boost", () => {
    const base = ids("curl");
    const r = ids("curl", { personal: { sessionMuscles: ["biceps", "brachialis"] } });
    expect(r.indexOf("ex_leg_curl")).toBeLessThan(base.indexOf("ex_leg_curl"));
  });
  it("reasons keep measured usage distinct from curated commonness", () => {
    const r = top("bench press", { personal: { frequency: { ex_bench_press: 12 } } });
    expect(r.reasons.some((s) => s.startsWith("measured: logged 12"))).toBe(true);
    expect(r.reasons.some((s) => s.startsWith("curated commonness 5/5"))).toBe(true);
  });
  it("bench → plain Bench Press before longer variants", () => {
    expect(top("bench").exercise.exId).toBe("ex_bench_press");
  });
});

describe("browse mode (empty query)", () => {
  it("orders by curated commonness without personal data", () => {
    const r = search(index, "").results;
    expect(r).toHaveLength(50);
    for (let i = 1; i < r.length; i++) {
      expect(r[i - 1].exercise.commonness!).toBeGreaterThanOrEqual(r[i].exercise.commonness!);
    }
    expect(r[0].matchKind).toBe("browse");
  });
  it("favorites first, then recent, then commonness", () => {
    const now = 100 * 86_400_000;
    const r = ids("", {
      personal: {
        favorites: new Set(["ex_hammer_curl"]),
        recent: { ex_face_pull: now - 86_400_000, ex_glute_bridge: now - 10 * 86_400_000 },
      },
      now,
      limit: 5,
    });
    expect(r.slice(0, 3)).toEqual(["ex_hammer_curl", "ex_face_pull", "ex_glute_bridge"]);
    expect(search(index, "", { limit: 500 }).results.length).toBe(FIXTURE.length);
  });
  it("browse respects filters", () => {
    const r = search(index, "", { filters: { patterns: ["hinge"] } }).results;
    expect(r.length).toBeGreaterThan(0);
    for (const res of r) expect(res.exercise.pattern).toBe("hinge");
  });
});

describe("sparse results → suggestions", () => {
  it("relax_filter with resulting count", () => {
    const r = search(index, "romanian deadlift", { filters: { equipment: ["kettlebell"] } });
    expect(r.results).toHaveLength(0);
    const relax = r.suggestions.find((s) => s.kind === "relax_filter");
    expect(relax).toBeDefined();
    expect(relax!.label).toMatch(/\(\d+ results?\)/);
    expect(relax!.apply.filters?.equipment).toBeUndefined();
    expect(search(index, relax!.apply.query!, { filters: relax!.apply.filters }).results.length).toBeGreaterThan(0);
  });
  it("did_you_mean for a glued/misspelled name", () => {
    const r = search(index, "facepul");
    expect(r.results.length).toBeLessThan(3);
    const dym = r.suggestions.filter((s) => s.kind === "did_you_mean");
    expect(dym[0]?.apply.exId).toBe("ex_face_pull");
  });
  it("related family/pattern exercises for an unknown variant", () => {
    const r = search(index, "zercher squat");
    expect(r.results).toHaveLength(0);
    const rel = r.suggestions.filter((s) => s.kind === "related");
    expect(rel.length).toBeGreaterThan(0);
    for (const s of rel) expect(FIXTURE.find((e) => e.exId === s.apply.exId)!.pattern).toBe("squat");
  });
  it("no suggestions when results are plentiful", () => {
    expect(search(index, "curl").suggestions).toHaveLength(0);
  });
});

describe("custom exercises", () => {
  it("are searchable identically (typos, prefixes, attributes)", () => {
    const custom: SearchableExercise = {
      exId: "cx_zercher",
      name: "Zercher Squat",
      aliases: ["Zerch"],
      equipment: ["barbell"],
      primary: ["quads"],
      secondary: ["abs"],
      pattern: "squat",
      family: "squat",
      tracking: "weight_reps",
      custom: true,
    };
    const ix = buildSearchIndex([...FIXTURE, custom]);
    expect(search(ix, "zercher squat").results[0].exercise.exId).toBe("cx_zercher");
    expect(search(ix, "zerhcer").results[0].exercise.exId).toBe("cx_zercher");
    expect(search(ix, "zer sq").results[0].exercise.exId).toBe("cx_zercher");
    expect(search(ix, "barbell quads").results.map((r) => r.exercise.exId)).toContain("cx_zercher");
  });
});

describe("performance", () => {
  it("1,500 exercises × 200 queries: average < 5 ms per query", () => {
    let seed = 42;
    const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)];
    const mods = ["Incline", "Decline", "Seated", "Standing", "Single-Arm", "Single-Leg", "Paused", "Tempo", "Wide-Grip", "Close-Grip", "Reverse", "Kneeling", "Deficit", "Banded", "Chain", "Isometric", "Half", "Landmine", "Cossack", "Pendlay"];
    const bases = ["Squat", "Bench Press", "Deadlift", "Row", "Curl", "Pushdown", "Lunge", "Raise", "Fly", "Press", "Pulldown", "Extension", "Shrug", "Thrust", "Crunch", "Plank", "Carry", "Swing", "Clean", "Snatch", "Pull-Up", "Dip", "Kickback", "Step-Up", "Good Morning"];
    const eqWords: Record<string, Equipment> = { Barbell: "barbell", Dumbbell: "dumbbell", Cable: "cable", Machine: "machine", Kettlebell: "kettlebell", Band: "band", Smith: "smith" };
    const synth: SearchableExercise[] = [...FIXTURE];
    for (let i = synth.length; i < 1500; i++) {
      const eq = pick(Object.keys(eqWords));
      const name = `${pick(mods)} ${eq} ${pick(bases)} ${i % 7 === 0 ? pick(mods) : ""}`.trim();
      synth.push({
        exId: `syn_${i}`,
        name,
        aliases: i % 3 === 0 ? [`${pick(mods)} ${pick(bases)} v${i}`] : [],
        equipment: [eqWords[eq]],
        primary: [pick(MUSCLES)],
        secondary: [pick(MUSCLES), pick(MUSCLES)],
        pattern: pick(PATTERNS),
        family: pick(bases).toLowerCase(),
        commonness: (1 + Math.floor(rand() * 5)) as 1 | 2 | 3 | 4 | 5,
        tracking: "weight_reps",
      });
    }
    const t0 = performance.now();
    const ix = buildSearchIndex(synth);
    const buildMs = performance.now() - t0;

    const realistic = ["rdl", "db bench", "dumbbell chest", "leg press", "no equipment", "pull up", "skulls", "ohp", "tricep pushdwon", "romanain deadlift", "chest", "legs dumbbell", "inc db pr", "b", "be", "ben", "benc", "bench", "bench p", "bench press", "s", "sq", "squ", "squat", "kneeling cable", "single leg rdl", "facepul", "zercher squat", "hamstrng curl", "shoudlers"];
    const queries: string[] = [];
    for (let i = 0; i < 200; i++) {
      if (i < realistic.length) queries.push(realistic[i]);
      else {
        const ex = pick(synth);
        const words = ex.name.toLowerCase().split(" ");
        const w = words.slice(0, 1 + Math.floor(rand() * words.length)).join(" ");
        const cut = w.slice(0, Math.max(1, Math.floor(w.length * (0.4 + rand() * 0.6))));
        // Every 4th query gets a transposition typo.
        queries.push(i % 4 === 0 && cut.length > 5 ? cut.slice(0, 2) + cut[3] + cut[2] + cut.slice(4) : cut);
      }
    }
    const personal = {
      favorites: new Set(["ex_bench_press", "syn_100"]),
      recent: { ex_db_row: Date.now() - 86_400_000 },
      frequency: { ex_db_row: 30 },
      availableEquipment: ["dumbbell", "bench"] as Equipment[],
      sessionMuscles: ["chest"] as Muscle[],
    };
    for (const q of queries.slice(0, 20)) search(ix, q, { personal }); // warm-up (JIT)
    const t1 = performance.now();
    for (const q of queries) search(ix, q, { personal, filters: q.length % 5 === 0 ? { equipment: [pick(EQUIPMENT)] } : undefined });
    const avg = (performance.now() - t1) / queries.length;
    console.log(`[search perf] build ${buildMs.toFixed(1)} ms for ${synth.length} exercises; avg ${avg.toFixed(3)} ms/query over ${queries.length} queries`);
    expect(avg).toBeLessThan(5);
  });
});
