// Import the generated catalog into Convex via the internal catalog:importBatch.
//
//   node --experimental-strip-types scripts/import-catalog.ts [--prod] [--catalog <file>] [--meta <file>]
//
// Upserts by exId (never deletes). The meta doc (with the version clients use
// to invalidate their cache) is sent with the LAST chunk, so clients only see
// a new version once every exercise of it is in.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const argv = process.argv.slice(2);
const flag = (name: string) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};
const catalogPath = flag("--catalog") ?? path.join(ROOT, "catalog/catalog.generated.json");
const metaPath = flag("--meta") ?? path.join(ROOT, "catalog/catalog.meta.json");
const prod = argv.includes("--prod");

// Keep each CLI argument well under the OS argv limit (~1 MB on macOS) and
// Convex's argument size limit.
const MAX_CHUNK_BYTES = 200_000;

const exercises: unknown[] = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
const rawMeta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
const meta = {
  version: String(rawMeta.version),
  builtAt: String(rawMeta.builtAt),
  counts: rawMeta.counts ?? {},
  sources: rawMeta.sources ?? {},
  ...(rawMeta.curated !== undefined ? { curated: rawMeta.curated } : {}),
  ...(typeof rawMeta.schema === "number" ? { schema: rawMeta.schema } : {}),
};

const chunks: unknown[][] = [];
let cur: unknown[] = [];
let size = 0;
for (const ex of exercises) {
  const n = JSON.stringify(ex).length + 1;
  if (cur.length && size + n > MAX_CHUNK_BYTES) {
    chunks.push(cur);
    cur = [];
    size = 0;
  }
  cur.push(ex);
  size += n;
}
chunks.push(cur);

const totals = { inserted: 0, updated: 0, unchanged: 0 };
for (let i = 0; i < chunks.length; i++) {
  const last = i === chunks.length - 1;
  const args = JSON.stringify(last ? { exercises: chunks[i], meta } : { exercises: chunks[i] });
  const cli = ["convex", "run", ...(prod ? ["--prod"] : []), "catalog:importBatch", args];
  const out = execFileSync("npx", cli, { cwd: ROOT, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  const res = JSON.parse(out.slice(out.indexOf("{")));
  totals.inserted += res.inserted;
  totals.updated += res.updated;
  totals.unchanged += res.unchanged;
  console.log(`chunk ${i + 1}/${chunks.length}: ${chunks[i].length} rows`, res);
}
console.log(`done: ${exercises.length} exercises, version ${meta.version}`, totals);
