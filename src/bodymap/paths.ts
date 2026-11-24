import type { Muscle } from "../shared/domain";

/**
 * Original, hand-authored artwork for the body map.
 *
 * Each figure lives in a 200 × 440 box with the midline at x = 100. Paths are
 * written for the viewer's LEFT half only, using absolute M/L/Q/C/Z commands
 * (every number is part of an x,y pair) and mirrored to the right half with
 * `mirror()`. The front and back figures share the same silhouette.
 */
export const FIGURE_W = 200;
export const FIGURE_H = 440;
export const MID_X = FIGURE_W / 2;

/** Mirror an absolute-command path across x = MID_X. */
export function mirror(d: string): string {
  let i = 0;
  return d.replace(/-?\d*\.?\d+/g, (n) => {
    const v = Number(n);
    const out = i % 2 === 0 ? String(+(FIGURE_W - v).toFixed(2)) : n;
    i++;
    return out;
  });
}

const both = (d: string) => [d, mirror(d)];

/** Half silhouette: head, neck, shoulder, arm, torso, leg. */
const SILHOUETTE_HALF =
  "M100 6 C88 6 80 16 80 32 C80 46 86 56 90 60 L90 68 Q74 74 58 78 Q44 82 40 96 " +
  "L36 130 Q34 150 32 165 L26 210 Q24 230 22 245 Q18 262 26 268 Q34 266 34 250 " +
  "L40 225 Q46 200 48 175 L52 140 L54 112 L56 150 Q58 185 60 205 Q58 222 60 240 " +
  "L62 300 Q64 330 66 345 L64 380 Q64 410 70 425 L66 436 L92 436 L92 422 " +
  "Q96 380 94 350 L96 300 Q98 260 100 240 Z";

/** Filled halves (closed along the midline, no stroke). */
export const SILHOUETTE = both(SILHOUETTE_HALF);
/** Outline halves: same edges left open so the midline is never stroked. */
export const SILHOUETTE_OUTLINE = both(SILHOUETTE_HALF.replace(/ Z$/, ""));

export type View = "front" | "back";

/** Left-half regions per muscle per view (mirrored at render time). */
const FRONT: Partial<Record<Muscle, string[]>> = {
  neck: ["M86 58 L90 58 Q94 68 98 76 L93 78 Q88 70 86 58 Z"],
  traps: ["M90 66 Q76 72 62 78 L70 81 Q82 77 92 73 Z"],
  side_delts: ["M54 79 Q41 82 37 98 L39 112 Q41 100 46 90 Q50 84 56 81 Z"],
  front_delts: ["M57 81 Q48 86 44 96 Q42 106 46 116 L52 118 Q54 102 66 86 Q62 82 57 81 Z"],
  chest: ["M98 84 L70 84 Q60 88 55 104 Q58 120 72 124 Q88 126 98 120 Z"],
  brachialis: ["M41 132 Q37 146 38 160 L45 165 Q41 152 41 140 Z"],
  biceps: ["M48 118 Q42 126 42 142 Q43 156 47 162 Q53 150 53 134 Q52 122 48 116 Z"],
  forearms: ["M44 167 Q36 173 32 190 Q28 210 26 236 L32 238 Q40 212 46 190 Q50 176 48 167 Z"],
  serratus: ["M57 112 L63 124 L59 127 L65 136 L60 139 L65 148 L58 147 Q56 130 57 112 Z"],
  obliques: ["M59 151 Q65 147 75 150 L77 176 Q73 196 71 207 Q63 203 61 195 Q58 172 59 151 Z"],
  abs: ["M98 127 L83 127 Q79 150 79 176 Q81 196 85 210 Q92 214 98 214 Z"],
  abductors: ["M62 212 Q58 224 60 240 L64 254 Q66 236 70 222 Z"],
  hip_flexors: ["M81 216 Q73 222 71 232 L77 246 Q84 232 93 223 Z"],
  adductors: ["M90 234 Q84 244 86 260 Q88 280 93 298 Q97 286 98 262 L99 242 Z"],
  quads: ["M68 232 Q62 256 62 290 Q63 318 70 338 Q78 344 88 336 Q93 316 92 296 Q86 276 85 258 Q82 244 68 232 Z"],
  tibialis: ["M69 352 Q64 370 66 396 L70 416 Q74 392 76 370 Q76 356 72 350 Z"],
};

const BACK: Partial<Record<Muscle, string[]>> = {
  neck: ["M90 56 Q92 62 92 66 L98 66 L98 54 Z"],
  traps: ["M100 62 L92 67 Q78 74 60 80 Q72 86 84 94 Q92 120 100 148 Z"],
  side_delts: ["M54 79 Q41 82 37 98 L39 112 Q41 100 46 90 Q50 84 56 81 Z"],
  rear_delts: ["M58 81 Q47 86 44 100 Q44 110 48 114 Q54 100 66 90 Q64 84 58 81 Z"],
  rotator_cuff: ["M64 93 Q72 92 81 98 L83 111 Q74 117 64 112 Q60 102 64 93 Z"],
  upper_back: ["M62 115 Q74 121 85 115 L89 128 Q80 134 66 132 Q60 124 62 115 Z"],
  lats: ["M57 117 Q58 140 64 164 Q74 184 88 192 Q90 170 92 150 L90 135 Q80 139 64 135 Q60 127 57 117 Z"],
  lower_back: ["M98 152 L93 152 Q90 176 90 204 L98 208 Z"],
  triceps: ["M41 112 Q36 128 38 148 Q42 160 48 160 Q54 142 54 118 L48 115 Z"],
  forearms: ["M44 167 Q36 173 32 190 Q28 210 26 236 L32 238 Q40 212 46 190 Q50 176 48 167 Z"],
  abductors: ["M61 200 Q59 212 61 226 Q66 214 80 208 Q74 200 61 200 Z"],
  glutes: ["M98 212 Q80 206 66 214 Q60 230 64 248 Q80 258 98 252 Z"],
  hamstrings: ["M66 256 Q62 280 64 310 Q67 330 72 342 Q82 348 92 340 Q96 312 96 284 Q95 266 92 258 Q80 263 66 256 Z"],
  calves: ["M70 350 Q62 366 64 386 Q68 398 76 400 Q82 394 84 380 Q88 394 92 390 Q96 372 92 354 Q82 346 70 350 Z"],
};

/** Non-interactive anatomical detail lines (left half). */
const FRONT_DETAIL = [
  "M83 147 L98 146",
  "M81 167 L98 166",
  "M81 187 L98 187",
  "M72 124 Q86 128 98 122",
  "M74 330 Q80 336 86 330",
];
const BACK_DETAIL = ["M80 340 L80 300", "M76 400 L80 386", "M98 212 L98 252"];

/** Muscles small enough to need an enlarged invisible hit area. */
export const SMALL_MUSCLES: ReadonlySet<Muscle> = new Set<Muscle>([
  "neck",
  "traps",
  "side_delts",
  "front_delts",
  "rear_delts",
  "rotator_cuff",
  "brachialis",
  "serratus",
  "hip_flexors",
  "abductors",
  "tibialis",
  "lower_back",
  "upper_back",
]);

function mirrored(src: Partial<Record<Muscle, string[]>>): Partial<Record<Muscle, string[]>> {
  const out: Partial<Record<Muscle, string[]>> = {};
  for (const [m, ds] of Object.entries(src) as [Muscle, string[]][]) out[m] = ds.flatMap(both);
  return out;
}

export const MUSCLE_PATHS: Record<View, Partial<Record<Muscle, string[]>>> = {
  front: mirrored(FRONT),
  back: mirrored(BACK),
};

export const DETAIL_PATHS: Record<View, string[]> = {
  front: FRONT_DETAIL.flatMap(both),
  back: BACK_DETAIL.flatMap(both),
};

/**
 * Paint order: larger regions first, so smaller overlapping regions
 * (front delts over side delts, biceps over brachialis) sit on top.
 */
export const PAINT_ORDER: Muscle[] = [
  "side_delts",
  "traps",
  "lats",
  "upper_back",
  "chest",
  "abs",
  "obliques",
  "serratus",
  "front_delts",
  "rear_delts",
  "rotator_cuff",
  "lower_back",
  "brachialis",
  "biceps",
  "triceps",
  "forearms",
  "abductors",
  "glutes",
  "hip_flexors",
  "adductors",
  "quads",
  "hamstrings",
  "calves",
  "tibialis",
  "neck",
];
