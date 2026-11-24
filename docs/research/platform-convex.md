# Platform research: Convex + React/Vite PWA

Researched 2026-11-23 against official docs and the npm registry. Where something comes from an unofficial source or my own estimate, it is marked **[unverified]** or **[estimate]**.

---

## 1. Convex full-text search

Source: https://docs.convex.dev/search/text-search , https://docs.convex.dev/production/state/limits

| Topic | Fact (official) |
|---|---|
| Definition | `defineTable(...).searchIndex("name", { searchField: "x", filterFields: ["a","b"], staged?: false })`. There is exactly **one** `searchField`, and it must be a `string`. `filterFields` give fast **equality** filters only, and dot paths such as `properties.name` work. |
| Query | `ctx.db.query("t").withSearchIndex("name", q => q.search("x", "terms").eq("a", v))`. Any `.filter()` after it runs *after* the index, so put conditions in `withSearchIndex`. |
| Tokenization | Tantivy `SimpleTokenizer`: it splits on whitespace and punctuation, lowercases, and caps terms at 32 chars. There is **no stemming, synonym or alias support**. |
| Prefix matching | **Only the last term** is prefix-matched. Every earlier term must match exactly. `"bench pre"` matches "bench press", but `"ben press"` does not. |
| Typo tolerance | **None.** The docs say: "Search has no typo tolerance." There is no fuzzy matching or edit-distance option. |
| Max results | A query scans at most **1024** results from the index, and `collect()` throws above 1024. Use `take(n)` or `paginate`. |
| Relevance | **BM25** combined with proximity and the number of exact matches. Ties go to the newest documents. The docs say the scoring is "subject to change". |
| Ordering | Results are always returned in relevance order: "Different ordering of results are not supported." To use another order, `take(n)` and re-sort in the function. |
| Limits | 1 search field and up to 16 filter fields per index. 4 full-text indexes per table (limits page). Up to 16 terms and 8 filter expressions per query. Search indexes also count toward the 32-indexes-per-table limit. |
| Billing | Each search is billed in **query-GBs = the full search index size**, whatever the result count. Free/Starter include 3,000 query-GB per month. A ~1 MB catalog index works out to roughly 3M free searches per month **[estimate]**. |
| Vector search | Available on all plans: 4 indexes per table, 2–4096 dimensions, max 256 results, runs in actions. You supply the embeddings. **Not used here**, since we are not paying for embeddings. |

## 2. Search implication for a 1000–1500-exercise catalog

Convex search can't handle the three things gym users type: **abbreviations** ("db row", "ohp", "rdl"), **typos** ("benhc"), and **mid-query partials** ("inc db pr"). Each search is also a network round trip, so it doesn't work offline in the gym.

**Recommendation: search client-side, with a hybrid sync.**
- Keep the **catalog in Convex** as the source of truth (`exercises` table plus a `catalogMeta { version }` doc).
- On the client, fetch the catalog **once per version** with a cheap `getCatalogVersion` query. Only when the version changes, pull the full list (paginated, or as one JSON file in Convex file storage or a static asset). Cache it in IndexedDB.
- Search **locally** with a custom scorer: normalize the text, expand an alias/abbreviation table (ohp→overhead press, db→dumbbell, bb→barbell, rdl→romanian deadlift…), match every term as a prefix, use Damerau-Levenshtein ≤1 (≤2 for terms of 6+ chars), boost name > alias > muscle/equipment, and add a per-user recency/frequency boost. A library (MiniSearch/Fuse/uFuzzy) or ~150 lines of custom code both fit easily: 1500 docs scan in under 5 ms.
- Use the Convex `searchIndex` only for **user-generated content** that is too big to ship, such as searching other users' public routines or notes later on. It is optional.
- This also matters for cost. If every app open subscribes to a 1500-doc list query, that is roughly 0.5–1 MB of Database I/O per load. With 2000 users that alone could burn tens of GB per month (Free includes 1 GB) **[estimate]**. Version-gated caching avoids it.

## 3. Offline behaviour

Sources: https://docs.convex.dev/client/react , https://docs.convex.dev/functions/mutation-functions , https://docs.convex.dev/client/react/optimistic-updates

Official facts:
- "Convex React automatically retries mutations until they are confirmed to have been written to the database."
- "The Convex backend ensures that despite multiple retries, every mutation call only executes once." This gives **exactly-once execution per client mutation call** within a live client session.
- React and Rust clients execute mutations "one at a time in a single, ordered queue".
- "Convex React will warn users if they try to close their browser tab while there are outstanding mutations." The client reconnects and re-establishes the session automatically.
- Actions are **not** retried and do not support optimistic updates.
- Optimistic updates are temporary local changes. They are re-run when local query results change and removed when the mutation completes. The docs say nothing about persistence. Because the queue is in-memory, **pending mutations and optimistic state are lost on reload, tab kill, or iOS evicting the PWA**. A Convex staff Discord reply describes in-memory buffering **[unverified, not in docs]**.
- Exactly-once therefore does **not** cover a page reload. After a reload the client has a new session and new request IDs, so a re-sent write is a new mutation.

Local-first status:
- https://www.convex.dev/sync says Convex does not currently provide a full offline sync mechanism, and some customers use tools like Replicache. The page is undated.
- I found **no GA or labs official local-first sync engine as of 2026-11**. The "object sync engine" posts on stack.convex.dev are research and direction, not a product. Third-party options exist: PowerSync's Convex integration, and "convex-embedded" **[unverified, not clearly official]**.

**Recommended durable offline write pattern** (build it yourself, it's small):
1. Every logged entity (workout, set) gets a **client-generated UUID** (`crypto.randomUUID()`) stored as `clientId` with a Convex index `by_clientId` (or `by_user_clientId`).
2. Write to **IndexedDB first** (an outbox table: `{opId, kind, payload, createdAt, attempts}`) and render the UI from local state plus the outbox. Workout-in-progress UI should read locally, not from Convex subscriptions.
3. A sync worker drains the outbox in order when `navigator.onLine` and the Convex connection state say it is connected (`client.connectionState()`). It calls **idempotent upsert mutations**: look up by `clientId` and insert if missing, or patch if newer. For patches, use a last-writer-wins check on `updatedAt` or a per-entity `version`. Deletes are tombstones (`deletedAt`).
4. Remove the outbox row only after the mutation promise resolves. Retrying after a reload is safe because the server deduplicates by `clientId`.
5. Batch sets into a single `syncWorkout({workout, sets[]})` mutation where possible, which means fewer function calls and atomic writes. Stay under the 16k docs written / 16 MiB per transaction limits.
6. Request `navigator.storage.persist()` so iOS/Chrome are less likely to evict IndexedDB.

## 4. Auth

Sources: https://github.com/get-convex/convex-auth (README + CHANGELOG), https://labs.convex.dev/auth , https://clerk.com/pricing , https://resend.com/pricing

**Convex Auth (`@convex-dev/auth`)**
- **v2 went stable as 2.0.0 on 2026-11-12, and 2.1.0 shipped on 2026-11-19.** The README says v1 (0.0.x) is "no longer the recommended auth solution" and only gets security updates. The v1 docs at labs.convex.dev/auth still say "beta".
- v2 methods: username+password, email+password (with verification and recovery), **magic link** (new in 2.1), username+passkey, and OAuth for **Google, Apple, GitHub, Discord**.
- **v2 removed the anonymous method, TOTP, and custom OAuth providers.** Anonymous existed in v1.
- v2 needs `convex >= 1.48.0`. The deployment issues JWTs itself, so there is no `JWT_PRIVATE_KEY`/`JWKS` setup. It has stateful sessions with revocation (default max lifetime 30 days, up to 100 sessions per user) and enforces a minimum password length of 10.
- Email (verification, reset, magic link) goes through the optional peer dependency `@convex-dev/resend`. Resend Free gives **3,000 emails/month and 100/day**, with 3 domains, and needs a verified domain you own **[domain requirement from memory, unverified]**.
- Production readiness: v2 is labelled stable, but it is 11 days old with breaking changes from beta. Treat it as new.

**Clerk (alternative)**: the Hobby plan is free with **50,000 retained users per app** (plus a grace period), a custom domain, and up to 3 social connections. It excludes passkeys, MFA and SMS, and you can't remove the "Secured by Clerk" branding. Pro costs $25/mo ($20/mo annually).

**Zero paid dependencies:** Convex Auth v2 with **username+password and/or Google/GitHub OAuth** needs no email provider at all. Adding email flows means Resend Free, which costs nothing at this scale but requires a domain. Clerk Hobby is also $0 and well under 50k users, but it adds a third-party dependency and branding. For a friend's small app, **Convex Auth v2: Google OAuth + username/password (+ passkey)** is the simplest.

## 5. Pricing

Sources: https://www.convex.dev/pricing , https://docs.convex.dev/production/state/limits

| Resource | Free (hard caps) / Starter (included, then PAYG) | Professional ($25/dev/mo) |
|---|---|---|
| Function calls | 1M/mo · then $2.20/M | 25M · $2/M |
| Action compute | 20 GB-h · $0.33/GB-h | 250 GB-h · $0.30 |
| DB storage | 0.5 GB · $0.22/GB-mo | 50 GB · $0.20 |
| **Database I/O** (doc + index bytes read/written) | **1 GB/mo** · $0.22/GB | 50 GB · $0.20 |
| File storage | 1 GB · $0.033/GB | 100 GB · $0.03 |
| File egress | 1 GB · $0.132/GB | 50 GB · $0.12 |
| Search storage | 0.5 GB · $0.55/GB | 1 GB · $0.50 |
| Search queries | 3,000 query-GB · $0.11/1k | 50,000 · $0.10/1k |
| Deployments / devs | 40 / 1–6 | 300 / 1–20 |
| Concurrency | 16 queries/16 mutations | 256/256 |

- Free has **hard caps**: once limits are reached, "new mutations that attempt to commit more insertions or updates may fail". Starter is the same plan with pay-as-you-go overage, so a card is needed. Business starts at a $2,500/mo minimum.
- Function calls count explicit client calls, scheduled runs, **subscription updates** (reruns), and file accesses. Cached query reads incur no DB bandwidth.

**Cost estimate [estimate]**. Assumptions: 4 workouts/week (about 17 per month), each with ~20 sets. The client is offline-first and batches each workout into a few mutations. The catalog is version-cached.
- Function calls: about 30 mutations plus 60 query runs per workout, plus about 30 calls per app open for history/dashboard. That's roughly 2,000 calls per user per month.
- DB I/O: about 15–30 MB per user per month if history queries are paginated and indexed (most I/O comes from re-reading history and stats).
- Storage: about 300 B per set including indexes, so ~1.2 MB per user per year.

| Users | Calls/mo | DB I/O/mo | Storage (yr 1) | Cost |
|---|---|---|---|---|
| 100 | ~0.2M | ~2–3 GB | ~0.12 GB | Calls and storage fit Free, but **DB I/O is the first limit to exceed 1 GB**. Either keep reads lean (precomputed per-user stats docs, cached catalog) to stay at $0, or use Starter at about **$0.50/mo**. |
| 2000 | ~4M | ~30–60 GB | ~2.4 GB | Starter: about 3M × $2.20 + ~45 GB × $0.22 + 2 GB × $0.22 ≈ **$7–20/mo**. Pro ($25/dev) only makes sense when you need more concurrency or seats. |

Design levers: denormalized `userStats` docs updated by mutations (so the app doesn't scan history), paginated history, version-gated catalog, and batching sets per workout.

## 6. Static PWA hosting

| Host | Free terms that matter |
|---|---|
| **Vercel Hobby** | ToS §4: "You shall only use the Services under a Hobby plan for your personal or non-commercial use." A friend's free, ad-free app is arguably fine. **Any monetization (ads, subscriptions, donations tied to features) breaks the terms.** Limits: 100 GB Fast Data Transfer, 1M CDN requests/mo, 100 deploys/day. If you exceed them you wait 30 days. (https://vercel.com/docs/plans/hobby , https://vercel.com/legal/terms) |
| **Cloudflare Pages / Workers static assets** | Pages Free: 500 builds/mo, 1 concurrent build, 20,000 files, 25 MiB per file, 100 custom domains per project. Workers static assets: "Requests to static assets are free and unlimited." I found no non-commercial restriction. (https://developers.cloudflare.com/pages/platform/limits/ , https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/) |
| **Netlify Free** | Credit-based: 300 credits/mo with a hard limit. A production deploy costs 15 credits, 1 GB bandwidth costs 20, and 10k requests cost 2. When credits run out, **the whole team's sites pause** ("Site not available") until the next cycle. That's about 20 prod deploys per month, or about 15 GB, and frequent deploys burn credits. (https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/credit-based-pricing-plans/ , https://docs.netlify.com/manage/accounts-and-billing/billing/resume-paused-projects/) |

**Recommendation: Cloudflare (Workers static assets or Pages).** Bandwidth and requests are unlimited and free, there's no commercial-use clause, and nothing pauses. PWA note: serve `sw.js` and `index.html` with `Cache-Control: no-cache` (via the `_headers` file) so updates roll out.

## 7. Versions (npm registry, checked 2026-11-23; "≥2 weeks" = published on or before 2026-11-09)

| Package | Latest | Latest that is ≥2 weeks old | Note |
|---|---|---|---|
| convex | 1.51.0 (11-18) | **1.49.0** (2026-10-30) | Meets Convex Auth v2's `>=1.48.0` |
| @convex-dev/auth | 2.1.0 (11-19) | 0.0.98 (11-09, **v1 line, no longer recommended**) | **2.0.0 (11-12) passes the 2-week rule on 2026-11-26.** Recommendation: target `^2.0.0` and pin once it's eligible. Don't start a new app on v1. |
| vite | 8.3.8 (11-11) | **8.3.7** (2026-11-09) | 6.4.6 is the `previous` tag |
| vite-plugin-pwa | 2.0.0 | **2.0.0** (2026-10-03) | Major bump: check the changelog and Vite 8 peer range |
| react / react-dom | 19.3.1 | **19.3.1** (2026-10-14) | 19.1.10 is the `backport` tag |
| tailwindcss / @tailwindcss/vite | 4.3.5 | **4.3.5** (2026-11-06) | |
| (alt) @clerk/react | 6.19.4 (11-20) | — | `@clerk/clerk-react` is the legacy name (5.61.11 is ≥2 weeks old) |

## Sources
- https://docs.convex.dev/search/text-search
- https://docs.convex.dev/production/state/limits
- https://www.convex.dev/pricing
- https://docs.convex.dev/client/react
- https://docs.convex.dev/functions/mutation-functions
- https://docs.convex.dev/functions/actions
- https://docs.convex.dev/client/react/optimistic-updates
- https://www.convex.dev/sync
- https://stack.convex.dev/object-sync-engine
- https://labs.convex.dev/auth
- https://github.com/get-convex/convex-auth (README, CHANGELOG)
- https://clerk.com/pricing
- https://resend.com/pricing
- https://vercel.com/docs/plans/hobby , https://vercel.com/legal/terms , https://vercel.com/docs/limits/fair-use-guidelines
- https://developers.cloudflare.com/pages/platform/limits/ , https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/
- https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/credit-based-pricing-plans/ , https://docs.netlify.com/manage/accounts-and-billing/billing/resume-paused-projects/
- npm registry (`npm view <pkg> time dist-tags`)
