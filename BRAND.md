# Brand: Setstamp

> Extends the "Station Stencil" design system (DESIGN.md). Nothing here replaces a token, font or
> component; it adds the name, the marks and the voice on top of them.

## The name

**Setstamp** (SET-stamp, two syllables, 8 characters; fits a home-screen label untruncated).

You stamp the set. It is what the app already does: a finished set gets the `.ui-stamp` moment,
numbers are stamped like cast plates, titles are stencilled like station plates. The name says
the core loop (log a set) and the honesty promise (a stamp is a record you can trust) in one word,
and it is not another "Fit/Lift/Gym + Track/Log" compound.

Written **Setstamp** in sentences (one word, capital S only). The wordmark is uppercase
**SETSTAMP** because the stencil face is uppercase. Never "SetStamp", "Set Stamp" or "SETSTAMP"
in running text.

### How it was chosen (2026-11-24)

Fifteen candidates from the Station Stencil world, screened by public web search of App Store /
Play listings and obvious brands only. This is not a trademark clearance.

| Candidate | Verdict | Why |
|---|---|---|
| **Setstamp** | **Winner** | No app, brand or site found under the name (setstamp.app / .com showed no live site in search). Says the loop. |
| Stencil | Runner-up | No gym app found, but a common word already used by large software brands (Ionic's Stencil, Stencil image tool), so hard to own or find. |
| Hashmark | Runner-up | No app found; tally marks fit honest logging. Sits close to StrengthMark / FitMark, and "hash" reads as code. |
| Rerack | Dropped | No exact app, but too close to Unrack Lifting, Rackd and OneRack. |
| Racked | Dropped | Rackd Life (workout app). |
| Knurl | Dropped | "Knurl: Strength Training Coach" is on the App Store. Silent K too. |
| Heft | Dropped | Two existing lifting trackers named Heft. |
| Setmark | Dropped | Confusable with Setgraph (a direct competitor) and StrengthMark. |
| Liftmark | Dropped | Lift* namespace is crowded (Lift, Lifts, Liiift, Lift Heavy). |
| Tally | Dropped | Tally (tally.so) is a well-known software brand. |
| Stamp | Dropped | Stmpd (workout data), Stamp social, StampLog; too generic. |
| Platemark, Chalkline, Collar, Station | Dropped | Generic words or weak as a spoken name; not searched further. |

**Before launch, the owner must:** search USPTO (and EUIPO/CIPO/UKIPO for other markets) for
SETSTAMP in Nice classes 9 (downloadable software) and 42 (SaaS); check setstamp.app / setstamp.com
at a registrar; check handles (Instagram, TikTok, X, YouTube). A trademark lawyer confirms
clearance. Nothing has been registered or bought.

## Promise and tagline

**Promise:** every set you log is kept, free, and works without signal.

**Tagline:** **Stamp the set. Keep it for good.**

Alternates: "Log it in one thumb. Keep it forever." / "Free lifting log. No caps, no catch."

**One-liner (store / meta description):** A free lifting log for one thumb. No caps, no
subscription, works offline.

## Marks

All marks are outlined paths from Big Shoulders Stencil 800 (OFL), so they render identically
without the web font.

| Asset | File | Use |
|---|---|---|
| Wordmark (paint) | `public/brand/wordmark.svg` | on zinc/light grounds, `#181613` |
| Wordmark (inverse) | `public/brand/wordmark-inverse.svg` | on powder-coat/dark grounds, `#f6f3ed` |
| Wordmark (React) | `Wordmark` from `src/ui` | in-app; `currentColor`, `height` = cap height |
| Stamp plate | `BrandMark` from `src/ui` | the S on a safety-orange plate; uses `--action` / `--action-ink` |
| App icon | `public/icons/icon.svg`, `maskable.svg` + PNGs | home screen, favicon |
| Social card | `public/og.png` (1200×630) | Open Graph / Twitter `summary_large_image` |

**The stamp plate.** A safety-orange plate (the "do this now" colour) with a solid S in
near-black ink. The S is the stencil S with its bridges filled: on its own the stencil S reads as
a dollar sign, which is the opposite of a free app. Inside words (the wordmark) the stencil S is
fine and stays.

**Rules**
- Clear space around the wordmark: half its cap height on every side.
- Minimum wordmark size: 14px cap height on screen (`<Wordmark height={14} />`), 12mm in print.
- Minimum plate size: 20px tall. Below that use the app icon.
- Wordmark is one colour: ink or inverse ink. Never orange, blue, outlined, gradient, or shadowed.
- The orange plate counts as the region's orange (One Orange Rule). Do not put it beside an
  orange primary button; on a screen with an orange action, use the wordmark alone.
- Do not rebuild the wordmark in live text with letter-spacing; use the component or the SVG.
- Do not tilt, stretch, or "rubber-stamp" texture the marks. The stamp is in the name, not in a
  distressed effect.

## Voice

Setstamp talks like a good gym-floor regular: knows the numbers, keeps it short, never sells.

| Trait | Do | Don't |
|---|---|---|
| **Plain** | Short words, verbs first, numbers as numbers: "Log set", "3 sets left". | Hype, slang, "crush it", "beast mode", exclamation marks in UI. |
| **Honest** | Name what a number is: "Estimated 1RM", "Saved on this phone, will sync". | Overclaim: "Your true max", "Perfect form", medical claims from the body map. |
| **Calm** | One clear next step, no guilt: "Pick up where you left off". | Streaks, nagging, scarcity, upsell: "Don't lose your streak!", "Go Pro". |

Writing rules: sentence case everywhere except stencil titles (which render uppercase by CSS;
write them in sentence case in code). Units beside numbers, never inside a sentence when a stat
will do. "You" not "we" unless the app did something ("We couldn't reach the server"). No emoji.

### Microcopy, do and don't

**Buttons**

| Do | Don't |
|---|---|
| Log set | Submit / Save entry |
| Start Push day | Let's go! |
| Finish workout | Complete session ✓ |
| Undo | Oops, revert |
| Export my data | Download backup now! |

**Empty states**

| Do | Don't |
|---|---|
| **No workouts yet.** Start one from Today and it lands here. | Nothing to see here... yet! 👀 |
| **No program.** Pick a template or build your own days. | Your fitness journey starts now! |
| **No PRs for this lift yet.** Log a few working sets and your best shows here. | Unlock PR tracking by logging more! |

**Errors**

| Do | Don't |
|---|---|
| No signal. Your sets are saved on this phone and will sync. | Network error (code 503). |
| Couldn't sync 3 sets. Retry | Something went wrong. |
| That email already has an account. Sign in instead? | Invalid input. |
| Weight must be a number, like 62.5. | Error: NaN |

**PR moments** (record blue, stamped numerals, no confetti)

| Do | Don't |
|---|---|
| **New best: 102.5 kg × 5.** Up 2.5 kg from 12 Nov. | 🎉 NEW PR!!! YOU'RE A BEAST! |
| **Estimated 1RM 118 kg.** Up from 115 kg. | Your max is now 118 kg! |
| Best set this session. | Personal record smashed! Share it? |

## Touchpoints

- **App:** the wordmark appears on the sign-in screen and landing header; screen titles stay
  functional (Today, Program), not branded.
- **Home screen:** label "Setstamp"; icon = stamp plate on powder-coat black.
- **Email:** stencil SETSTAMP header (font with fallback), orange top bar, footer sign-off
  "Setstamp. Stamp the set. Keep it for good." Sender name "Setstamp".
- **Social card:** `public/og.png`, inverse wordmark, tagline, one-liner, stamp plate.
- **First complaint reply:** say what broke, what was kept, what happens next. No "we value your
  feedback".
