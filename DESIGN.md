---
name: Setstamp
description: A free, offline-first lifting log built for one thumb between sets.
colors:
  # Dark theme: "powder coat" (matte black rack steel)
  powder: "#12100e"          # oklch(0.175 0.005 70)  ground
  powder-plate: "#1e1b19"    # oklch(0.225 0.006 70)  surface
  powder-raised: "#2e2b28"   # oklch(0.29 0.007 70)   controls
  powder-seam: "#33302d"     # oklch(0.31 0.007 70)
  stencil-white: "#f6f3ed"   # oklch(0.965 0.008 85)  ink
  stencil-2: "#c1bdb7"       # oklch(0.8 0.01 80)
  stencil-3: "#9f9b93"       # oklch(0.69 0.012 80)
  # Light theme: "zinc primer" (galvanised steel, black stencil paint)
  zinc: "#ebe9e6"            # oklch(0.935 0.004 80)  ground
  zinc-plate: "#fcfbfa"      # oklch(0.988 0.002 80)  surface
  zinc-raised: "#dedcd9"     # oklch(0.895 0.005 80)  controls
  paint: "#181613"           # oklch(0.2 0.006 70)    ink
  paint-2: "#4b4742"         # oklch(0.4 0.01 70)
  paint-3: "#5f5a55"         # oklch(0.47 0.01 70)
  # Safety colour code (ISO 3864 lineage)
  safety-orange: "#ff7527"   # dark oklch(0.72 0.19 45) / light "#f86111" oklch(0.68 0.2 42)
  safety-orange-ink: "#170d08"
  record-blue: "#62bbf5"     # dark oklch(0.76 0.12 240) / light "#0e5caf" oklch(0.48 0.15 255)
  safe-green: "#67d283"      # dark / light "#006b2d"
  caution-amber: "#f0c543"   # dark / light "#8a5700"
  stop-red: "#ff5f64"        # dark oklch(0.7 0.2 22) / light "#bb061e"
typography:
  display:
    fontFamily: "'Big Shoulders Stencil', 'Arial Narrow', sans-serif-condensed, sans-serif"
    fontWeight: 800
    lineHeight: 0.95
    textTransform: uppercase
  body:
    fontFamily: "'Archivo', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 400
    lineHeight: 1.45
  number:
    fontFamily: "'Archivo', system-ui, sans-serif"
    fontStretch: "84%"
    fontWeight: 760
    fontFeature: "'tnum' 1, 'lnum' 1"
rounded:
  xs: "4px"
  sm: "6px"
  md: "8px"
  lg: "14px"
  pill: "999px"
spacing: [4, 8, 12, 16, 24, 32, 48]
---

# Design System: Setstamp

## Brand

The product is named **Setstamp** (tagline: "Stamp the set. Keep it for good."). Name, wordmark,
stamp-plate mark, app icon, social card, voice and microcopy rules live in **[BRAND.md](BRAND.md)**.
Brand assets: `public/brand/wordmark.svg` (+ `wordmark-inverse.svg`), `public/og.png`,
`public/icons/*`, and the `Wordmark` / `BrandMark` components in `src/ui`. They extend Station
Stencil; tokens, fonts and components below are unchanged.

## Overview

**Creative North Star: "Station Stencil"**

Every gym marks its own equipment the same way: station numbers sprayed through a stencil onto powder-coated steel, weights cast into the plates, and a strict safety-colour code on the floor and the cages. This app is that marking system for your training. Screen titles are stencilled like a rack's station plate. Numbers are stamped: condensed, heavy, tabular. One colour, safety orange, means "do this now"; record blue means "this is what you have done".

This is an Operate surface. The world lives in marking details (stencil titles, stamped numerals, an inverse "plate" on the active tab, hazard stripes only where something is destroyed), never in decoration that slows a set.

**Replaces "Chalk on Rubber"** (graphite + platform-tape yellow + fleck texture). Rejected now and later: neon-on-black fitness dark mode, purple/blue gradients, glows, glass, soft pastel wellness cards, streaks and badges, emoji, tracked uppercase eyebrow labels.

**Key characteristics**
- Two first-class themes from the same steel: matte powder-coat black (dark) and zinc primer grey (light). System by default, override in Settings (`<html data-theme>`).
- Safety orange is the single action colour, always a fill with near-black ink on it, never orange text.
- Record blue belongs to personal records, the body map and history highlights. It is never a button.
- Big stamped numerals for every load, rep and timer.
- Thumb-zone layout; flat steel surfaces separated by tone and 1px seams.

## Colors

Strategy: **Restrained** (neutrals carry ~90%; one action colour; state colours from the safety code).

| Role | Token | Dark | Light | Use |
|---|---|---|---|---|
| Ground | `--bg` | #12100e | #ebe9e6 | page |
| Plate | `--surface` | #1e1b19 | #fcfbfa | lists, cards, sheets, tab bar |
| Raised | `--raised` | #2e2b28 | #dedcd9 | secondary buttons, stepper keys, chips |
| Seam | `--seam` / `--seam-strong` | #33302d / #6d6863 | #d4d2cf / #7d7a74 | dividers / control borders (≥3:1) |
| Ink | `--ink` `--ink-2` `--ink-3` | #f6f3ed #c1bdb7 #9f9b93 | #181613 #4b4742 #5f5a55 | text; all ≥4.5:1 on raised |
| Action | `--action` (alias `--tape`) | #ff7527 | #f86111 + edge #a63c0c | primary fill; ink `--action-ink` #170d08 (7:1 / 6.2:1) |
| Record | `--record` (alias `--iron`) | #62bbf5 | #0e5caf | PRs, body map, "best" marks |
| OK | `--ok` | #67d283 | #006b2d | synced, set done |
| Warn | `--warn` | #f0c543 | #8a5700 | saved-on-device, soft warnings |
| Danger | `--danger` | #ff5f64 | #bb061e | sync error, destructive |

Old names (`--tape`, `--tape-ink`, `--tape-press`, `--tape-edge`, `--iron`) remain as aliases so existing screens keep working; new code uses `--action*` and `--record`.

### Named rules
**One Orange Rule.** At most one safety-orange control per screen region: the next thing to do. Two orange things means one is wrong.
**Blue Is the Record Rule.** Blue marks what was achieved (PR, best set, trained muscle). It never invites a tap by colour alone.
**Stripes Mean Danger Rule.** The hazard stripe (`.ui-hazard`) appears only around irreversible actions (delete account, discard workout). Never as decoration.

## Typography

**Display: Big Shoulders Stencil** (variable, opsz + wght, OFL, self-hosted in `public/fonts`). Uppercase, weight 800, line-height 0.95, letter-spacing 0.005em. Only for: screen titles, the rest timer, landing-page headlines. The wordmark is the outlined `Wordmark` component, not live text. Never for body copy, never below 1.5rem.

**UI + numbers: Archivo** (variable, wdth 62–125 + wght, OFL, self-hosted). Body at 100% width. Numbers use the `.num` class: `font-stretch: 84%`, weight 760, tabular lining figures, so 142.5 kg reads like a stamped plate at arm's length.

| Step | Token | Size | Notes |
|---|---|---|---|
| Rest timer | `--num-xxl` | 4.5rem | display face allowed |
| Number XL | `--num-xl` | 2.75rem | stepper values |
| Number L | `--num-l` | 1.75rem | set rows, stats |
| Headline | `--fs-headline` | 2.25rem | stencil screen title |
| Title | `--fs-title` | 1.25rem | section and card titles, 720 weight |
| Lead | `--fs-lead` | 1.125rem | large buttons, sheet titles |
| Body | `--fs-body` | 1.0625rem | max 60ch |
| Small | `--fs-sm` | 0.9375rem | meta |
| Label | `--fs-label` | 0.8125rem | field labels, tab labels; sentence case, no tracking |

**Arm's Length Rule.** Any number a lifter acts on mid-set is ≥1.75rem and uses `.num`. Units ride beside it at label size.

## Layout

Single column, max 560px (`--content-max`), centred on wider screens; 16px gutter. Sticky header: stencil title left, sync status + settings right. Bottom dock = optional Active Workout bar + 4-tab bar (Today, Program, Exercises, Progress), 68px plus safe area. Screen primary actions dock with `<ScreenAction>` above the tab bar. Sections: 28px apart (`--section-gap`), 12px inside. `--dock-h` is set by the Shell; anything fixed to the bottom must sit above it.

## Elevation & Depth

Flat steel. Depth is tonal (ground → plate → raised) plus 1px seams. Ground carries a very faint powder-coat grain (`--grain`, inline SVG noise, not fixed). Only overlays cast shadow: `--shadow-sheet`, `--shadow-toast` (offset, soft blur). Scrim `--scrim` behind sheets.

## Shapes

Tight, machined radii: 4 / 6 / 8 / 14 (`--r-xs/sm/md/lg`). Buttons and inputs 8px; chips 6px (tags, not pills); sheet top 14px. Pills only for counts and the switch track. Active tab = an inverse ink "plate" behind the icon. Hazard stripe: 45° repeating, 10px bands of `--danger` and the ground.

## Components (src/ui)

- **Button** `variant` primary (orange fill) | secondary (raised) | ghost | danger (red text on raised); `size` md 48px | lg 56px; `block`, `loading`, `icon`, `trailingIcon`. Press: scale 0.97, 140ms ease-out.
- **IconButton** 44/56px, `label` required, `plain|raised`.
- **Stepper** 64px −/+ keys flanking a stamped numeral field; long-press repeat.
- **Sheet** bottom sheet on `<dialog>`; drag/flick to dismiss; ease-drawer 320ms in, 200ms out.
- **Chip** (static tag; tones neutral/iron/ok/record/warn/danger), **FilterChip** (40px, 44px hit; selected = ink plate + check), **ChipRow**.
- **ListGroup / ListRow** 56px rows on a plate, 1px seams, full-row target.
- **Segmented / Tabs** raised track, selected = plate thumb with ink text.
- **Switch** row with 52×32 track; on = ink.
- **Toast** inverse plate above dock; optional Undo; `tone="error"` red.
- **EmptyState** title + body + one action; `framed` = dashed seam slot.
- **SyncStatus** quiet icon when synced, word + count otherwise.
- **New: Card** plate container (`as`, `tone` default|raised|record|danger, `padded`, `interactive`). Do not nest cards.
- **New: SectionHeader** title + optional meta line + `aside`; `level` 2|3.
- **New: Stat** stamped value + unit + label, optional `note` (use for "estimated"), `size` md|lg, `tone` default|record|ok.
- **New: TextField** label, input, hint, error wired with aria; 52px input. Prefer over hand-rolled inputs.
- Utility classes: `.num` (stamped numerals), `.display` (stencil uppercase), `.ui-hazard` (stripe band), `.muted`, `.stack`, `.screen`, `.section`, `.sr-only`.

## Motion

Crisp and mechanical; nothing bounces. Tokens: `--ease-out` cubic-bezier(0.23,1,0.32,1), `--ease-drawer` (0.32,0.72,0,1), `--dur-press` 140ms, `--dur-fast` 160ms, `--dur-base` 220ms, `--dur-sheet` 320ms. Animate only state: press, sheet, toast, switch, and the one authored moment: a set marked done gets `.ui-stamp` (scale 1.12→1 + opacity, 200ms), like a stamp hitting paper. No page or tab transitions. `prefers-reduced-motion`: keep fades, drop movement.

## Email

Email clients ignore CSS variables and most web fonts, so emails use inline styles, light theme only, table layout, max width 560px.

- Background (outer): `#ebe9e6`. Card/plate: `#fcfbfa`, border `1px solid #d4d2cf`, radius 8px.
- Text: `#181613`; secondary `#4b4742`; footer/fine print `#5f5a55`.
- Primary button (bulletproof): background `#f86111`, border `1px solid #a63c0c`, text `#140b06`, 700 weight, 16px, padding 14px 24px, radius 8px. One per email.
- Links: `#181613` underlined (never orange text). Record/PR highlights: `#0e5caf`. Errors: `#bb061e`. Success: `#006b2d`.
- Wordmark (text "SETSTAMP", from `APP_NAME`) and heading: `font-family: 'Big Shoulders Stencil', 'Arial Narrow', 'Helvetica Neue', Arial, sans-serif; font-weight: 800; text-transform: uppercase; font-size: 32px; line-height: 1; letter-spacing: 0.5px; color: #181613`. Can be loaded via Google Fonts `<link>` for clients that honour it; the fallback must still look right.
- Body: `font-family: Archivo, 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 16px; line-height: 24px`.
- Codes/numbers (e.g. verification code): Archivo/Arial 700, 32px, letter-spacing 4px, `#181613` on `#dedcd9` block, radius 6px.
- Optional 6px safety-orange bar (`#f86111`) across the top of the card as the brand mark. No images required; no emoji.
- Dark-mode clients: set `color-scheme: light only` meta; colours above survive auto-inversion acceptably.

## Landing page

Mode: **Persuade**, same world turned up. The landing is the gym's signage wall, not a SaaS hero.
- First viewport: stencil headline at poster scale (clamp to ~6rem) on powder-coat black, a real phone-sized render of the logging screen (stamped numerals, orange "Log set") as the proof, one orange primary action ("Open the app" / install) and a quiet secondary. State the offer plainly: free, no caps, full history, works offline.
- Colour may be **Committed**: whole bands of zinc primer and powder black alternate; one full-bleed safety-orange band is allowed once (e.g. the "Free means whole" statement) with black ink. Record blue only on progress/PR demonstrations.
- Devices from the world: station numbers on real sequence content only (the 3-step "open, log, see progress" flow), stamped numerals for real example data labelled as sample, the hazard stripe never (nothing is dangerous here).
- No invented testimonials, user counts, prices or logos. Name: Setstamp; use the `Wordmark` component, not live stencil text.
- Same fonts, self-hosted; same tokens from `src/styles/tokens.css`.

## Do's and Don'ts

- Do keep one orange action per region; don't set orange text.
- Do label estimates ("est. 1RM"); don't present the body map as medical advice.
- Do use stencil only for titles/timer/wordmark; don't use it for body, labels or buttons.
- Do use icons from `src/ui/icons.tsx` (24px, 2px stroke, square-ish caps); don't use emoji.
- Don't add glows, gradients (except the dock fade), glass, coloured side-stripes on cards, or tracked uppercase eyebrows.
