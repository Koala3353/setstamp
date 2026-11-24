# QA report: end-to-end pass (2026-11-24)

Setup: `npx vite --port 5173` against the Convex cloud dev deployment, in the built-in browser at 375×812 (plus 390×844, light and dark). Two fresh accounts, A and B (`qa-a+…`/`qa-b+…@example.com`), confirmed with the dev-logged links from the Convex logs. The test credentials are kept outside the repo, in the session scratchpad.

## Results

| # | Scenario | Result | Evidence |
|---|---|---|---|
| 1 | Onboarding | Pass (after fix 1) | Sign-up led to "Check your email". The `[mail:dev]` link in the Convex logs led to "Email confirmed", then "Open the app", then Today. Settings: switched to lb and picked 7 equipment items. Before the fix, the bar showed as **44 lb** and the plates as 55.1/44.1/33.05 lb. |
| 2 | Program | Pass (after fix 2) | Created PPL. In the Push editor, removing Triceps Pushdown took sets 16→14, and adding Face Pull added Rear delts, Upper back (primary) and Rotator cuff (secondary) to the map. In Planned week, tapping Chest opened a sheet listing Bench (Primary · 3 sets) and DB Bench (Primary · 3 sets), with suggestions such as Cable Fly and Pec Deck. Primary muscles are solid fill and secondary are hatched (`url(#…-hatch)`). The note "Estimate: primary = 1 set, secondary = ½ set" is shown. Mappings match `catalog.generated.json`: Bench primary chest, secondary front delts and triceps. Face Pull primary rear delts and upper back, secondary traps and rotator cuff. Lateral Raise primary side delts, secondary front delts and traps. The Triceps sheet showed Bench, OHP and DB Bench as Secondary, matching the catalog. |
| 3 | Logging speed | Pass (after fixes 3–6) | **1 tap** logs a prefilled set (set 2 = 135×6). Changing the weight takes **3 taps**: open, +5, Log set (145). The rest timer started at 2:30 and restarted after each set. Warm-ups for 135 were 45×10, 50×5, 80×3, 105×1. Plate math for 225 lb gave "45 · 45 per side on a 45 lb bar". Substituting DB Bench offered "Same family · hits chest" reasons, and the card read "Swapped in for Dumbbell Bench Press". Delete set took the count 3→2, and Undo brought it back to 3. Exercise and session notes saved. The finish sheet showed volume 4200 lb (checked by hand). The first session had no PRs, which is correct. The second session showed "Heaviest for 6 reps: 150 lb (was 145 lb)", "Best est. 1RM: 180 lb (estimated, was 174 lb)" and "Best session volume". The program moved on: next up was Pull, day 2 of 3. |
| 4 | Search | Pass | rdl → Barbell RDL, DB RDL…; dumbbell chest → DB Bench, Incline DB Press, DB Fly; leg press → Leg Press…; no equipment → Plank, Push-Up, Bodyweight Squat…; "romanain" → the Romanian DL family. "My equipment" cut "row" results from 64 to 40. Sparse queries get suggestions ("flurb press" → "Did you mean Floor Press?" plus related lifts; "zercher squatt" → related squats). Pure nonsense ("xqzv flurb") shows "Nothing matches" and "Create …" with no suggestions, since there is nothing close to suggest. |
| 5 | Offline recovery | Pass (after fix 7). The service worker could not be tested in the built-in browser | See the method below. With traffic blocked, I logged 3 sets and reloaded twice. All 3 were still ticked, and the status read "Offline. 3 changes saved on this device." Before the fix it said "Syncing" forever. Back online, it read "All changes synced." I also went offline mid-session, logged 1 set and reconnected without a reload, and it synced. On the server (owner A, last session) there were 4 done sets with distinct cids and 0 duplicate rows. Production build: `sw.js` is served (200, text/javascript) and precaches 18 entries with an `index.html` navigation fallback. The built-in browser refuses all service-worker registration, including a manual `navigator.serviceWorker.register('/sw.js')`: "TypeError: Failed to register a ServiceWorker … An unknown error occurred when fetching the script." So the offline shell is **not verified** here and needs a check in real Chrome or Safari. Note that the SW only registers once signed in (`UpdatePrompt` is inside the signed-in `Shell`). |
| 6 | Data isolation | Pass | A signed out with 0 pending, which by default removed the IndexedDB. B signed up and saw an empty Today, Progress and Program, with only `gym-sync-v1:<B id>` in IndexedDB. B logged a set. B then signed out **keeping** local data, and A signed in. A's 2 sessions and PPL were intact, with no B data, and the two per-user DBs were separate. `npx vitest run convex`: 20/20 pass. |
| 7 | Progress | Pass | History lists both sessions. Session detail shows records, sets and the substitution. The Bench exercise view shows records (est. 1RM labelled "Estimated (Epley, ≤10 reps)"), a top-set chart and recent sessions. Downloads were captured as blobs instead of saved: CSV `gym-sets-2026-11-24.csv` (header `date,workout,exercise,set_kind,weight,unit,reps,…`, weight as typed), JSON `gym-export-…json` (format `gym-app-export/1`, own rows only). |
| 8 | Units | Pass | In kg, history shows 61.25/68 kg and the records convert. Back in lb, it shows 135/150 lb again, and the stored `entered` is still `{lb,135}`. The 45 lb plate shows as 20.4 kg in kg mode and as 45 lb again after switching back. |
| 9 | Delete all data (B) | Pass | Typing DELETE enables the button. Afterwards B's Today and Progress are empty. On the server, B has 0 rows (`purgedThrough` 10, all counts 0). A is unchanged: 43 live rows. |
| 10 | Layout audit | Pass (after fixes 2, 4) | Checked every tab, the day editor, workout, set editor, picker, sheets and the exercise detail at 375 and 390. `scrollWidth == innerWidth` everywhere. All inputs are 17px or larger, apart from the stepper inputs, which are 28–44px. The bottom nav and workout bar never overlap content: the last content ends above the dock on every screen. Dark and light are both readable. Remaining items under 44px: filter chips are 40px visually but have a 46px `::after` hit area (checked with `elementFromPoint`); inline credit links sit in body text; body-map regions are anatomical, with a muscle-chip list as the accessible alternative. |

### How the offline test blocked traffic

The built-in browser has no network toggle. Instead, a dev-only shim (`src/app/qaOffline.ts`, loaded from `main.tsx` only when `import.meta.env.DEV`, and confirmed absent from `dist/`) wraps `WebSocket` and `fetch` before the Convex client is created:

- While the `qa:offline` localStorage key is set, new sockets connect to `ws://127.0.0.1:9`, a closed port, so they fail like a dead network.
- Live sockets are closed, and fetches to `*.convex.cloud` and `*.convex.site` reject.
- `navigator.onLine` stays true. This is the harder case: a gym Wi-Fi network that is up but unreachable.
- `window.__qa.offline(true | false | "os")` toggles it at runtime. `"os"` also reports `navigator.onLine = false`.

Because the key is in localStorage, the block survives reloads.

## Bugs found and fixed

1. **Switching to lb kept kg gear.** The bar showed 44 lb and the plates 55.1 lb, so the plate calculator was off for new lb users. Now a unit switch also swaps the bar and plates, but only while they are still the other unit's standard set; custom gear is kept. (`SettingsView.tsx`)
2. **Rep range steppers clipped "10" to "1"** in the slot sheet at 375px: the two steppers side by side left 22px for the number. Their keys and font are now compact. (`program.css`)
3. **One tap logged "– × 6"** on a weighted lift with no history. Now the set editor opens when any required value is missing. (`WorkoutView.tsx`)
4. **Open sets showed "–" even though ✓ logs a prefilled value.** Open rows now show the values ✓ will log. (`ExerciseCard.tsx`, `WorkoutView.tsx`)
5. **Stepper select-all was lost on click focus.** Typing appended to the old value: 225 became "5225225", then clamped to 2000. The select-all from focus is now kept. (`ui/Stepper.tsx`)
6. **"Log set" accepted empty values.** It now needs reps (and weight for weighted lifts). It uses `aria-disabled` rather than `disabled`, so a value typed but not yet committed still logs on the same tap. (`SetEditor.tsx`, `ui.css`)
7. **Sync status said "Syncing" forever with the backend unreachable.** The transport now reports Convex socket state, with a 4 s grace on first connect. The status shows "Offline, N saved on this device", and reconnecting kicks a flush straight away. Covered by a new test in `sync.test.ts`. (`convexTransport.ts`, `store.ts`, `types.ts`)
8. **The rest bar label was squeezed to "B."** It is hidden at 420px and narrower. (`workout.css`)
9. **Plural slips:** "1 planned sets weren't ticked" and "1 sets" on Today. (`WorkoutView.tsx`, `TodayScreen.tsx`)

## Observations, not fixed (for the polish pass or a product decision)

- The PPL template picks both Rope Triceps Pushdown and Triceps Pushdown on Push, because two triceps slots pick from the same family.
- Today shows volume as "3660 lb" but Progress shows "3,660 lb". PR text likewise prints "2520 lb".
- Session detail lists unticked sets as "Working · not done" and exercises with "No sets logged", while the finish sheet says unticked sets "stay in the plan, not your history".
- "Planned week" wraps to two lines in the 3-way segmented control at 375px.
- Sign-out clears all localStorage, which includes the per-device theme choice.
- The service worker registers only after sign-in, so the welcome and sign-in shell is not cached for a first offline visit.
- The bundle is one chunk over 500 kB (a build warning).

## Addendum: service worker verified in real Chrome (lead, 2026-11-24)

- Production build (`npm run build`, `vite preview --port 4173`) opened in the user's Chrome via Claude in Chrome.
- `navigator.serviceWorker.register('/sw.js')` activated; the Workbox precache held 12 entries.
- Stopped the preview server (curl to :4173 failed), then reloaded: the welcome screen rendered fully from the SW cache. **The offline app shell works.** The earlier failure was specific to the built-in browser.
- Note: in the app the SW is registered by `UpdatePrompt`, which mounts after sign-in. Offline use therefore needs one online sign-in first, which offline logging requires anyway.
- Cleanup: the test SW was unregistered and its caches deleted from the user's Chrome.
