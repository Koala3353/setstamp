// On-device exercise search: inverted index + sorted vocabulary (prefix ranges) built once,
// then a per-keystroke scorer with lexicon-aware query intent, typo tolerance, tiered
// ranking, personalization nudges and sparse-result suggestions. No runtime dependencies.

import { EQUIPMENT, MUSCLES, MUSCLE_INFO, type Equipment, type Muscle, type Pattern, type Tracking } from "../shared/domain";
import { damerauLevenshtein, maxEditsFor } from "./fuzzy";
import {
  LEXICON,
  LEXICON_FUZZY_KEYS,
  LEXICON_MAX_WORDS,
  lexiconHasAttributes,
  type LexiconEntry,
} from "./lexicon";
import { normalizeTokens, PARTICLE_PREFIXES } from "./normalize";

export { normalizeTokens, normalizeText, stem } from "./normalize";
export { damerauLevenshtein } from "./fuzzy";
export { LEXICON, type LexiconEntry } from "./lexicon";

// ---------------------------------------------------------------------------------------------
// Public types

export type SearchableExercise = {
  exId: string;
  name: string;
  aliases: string[];
  equipment: Equipment[];
  primary: Muscle[];
  secondary: Muscle[];
  pattern: Pattern;
  family: string | null;
  /** Curated 1–5 (editorial), not measured usage. Custom exercises may omit it. */
  commonness?: number;
  tracking: Tracking;
  custom?: boolean;
};

export type SearchFilters = {
  equipment?: Equipment[];
  muscles?: Muscle[];
  patterns?: Pattern[];
  tracking?: Tracking[];
};

export type PersonalSignals = {
  /** exId → last-used timestamp (ms). */
  recent?: Record<string, number>;
  /** exId → times logged (measured usage, kept distinct from curated commonness). */
  frequency?: Record<string, number>;
  favorites?: Set<string>;
  /** Boosts exercises the user can do with what they have; never hides others. */
  availableEquipment?: Equipment[];
  /** Muscles already trained in the current workout. */
  sessionMuscles?: Muscle[];
};

export type SearchOptions = {
  filters?: SearchFilters;
  personal?: PersonalSignals;
  /** Default 50. */
  limit?: number;
  /** Clock for recency decay (tests). Default Date.now(). */
  now?: number;
};

export type MatchKind = "exact" | "alias" | "prefix" | "token" | "fuzzy" | "attribute" | "browse";

export type SearchResult<T extends SearchableExercise = SearchableExercise> = {
  exercise: T;
  /** Monotonic with result order (tier dominates). */
  score: number;
  matchKind: MatchKind;
  reasons: string[];
};

export type SuggestionApply = { query?: string; filters?: SearchFilters; exId?: string };

export type Suggestion = {
  kind: "relax_filter" | "did_you_mean" | "related";
  label: string;
  apply: SuggestionApply;
};

export type Interpretation = {
  text: string[];
  equipment: Equipment[];
  muscles: Muscle[];
  noEquipment: boolean;
};

export type SearchResponse<T extends SearchableExercise = SearchableExercise> = {
  results: SearchResult<T>[];
  /** Matches before `limit` was applied. */
  total: number;
  interpreted: Interpretation;
  suggestions: Suggestion[];
};

// ---------------------------------------------------------------------------------------------
// Index

type Doc<T> = {
  ex: T;
  nameTokens: string[];
  nameKey: string;
  aliasTokens: string[][];
  /** Name and aliases with spaces removed, for did-you-mean. */
  squashes: string[];
  equip: Set<Equipment>;
  primary: Set<Muscle>;
  secondary: Set<Muscle>;
  bodyweightOnly: boolean;
  /** Bitmasks over MUSCLES / EQUIPMENT for fast attribute checks. */
  pMask: number;
  sMask: number;
  eMask: number;
  /** Equipment other than bodyweight. */
  needs: Equipment[];
  commonness: number;
  /** Alphabetical position, for cheap tie-breaks. */
  nameRank: number;
};

type Posting = { nameDocs: number[]; nameMasks: number[]; aliasDocs: number[] };

export type SearchIndex<T extends SearchableExercise = SearchableExercise> = {
  readonly size: number;
  /** @internal */ docs: Doc<T>[];
  /** @internal */ vocab: Map<string, Posting>;
  /** @internal */ sorted: string[];
  /** @internal */ byLen: string[][];
  /** @internal */ nameKeys: Map<string, number[]>;
  /** @internal */ aliasKeys: Map<string, Array<{ doc: number; alias: string }>>;
};

export function buildSearchIndex<T extends SearchableExercise>(exercises: readonly T[]): SearchIndex<T> {
  const docs: Doc<T>[] = [];
  const vocab = new Map<string, Posting>();
  const nameKeys = new Map<string, number[]>();
  const aliasKeys = new Map<string, Array<{ doc: number; alias: string }>>();

  const posting = (tok: string): Posting => {
    let p = vocab.get(tok);
    if (!p) {
      p = { nameDocs: [], nameMasks: [], aliasDocs: [] };
      vocab.set(tok, p);
    }
    return p;
  };

  exercises.forEach((ex, d) => {
    const nameTokens = normalizeTokens(ex.name);
    const nameKey = nameTokens.join(" ");
    nameTokens.forEach((tok, pos) => {
      const p = posting(tok);
      const last = p.nameDocs.length - 1;
      const bit = 1 << Math.min(pos, 30);
      if (last >= 0 && p.nameDocs[last] === d) p.nameMasks[last] |= bit;
      else {
        p.nameDocs.push(d);
        p.nameMasks.push(bit);
      }
    });
    push(nameKeys, nameKey, d);
    const squashes = [nameTokens.join("")];
    const aliasTokens: string[][] = [];
    for (const alias of ex.aliases) {
      const toks = normalizeTokens(alias);
      if (!toks.length) continue;
      aliasTokens.push(toks);
      const key = toks.join(" ");
      push(aliasKeys, key, { doc: d, alias });
      squashes.push(toks.join(""));
      for (const tok of toks) {
        const p = posting(tok);
        if (p.aliasDocs[p.aliasDocs.length - 1] !== d) p.aliasDocs.push(d);
      }
    }
    const equip = new Set(ex.equipment);
    docs.push({
      ex,
      nameTokens,
      nameKey,
      aliasTokens,
      squashes,
      equip,
      primary: new Set(ex.primary),
      secondary: new Set(ex.secondary),
      bodyweightOnly: ex.equipment.length > 0 && ex.equipment.every((e) => e === "bodyweight"),
      pMask: muscleMask(ex.primary),
      sMask: muscleMask(ex.secondary),
      eMask: equipMask(ex.equipment),
      needs: ex.equipment.filter((e) => e !== "bodyweight"),
      commonness: ex.commonness ?? 2,
      nameRank: 0,
    });
  });
  docs
    .map((doc, d) => ({ d, name: doc.ex.name.toLowerCase() }))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    .forEach((x, rank) => (docs[x.d].nameRank = rank));

  const sorted = [...vocab.keys()].sort();
  const byLen: string[][] = [];
  for (const tok of sorted) (byLen[tok.length] ??= []).push(tok);
  return { size: docs.length, docs, vocab, sorted, byLen, nameKeys, aliasKeys };
}

const MUSCLE_BIT = new Map(MUSCLES.map((m, i) => [m, 1 << i]));
const EQUIP_BIT = new Map(EQUIPMENT.map((e, i) => [e, 1 << i]));
const muscleMask = (ms: readonly Muscle[]) => ms.reduce((acc, m) => acc | (MUSCLE_BIT.get(m) ?? 0), 0);
const equipMask = (es: readonly Equipment[]) => es.reduce((acc, e) => acc | (EQUIP_BIT.get(e) ?? 0), 0);

function push<K, V>(map: Map<K, V[]>, key: K, value: V) {
  const arr = map.get(key);
  if (arr) arr.push(value);
  else map.set(key, [value]);
}

// ---------------------------------------------------------------------------------------------
// Query parsing

/** literal: the user's own words (prefix allowed); fuzzy: typo tolerance allowed. */
type Alt = { seq: string[]; literal: boolean; fuzzy: boolean };

type Term = {
  /** What the user meant, for `interpreted.text`. */
  display: string;
  alts: Alt[];
  lex: LexiconEntry | null;
  hasAttr: boolean;
  /** Set when the lexicon entry was reached through a typo. */
  lexTypo?: string;
};

function parseQuery(ix: SearchIndex<SearchableExercise>, tokens: string[]): Term[] {
  const terms: Term[] = [];
  let i = 0;
  while (i < tokens.length) {
    let took = 0;
    for (let len = Math.min(LEXICON_MAX_WORDS, tokens.length - i); len >= 1; len--) {
      const phrase = tokens.slice(i, i + len).join(" ");
      const lex = LEXICON.get(phrase);
      if (!lex) continue;
      terms.push(termFromLex(phrase, lex));
      took = len;
      break;
    }
    if (took) {
      i += took;
      continue;
    }
    const tok = tokens[i];
    i++;
    // A word that is not in the catalog vocabulary may be a typo of a lexicon word ("shoudlers").
    // Catalog words win: "hammr" is hammer, not hammy.
    const k = maxEditsFor(tok.length);
    if (tok.length >= 5 && !ix.vocab.has(tok) && !hasPrefix(ix.sorted, tok) && !hasFuzzyWord(ix, tok, k)) {
      let best: string | null = null;
      let bestD = k + 1;
      for (const key of LEXICON_FUZZY_KEYS) {
        const d = damerauLevenshtein(tok, key, k);
        if (d < bestD) {
          bestD = d;
          best = key;
        }
      }
      if (best) {
        const t = termFromLex(best, LEXICON.get(best)!);
        t.lexTypo = `${tok}→${best}`;
        terms.push(t);
        continue;
      }
    }
    terms.push({ display: tok, alts: [{ seq: [tok], literal: true, fuzzy: true }], lex: null, hasAttr: false });
  }

  // "pull u" → the user is mid-way through "pull up"/"pullup".
  const n = terms.length;
  if (n >= 2) {
    const last = terms[n - 1];
    const prev = terms[n - 2];
    const lastTok = last.alts[0]?.seq[0];
    const prevTok = prev.alts[0]?.seq[0];
    if (!last.lex && !prev.lex && lastTok && prevTok && PARTICLE_PREFIXES.has(lastTok)) {
      terms.splice(n - 2, 2, {
        display: `${prevTok} ${lastTok}`,
        alts: [
          { seq: [prevTok + lastTok], literal: true, fuzzy: false },
          { seq: [prevTok, lastTok], literal: true, fuzzy: false },
        ],
        lex: null,
        hasAttr: false,
      });
    }
  }
  return terms;
}

function termFromLex(phrase: string, lex: LexiconEntry): Term {
  const alts: Alt[] = [];
  // Lexicon words are known vocabulary: prefix-matched while typing, never typo-corrected.
  if (!lex.attrOnly) alts.push({ seq: phrase.split(" "), literal: true, fuzzy: false });
  for (const e of lex.expand ?? []) {
    const seq = normalizeTokens(e);
    if (seq.length && seq.join(" ") !== phrase) alts.push({ seq, literal: false, fuzzy: false });
  }
  return { display: lex.expand?.[0] ?? phrase, alts, lex, hasAttr: lexiconHasAttributes(lex) };
}

function hasFuzzyWord(ix: SearchIndex<SearchableExercise>, tok: string, k: number): boolean {
  for (let len = tok.length - k; len <= tok.length + k; len++) {
    for (const s of ix.byLen[len] ?? []) if (damerauLevenshtein(tok, s, k) <= k) return true;
  }
  return false;
}

function lowerBound(arr: string[], target: string): number {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (arr[mid] < target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function hasPrefix(sorted: string[], tok: string): boolean {
  const k = lowerBound(sorted, tok);
  return k < sorted.length && sorted[k].startsWith(tok);
}

// ---------------------------------------------------------------------------------------------
// Matching

// Per-term categories, per document.
const NONE = 0;
const TEXT = 1; // name/alias word: exact or prefix
const FUZZY = 2; // name/alias word within edit budget
const ATTR_P = 3; // equipment / no-equipment / primary muscle
const ATTR_S = 4; // secondary muscle
const WEAK = 5; // the word appears in the name but contradicts the attribute ("chest" in Chest-Supported Row)

type TextEval = {
  w: Float32Array;
  fuzzy: Uint8Array;
  mask: Int32Array;
  notes: Map<number, string> | null;
};

type TermEval = { cat: Uint8Array; w: Float32Array; mask: Int32Array; notes: Map<number, string> | null };

function newTextEval(n: number): TextEval {
  return {
    w: new Float32Array(n),
    fuzzy: new Uint8Array(n),
    mask: new Int32Array(n),
    notes: null,
  };
}

function applyPosting(
  r: TextEval,
  p: Posting,
  nameW: number,
  aliasW: number,
  fuzzy: number,
  note: string | null,
) {
  const { nameDocs, nameMasks, aliasDocs } = p;
  for (let k = 0; k < nameDocs.length; k++) {
    const d = nameDocs[k];
    r.mask[d] |= nameMasks[k];
    if (nameW > r.w[d]) {
      r.w[d] = nameW;
      r.fuzzy[d] = fuzzy;
      if (note) (r.notes ??= new Map()).set(d, note);
    }
  }
  for (let k = 0; k < aliasDocs.length; k++) {
    const d = aliasDocs[k];
    if (aliasW > r.w[d]) {
      r.w[d] = aliasW;
      r.fuzzy[d] = fuzzy;
      if (note) (r.notes ??= new Map()).set(d, note);
    }
  }
}

function evalToken(ix: SearchIndex<SearchableExercise>, tok: string, literal: boolean, fuzzy: boolean): TextEval {
  const r = newTextEval(ix.size);
  const exact = ix.vocab.get(tok);
  if (exact) applyPosting(r, exact, 3, 2.5, 0, null);
  if (!literal) return r;

  // Prefix on every word, not just the last.
  let anyPrefix = false;
  for (let k = lowerBound(ix.sorted, tok); k < ix.sorted.length; k++) {
    const s = ix.sorted[k];
    if (!s.startsWith(tok)) break;
    if (s === tok) continue;
    anyPrefix = true;
    const ratio = tok.length / s.length;
    applyPosting(r, ix.vocab.get(s)!, 2 + ratio * 0.8, 1.5 + ratio * 0.5, 0, null);
  }

  const k = maxEditsFor(tok.length);
  if (exact || k === 0 || !fuzzy) return r;
  // Whole-word typos.
  for (let len = tok.length - k; len <= tok.length + k; len++) {
    const bucket = ix.byLen[len];
    if (!bucket) continue;
    for (const s of bucket) {
      const d = damerauLevenshtein(tok, s, k);
      if (d <= k) applyPosting(r, ix.vocab.get(s)!, 1.6 - 0.3 * d, 1.1 - 0.3 * d, 1, `${tok}→${s}`);
    }
  }
  // Typo in a word that is still being typed ("romanai" → romanian).
  if (!anyPrefix && tok.length >= 5) {
    for (let len = tok.length + 1; len < ix.byLen.length; len++) {
      const bucket = ix.byLen[len];
      if (!bucket) continue;
      const t0 = tok.charCodeAt(0);
      const t1 = tok.charCodeAt(1);
      for (const s of bucket) {
        if (s.charCodeAt(0) !== t0 && s.charCodeAt(1) !== t1 && s.charCodeAt(0) !== t1) continue; // cheap gate for ≤1 edit
        if (damerauLevenshtein(tok, s, 1, tok.length) <= 1) {
          applyPosting(r, ix.vocab.get(s)!, 1.2, 0.8, 1, `${tok}→${s}`);
        }
      }
    }
  }
  return r;
}

/** All words of `seq` must match the same document. */
function evalSeq(ix: SearchIndex<SearchableExercise>, alt: Alt, cache: Map<string, TextEval>): TextEval {
  const parts = alt.seq.map((tok) => {
    const key = `${alt.literal ? "L" : "E"}${alt.fuzzy ? "F" : ""}:${tok}`;
    let r = cache.get(key);
    if (!r) {
      r = evalToken(ix, tok, alt.literal, alt.fuzzy);
      cache.set(key, r);
    }
    return r;
  });
  if (parts.length === 1) return parts[0];
  const n = ix.size;
  const out = newTextEval(n);
  for (let d = 0; d < n; d++) {
    let sum = 0;
    let fz = 0;
    let mask = 0;
    let ok = true;
    for (const p of parts) {
      if (p.w[d] <= 0) {
        ok = false;
        break;
      }
      sum += p.w[d];
      fz |= p.fuzzy[d];
      mask |= p.mask[d];
    }
    if (!ok) continue;
    out.w[d] = sum / parts.length;
    out.fuzzy[d] = fz;
    out.mask[d] = mask;
    for (const p of parts) {
      const note = p.notes?.get(d);
      if (note) (out.notes ??= new Map()).set(d, note);
    }
  }
  return out;
}

function evalTerm(ix: SearchIndex<SearchableExercise>, term: Term, cache: Map<string, TextEval>): TermEval {
  const n = ix.size;
  const cat = new Uint8Array(n);
  const w = new Float32Array(n);
  const mask = new Int32Array(n);
  let notes: Map<number, string> | null = null;

  // Best text match over the alternatives.
  const tw = new Float32Array(n);
  const tfz = new Uint8Array(n);
  for (const alt of term.alts) {
    const r = evalSeq(ix, alt, cache);
    for (let d = 0; d < n; d++) {
      if (r.w[d] <= 0) continue;
      mask[d] |= r.mask[d];
      if (r.w[d] > tw[d] || (r.w[d] === tw[d] && tfz[d] && !r.fuzzy[d])) {
        tw[d] = r.w[d];
        tfz[d] = r.fuzzy[d];
        const note = r.notes?.get(d);
        if (note) (notes ??= new Map()).set(d, note);
        else notes?.delete(d);
      }
    }
  }

  const lex = term.lex;
  if (!lex || !term.hasAttr) {
    for (let d = 0; d < n; d++) {
      if (tw[d] <= 0) continue;
      cat[d] = tfz[d] ? FUZZY : TEXT;
      w[d] = tw[d];
    }
    return { cat, w, mask, notes };
  }

  const fuzzyLex = term.lexTypo != null;
  const em = lex.equipment ? equipMask(lex.equipment) : 0;
  const mm = lex.muscles ? muscleMask(lex.muscles) : 0;
  const noEq = !!lex.noEquipment;
  const docs = ix.docs;
  for (let d = 0; d < n; d++) {
    const doc = docs[d];
    let a = NONE;
    if ((noEq && doc.bodyweightOnly) || doc.eMask & em || doc.pMask & mm) a = ATTR_P;
    else if (doc.sMask & mm) a = ATTR_S;
    if (a !== NONE) {
      // The attribute is the evidence; the same word in the name ("Leg" in Leg Lift) must not
      // also earn name coverage / start-of-name credit, or wording beats curated commonness.
      mask[d] = 0;
    }
    if (a === ATTR_P) {
      cat[d] = fuzzyLex ? FUZZY : ATTR_P;
      w[d] = 3 + (tw[d] > 0 ? 0.5 : 0);
    } else if (a === ATTR_S) {
      cat[d] = fuzzyLex ? FUZZY : ATTR_S;
      w[d] = 1 + (tw[d] > 0 ? 0.25 : 0);
    } else if (tw[d] > 0) {
      // Name contains the word but the exercise doesn't use/train it: weak evidence, whether a
      // whole word ("chest" in Chest-Supported Row) or a longer word that merely starts with a
      // complete lexicon word ("ab" in Abduction, "back" in Backward, "bi" in Bird-Dog).
      cat[d] = WEAK;
      w[d] = 0.5;
      mask[d] = 0;
    }
    if (fuzzyLex && cat[d] === FUZZY && !notes?.has(d)) (notes ??= new Map()).set(d, term.lexTypo!);
  }
  return { cat, w, mask, notes };
}

// ---------------------------------------------------------------------------------------------
// Filters and personalization

function filterPass(ix: SearchIndex<SearchableExercise>, f: SearchFilters | undefined): Uint8Array {
  const n = ix.size;
  const pass = new Uint8Array(n).fill(1);
  if (!f) return pass;
  const equipment = f.equipment?.length ? equipMask(f.equipment) : 0;
  const muscles = f.muscles?.length ? muscleMask(f.muscles) : 0;
  const patterns = f.patterns?.length ? new Set(f.patterns) : null;
  const tracking = f.tracking?.length ? new Set(f.tracking) : null;
  for (let d = 0; d < n; d++) {
    const doc = ix.docs[d];
    if (patterns && !patterns.has(doc.ex.pattern)) pass[d] = 0;
    else if (tracking && !tracking.has(doc.ex.tracking)) pass[d] = 0;
    else if (equipment && !(doc.eMask & equipment)) pass[d] = 0;
    else if (muscles && !((doc.pMask | doc.sMask) & muscles)) pass[d] = 0;
  }
  return pass;
}

type Personal = {
  p: PersonalSignals;
  now: number;
  available: Set<Equipment> | null;
  session: Set<Muscle> | null;
};

const DAY = 86_400_000;

function personalBoost(doc: Doc<SearchableExercise>, P: Personal | null, reasons?: string[]): number {
  if (!P) return 0;
  const id = doc.ex.exId;
  const { p } = P;
  let s = 0;
  if (p.favorites?.has(id)) {
    s += 2.5;
    reasons?.push("favorite");
  }
  const t = p.recent?.[id];
  if (t != null) {
    const days = Math.max(0, (P.now - t) / DAY);
    s += 2 * Math.exp(-days / 14);
    reasons?.push(`measured: used ${days < 1 ? "today" : `${Math.round(days)}d ago`}`);
  }
  const f = p.frequency?.[id];
  if (f && f > 0) {
    s += Math.min(2, Math.log2(1 + f) * 0.5);
    reasons?.push(`measured: logged ${f}×`);
  }
  if (P.available) {
    if (doc.needs.every((e) => P.available!.has(e))) {
      s += 0.8;
      reasons?.push("uses equipment you have");
    }
  }
  if (P.session && doc.ex.primary.length && !doc.ex.primary.some((m) => P.session!.has(m))) {
    s += 0.6;
    reasons?.push("trains muscles not yet hit this session");
  }
  return s;
}

function commonnessReason(doc: Doc<SearchableExercise>, reasons: string[]) {
  if (doc.ex.custom) reasons.push("your custom exercise");
  else if (doc.commonness >= 4) reasons.push(`curated commonness ${doc.commonness}/5`);
}

// ---------------------------------------------------------------------------------------------
// Search

const TIER_RANK: Record<MatchKind, number> = {
  exact: 6,
  alias: 5,
  prefix: 4,
  token: 3,
  fuzzy: 2,
  attribute: 1,
  browse: 0,
};

type Ranked = { d: number; kind: MatchKind; sub: number; score: number; key: number; alias?: string };

type RunOutput = {
  ranked: Ranked[];
  terms: Term[];
  evals: TermEval[];
  tokens: string[];
};

/** Tier, then sub-tier (fewer secondary-only/weak hits), then score, then curated commonness. */
function sortKey(kind: MatchKind, sub: number, score: number, commonness: number): number {
  return TIER_RANK[kind] * 1e7 - Math.min(sub, 99) * 1e5 + Math.max(-999, Math.min(score, 999)) * 100 + commonness;
}

function rank(ranked: Ranked[], docs: Doc<SearchableExercise>[]) {
  ranked.sort((a, b) => b.key - a.key || docs[a.d].nameRank - docs[b.d].nameRank);
}

function makePersonal(opts: SearchOptions | undefined): Personal | null {
  const p = opts?.personal;
  if (!p) return null;
  return {
    p,
    now: opts?.now ?? Date.now(),
    available: p.availableEquipment?.length ? new Set(p.availableEquipment) : null,
    session: p.sessionMuscles?.length ? new Set(p.sessionMuscles) : null,
  };
}

function run(ix: SearchIndex<SearchableExercise>, query: string, opts: SearchOptions | undefined): RunOutput {
  const docs = ix.docs;
  const n = ix.size;
  const pass = filterPass(ix, opts?.filters);
  const P = makePersonal(opts);
  const tokens = normalizeTokens(query);
  const terms = parseQuery(ix, tokens);
  const ranked: Ranked[] = [];

  if (!terms.length) {
    // Browse: favorites, then recent, then curated commonness.
    for (let d = 0; d < n; d++) {
      if (!pass[d]) continue;
      const id = docs[d].ex.exId;
      const fav = P?.p.favorites?.has(id) ? 1 : 0;
      const recent = P?.p.recent?.[id];
      const sub = fav ? 0 : recent != null ? 1 : 2;
      const recency = recent != null && P ? 3 * Math.exp(-Math.max(0, P.now - recent) / DAY / 14) : 0;
      const score = recency + docs[d].commonness * 0.6 + personalBoost(docs[d], P) * 0.3;
      ranked.push({ d, kind: "browse", sub, score, key: sortKey("browse", sub, score, docs[d].commonness) });
    }
    rank(ranked, docs);
    return { ranked, terms, evals: [], tokens };
  }

  // Exact / alias tiers: whole query equals a name or alias (after expansions).
  const tier = new Uint8Array(n); // 6 exact, 5 alias
  const aliasHit = new Map<number, string>();
  for (const key of queryKeys(terms)) {
    for (const d of ix.nameKeys.get(key) ?? []) tier[d] = 6;
    for (const { doc, alias } of ix.aliasKeys.get(key) ?? []) {
      if (tier[doc] < 5) {
        tier[doc] = 5;
        aliasHit.set(doc, alias);
      }
    }
  }

  const cache = new Map<string, TextEval>();
  const evals = terms.map((t) => evalTerm(ix, t, cache));
  // Query words for alias coverage ("bench" covers half of the alias "Bench Press"), per term:
  // a term that matched a document as an attribute earns no name/alias wording credit there.
  const termWords = terms.map((t) => t.alts.flatMap((a) => a.seq));
  const firstWords = terms[0].alts.map((a) => a.seq[0]);
  const qWords: string[] = [];

  for (let d = 0; d < n; d++) {
    if (!pass[d]) continue;
    const doc = docs[d];
    let kind: MatchKind;
    let sub = 0;
    let rel = 0;
    let mask = 0;
    if (tier[d]) {
      kind = tier[d] === 6 ? "exact" : "alias";
      rel = 10;
      mask = -1;
    } else {
      let ok = true;
      let nText = 0;
      let nFuzzy = 0;
      let nAttr = 0;
      for (const e of evals) {
        const c = e.cat[d];
        if (c === NONE) {
          ok = false;
          break;
        }
        rel += e.w[d];
        mask |= e.mask[d];
        if (c === TEXT) nText++;
        else if (c === FUZZY) nFuzzy++;
        else {
          nAttr++;
          if (c === ATTR_S) sub++;
          else if (c === WEAK) sub += 2;
        }
      }
      if (!ok) continue;
      if (nFuzzy) kind = "fuzzy";
      else if (nText === evals.length) kind = "prefix";
      else if (nText > 0) kind = "token";
      else kind = "attribute";
      if (nAttr === 0) sub = 0;
    }
    // Name coverage: prefer "Bench Press" over "Incline Dumbbell Bench Press" for "bench".
    const nt = doc.nameTokens.length || 1;
    const covered = mask === -1 ? nt : popcount(mask & ((1 << Math.min(nt, 31)) - 1));
    let coverage = covered / nt;
    let startBonus = mask & 1 ? 1 : 0;
    if (mask !== -1 && doc.aliasTokens.length) {
      qWords.length = 0;
      for (let i = 0; i < evals.length; i++) {
        const c = evals[i].cat[d];
        if (c === TEXT || c === FUZZY) for (const w of termWords[i]) qWords.push(w);
      }
      const firstIsText = evals[0].cat[d] === TEXT || evals[0].cat[d] === FUZZY;
      for (const a of doc.aliasTokens) {
        let c = 0;
        for (const t of a) if (startsWithAny(t, qWords)) c++;
        coverage = Math.max(coverage, (0.9 * c) / a.length);
        if (!startBonus && firstIsText && startsWithAny(a[0], firstWords)) startBonus = 0.9;
      }
    }
    // Starting the name with the query word is a nudge, not a trump card over curated
    // commonness: "squat" should show Front Squat before Squat Hold.
    const score = rel + coverage * 2 + startBonus * 0.5 + (doc.commonness - 3) * 0.6 + personalBoost(doc, P);
    ranked.push({ d, kind, sub, score, key: sortKey(kind, sub, score, doc.commonness), alias: aliasHit.get(d) });
  }
  rank(ranked, docs);
  return { ranked, terms, evals, tokens };
}

function startsWithAny(word: string, prefixes: string[]): boolean {
  for (let i = 0; i < prefixes.length; i++) if (word.startsWith(prefixes[i])) return true;
  return false;
}

function popcount(x: number): number {
  x = x - ((x >>> 1) & 0x55555555);
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  return (((x + (x >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}

/** Whole-query keys for exact/alias tiers: each term's literal or expansion, capped. */
function queryKeys(terms: Term[]): string[] {
  let keys: string[] = [""];
  for (const t of terms) {
    if (!t.alts.length) return []; // e.g. "at home" can't be part of a name
    const next: string[] = [];
    for (const k of keys) for (const a of t.alts) next.push(k ? `${k} ${a.seq.join(" ")}` : a.seq.join(" "));
    keys = next.slice(0, 32);
  }
  return keys;
}

function reasonsFor(
  ix: SearchIndex<SearchableExercise>,
  r: Ranked,
  out: RunOutput,
  P: Personal | null,
): string[] {
  const doc = ix.docs[r.d];
  const reasons: string[] = [];
  if (r.kind === "exact") reasons.push("exact name");
  else if (r.kind === "alias") reasons.push(`alias: ${r.alias}`);
  else if (r.kind !== "browse") {
    out.terms.forEach((t, i) => {
      const e = out.evals[i];
      const c = e.cat[r.d];
      const note = e.notes?.get(r.d);
      if (c === TEXT) reasons.push(`name matches "${t.display}"`);
      else if (c === FUZZY) reasons.push(`typo: ${note ?? t.display}`);
      else if (c === WEAK) reasons.push(`name mentions "${t.display}"`);
      else if (c === ATTR_P || c === ATTR_S) {
        const lex = t.lex!;
        if (lex.noEquipment) reasons.push("no equipment needed");
        else if (lex.equipment) reasons.push(`equipment: ${lex.equipment.join(", ")}`);
        else if (lex.muscles) {
          const which = (c === ATTR_P ? doc.ex.primary : doc.ex.secondary).filter((m) => lex.muscles!.includes(m));
          reasons.push(`${c === ATTR_P ? "primary" : "secondary"}: ${which.map((m) => MUSCLE_INFO[m].label).join(", ")}`);
        }
      }
    });
  }
  personalBoost(doc, P, reasons);
  commonnessReason(doc, reasons);
  return reasons;
}

function interpret(out: RunOutput): Interpretation {
  const res: Interpretation = { text: [], equipment: [], muscles: [], noEquipment: false };
  const top = out.ranked[0];
  const wholeText = top && (top.kind === "exact" || top.kind === "alias");
  out.terms.forEach((t, i) => {
    const c = top && !wholeText ? out.evals[i].cat[top.d] : NONE;
    const asAttr = t.hasAttr && !wholeText && (top ? c === ATTR_P || c === ATTR_S || (c === FUZZY && !!t.lexTypo) : true);
    if (!asAttr) {
      res.text.push(t.display);
      return;
    }
    const lex = t.lex!;
    if (lex.noEquipment) res.noEquipment = true;
    for (const e of lex.equipment ?? []) if (!res.equipment.includes(e)) res.equipment.push(e);
    for (const m of lex.muscles ?? []) if (!res.muscles.includes(m)) res.muscles.push(m);
  });
  return res;
}

// ---------------------------------------------------------------------------------------------
// Suggestions (only when results are sparse)

const FILTER_LABEL: Record<keyof SearchFilters, string> = {
  equipment: "equipment",
  muscles: "muscle",
  patterns: "movement",
  tracking: "tracking type",
};

const HIST = new Int16Array(128);

function histogram(q: string): Int16Array {
  const h = new Int16Array(128);
  for (let i = 0; i < q.length; i++) h[q.charCodeAt(i) & 127]++;
  return h;
}

/** Lower bound on edit distance between q and s[0..len): each edit moves letter counts by ≤ 2. */
function histogramBound(qHist: Int16Array, s: string, len: number): number {
  HIST.set(qHist);
  let l1 = 0;
  for (let i = 0; i < qHist.length; i++) l1 += qHist[i];
  for (let i = 0; i < len; i++) {
    const c = s.charCodeAt(i) & 127;
    l1 += HIST[c] > 0 ? -1 : 1;
    HIST[c]--;
  }
  return Math.ceil(l1 / 2);
}

function suggest(
  ix: SearchIndex<SearchableExercise>,
  query: string,
  opts: SearchOptions | undefined,
  out: RunOutput,
): Suggestion[] {
  const suggestions: Suggestion[] = [];
  const total = out.ranked.length;
  const filters = opts?.filters;

  // 1. Relax each active filter, with the resulting count.
  if (filters) {
    for (const key of Object.keys(FILTER_LABEL) as Array<keyof SearchFilters>) {
      if (!filters[key]?.length) continue;
      const relaxed: SearchFilters = { ...filters };
      delete relaxed[key];
      const count = run(ix, query, { ...opts, filters: relaxed }).ranked.length;
      if (count > total) {
        suggestions.push({
          kind: "relax_filter",
          label: `Remove ${FILTER_LABEL[key]} filter (${count} result${count === 1 ? "" : "s"})`,
          apply: { query, filters: relaxed },
        });
      }
    }
  }

  const pass = filterPass(ix, filters);
  const shown = new Set(out.ranked.map((r) => r.d));

  // 2. Did you mean: closest names/aliases to the whole query.
  const q = out.tokens.join("");
  const dym: Array<{ d: number; dist: number }> = [];
  if (q.length >= 3) {
    const cap = Math.min(3, Math.max(2, Math.floor(q.length / 3)));
    const q0 = q.charCodeAt(0);
    const q1 = q.charCodeAt(1);
    const qHist = histogram(q);
    ix.docs.forEach((doc, d) => {
      if (shown.has(d) || !pass[d]) return;
      let best = cap + 1;
      for (const s of doc.squashes) {
        // Cheap gate: people rarely get both of the first two letters wrong.
        if (s.charCodeAt(0) !== q0 && s.charCodeAt(1) !== q1 && s.charCodeAt(0) !== q1) continue;
        if (s.length - q.length <= cap && histogramBound(qHist, s, s.length) <= cap) {
          best = Math.min(best, damerauLevenshtein(q, s, cap));
        }
        if (s.length > q.length && histogramBound(qHist, s, q.length) <= cap) {
          best = Math.min(best, damerauLevenshtein(q, s, cap, q.length) + 0.5);
        }
      }
      if (best <= cap) dym.push({ d, dist: best });
    });
    dym.sort((a, b) => a.dist - b.dist || ix.docs[b.d].commonness - ix.docs[a.d].commonness);
    for (const { d } of dym.slice(0, 3)) {
      const name = ix.docs[d].ex.name;
      suggestions.push({ kind: "did_you_mean", label: `Did you mean ${name}?`, apply: { query: name, exId: ix.docs[d].ex.exId } });
    }
  }

  // 3. Related: same family, then same movement pattern, as the best (partial) match.
  let seed = out.ranked[0]?.d ?? dym[0]?.d;
  if (seed == null && out.evals.length) {
    let bestHits = 0;
    for (let d = 0; d < ix.size; d++) {
      let hits = 0;
      for (const e of out.evals) if (e.cat[d] !== NONE) hits++;
      if (hits > bestHits || (hits === bestHits && hits > 0 && ix.docs[d].commonness > ix.docs[seed!].commonness)) {
        bestHits = hits;
        seed = d;
      }
    }
  }
  if (seed != null) {
    const s = ix.docs[seed];
    const related: Array<{ d: number; rank: number }> = [];
    ix.docs.forEach((doc, d) => {
      if (!pass[d] || shown.has(d)) return;
      if (d === seed) related.push({ d, rank: 0 });
      else if (s.ex.family && doc.ex.family === s.ex.family) related.push({ d, rank: 1 });
      else if (doc.ex.pattern === s.ex.pattern) related.push({ d, rank: 2 });
    });
    related.sort((a, b) => a.rank - b.rank || ix.docs[b.d].commonness - ix.docs[a.d].commonness);
    const dymIds = new Set(dym.slice(0, 3).map((x) => x.d));
    for (const { d } of related.filter((r) => !dymIds.has(r.d)).slice(0, 3)) {
      const ex = ix.docs[d].ex;
      suggestions.push({ kind: "related", label: `Related: ${ex.name}`, apply: { query: ex.name, exId: ex.exId } });
    }
  }
  return suggestions;
}

// ---------------------------------------------------------------------------------------------

export function search<T extends SearchableExercise>(
  index: SearchIndex<T>,
  query: string,
  opts?: SearchOptions,
): SearchResponse<T> {
  const ix = index as unknown as SearchIndex<SearchableExercise>;
  const out = run(ix, query, opts);
  const P = makePersonal(opts);
  const limit = opts?.limit ?? 50;
  const results = out.ranked.slice(0, limit).map((r) => ({
    exercise: index.docs[r.d].ex,
    score: Math.round(r.key) / 100,
    matchKind: r.kind,
    reasons: reasonsFor(ix, r, out, P),
  }));
  const suggestions = out.ranked.length < 3 && (out.terms.length || opts?.filters) ? suggest(ix, query, opts, out) : [];
  return { results, total: out.ranked.length, interpreted: interpret(out), suggestions };
}
