# Rep Ledger design system

A calm, athletic training journal. The next action is always obvious, numbers are easy to read mid-set, and nothing shouts. The user supplied this direction; source of truth for tokens is `src/styles.css` (`:root`).

## Color (restrained: neutrals plus one accent)

| Token | Value | Use |
|---|---|---|
| `--bg` | `#F6F5F1` | Page ground (warm off-white) |
| `--surface` | `#FFFFFF` | Panels, exercise blocks, inputs, dock |
| `--surface-sunk` | `#EFEDE7` | Quiet empty states, neutral tags, loading placeholders |
| `--text` | `#202420` | Ink |
| `--muted` | `#5B625B` | Secondary text (5.9:1 on bg) |
| `--faint` | `#6A7069` | Placeholders, previous-set values (at least 4.5:1 on white, checked by `src/contrast.test.ts`) |
| `--border` | `#E4E1D9` | Panel and row dividers |
| `--border-strong` | `#8A8F88` | Input outlines (3.3:1, meets non-text contrast) |
| `--accent` | `#245C45` | The one primary action per screen, active nav, logged state, focus ring (7.6:1 on white) |
| `--accent-soft` / `--accent-wash` | `#E4EEE8` / `#D3E6DB` | Today's target cell, saved status, set-completion wash |
| `--warn` on `--warn-soft` | `#7A5200` on `#F8EED6` | In-progress, offline |
| `--danger` on `--danger-soft` | `#A8261B` on `#FBE9E6` | Not saved, delete |

Green is reserved for "do this next" and "done". The reps-in-reserve picker selects in charcoal so it never competes with the log button.

## Type

Inter Variable, self-hosted via `@fontsource-variable/inter` (Latin and Latin Extended cached for offline). Body 16px/1.5. H1 28px/650, H2 19px/620, H3 16px/600, tracking -0.015em. Every weight, rep, timer, and nutrition number uses `font-variant-numeric: tabular-nums`. Set inputs are 22px/650. The rest timer is 36px/700.

## Shape and depth

Radii: 8px for controls, 12px for panels, 16px for sheets. 1px warm borders do the separating. The only shadow is the bottom dock's soft lift. No glass, no gradients.

## Layout

- Phones: 16px gutter, bottom tab bar (Today, Train, Food, Progress, Review) at 60px tall. Settings opens from the Today header.
- Desktop (960px and up): a 232px sidebar with the brand, the same five items, and Settings pinned at the bottom. Content is 640px wide (760px on the workout screen).
- The active workout hides the tab bar. Its dock holds either the rest timer or the single Finish button.
- List rows for repeated records (plans, meals, workouts, weigh-ins). Panels only for meaningful groups (a session, a meal slot, an exercise).

## Components

- **Buttons:** 48px minimum (56px for `lg` primary actions). Variants: default (white, bordered), primary (accent), ghost (accent text), danger.
- **Exercise block:** name and prescription, then a two-cell comparison (today's target on accent-soft beside last time), then "Why this target" and "How to do it" disclosures, then the set table.
- **Set row:** set number, previous, kg, reps, check (52px). The active row is tinted, has large inputs (decimal and numeric keyboards), and the RIR picker sits below. A logged row shows its values; its check button opens in-place editing with Delete and Cancel.
- **Save status pill:** Saved / Saving… / Offline · saved on phone / Not saved, each with its own color pair.
- **Welcome screens:** a white panel with a visual (a labelled example card or icon rows on accent-soft tiles), then a title, a short paragraph, progress dots and one primary button. Skip sits top right.
- **Setup steps:** "Step N of 5" with a thin progress bar, a question as the heading, then one or two sections from the profile form, with Back and Continue.
- **Screen guide:** an accent-soft block at the top of a tab, with a heading, 3–4 bullet points, a primary "Got it" button and an "Explain the terms" link. It's dismissed once per device.
- **Help:** terms grouped by area. The term you linked to is highlighted.
- **Icons:** the authored set in `src/icons.tsx`, 24px grid, 1.75 stroke, round caps. No emoji or Unicode glyphs as icons.

## Motion

One authored moment: completing a set. The check pops in, the row settles from a green wash, and the rest timer rises into the dock. Progress bars move with `transform: scaleX`. Easing is `cubic-bezier(0.16, 1, 0.3, 1)`. `prefers-reduced-motion` reduces all of it to an instant change.

## Voice

Supportive, specific, factual. Empty states say what will appear and how to get it. Missing data reads "Not logged", never zero. Nigerian foods appear as everyday examples ("Eba with egusi and beef").
