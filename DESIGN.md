---
name: Open Gen Studio
description: Darkroom console for local image generation — near-black stage, acid lime signal.
colors:
  acid-lime: "#d4ff00"
  acid-lime-foreground: "#121212"
  void-black: "#0b0b0d"
  stage-ink: "#141416"
  popover-ink: "#121214"
  rail-ink: "#18181b"
  paper-white: "#f4f4f5"
  zinc-mute: "#a1a1aa"
  hairline: "rgba(255, 255, 255, 0.08)"
  input-wash: "rgba(255, 255, 255, 0.10)"
  accent-wash: "rgba(255, 255, 255, 0.05)"
  destructive: "#f87171"
  success: "#10b981"
  warning: "#f59e0b"
  info: "#3b82f6"
  light-canvas: "#ffffff"
  light-ink: "#262626"
typography:
  display:
    fontFamily: "Outfit, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "Outfit, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-0.025em"
  title:
    fontFamily: "Outfit, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "normal"
  body:
    fontFamily: "Outfit, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "Outfit, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: "0.06em"
  mono:
    fontFamily: "Geist Mono, ui-monospace, monospace"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "normal"
rounded:
  sm: "6px"
  md: "8px"
  lg: "10px"
  xl: "14px"
  "2xl": "18px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  "2xl": "32px"
components:
  button-primary:
    backgroundColor: "{colors.acid-lime}"
    textColor: "{colors.acid-lime-foreground}"
    rounded: "{rounded.lg}"
    padding: "0 12px"
    height: "32px"
    typography: "{typography.title}"
  button-primary-hover:
    backgroundColor: "color-mix(in srgb, #d4ff00 90%, transparent)"
    textColor: "{colors.acid-lime-foreground}"
  button-outline:
    backgroundColor: "{colors.input-wash}"
    textColor: "{colors.paper-white}"
    rounded: "{rounded.lg}"
    padding: "0 12px"
    height: "32px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.paper-white}"
    rounded: "{rounded.lg}"
    padding: "0 12px"
    height: "32px"
  input-default:
    backgroundColor: "{colors.input-wash}"
    textColor: "{colors.paper-white}"
    rounded: "{rounded.lg}"
    padding: "0 12px"
    height: "30px"
  card-surface:
    backgroundColor: "{colors.stage-ink}"
    textColor: "{colors.paper-white}"
    rounded: "{rounded.xl}"
  nav-pill:
    backgroundColor: "color-mix(in srgb, #141416 90%, transparent)"
    textColor: "{colors.paper-white}"
    rounded: "{rounded.full}"
    padding: "4px 12px"
  chip-selected:
    backgroundColor: "transparent"
    textColor: "{colors.paper-white}"
    rounded: "{rounded.lg}"
---

# Design System: Open Gen Studio

## Overview

**Creative North Star: "The Darkroom Console"**

Open Gen Studio is a calm near-black creative console. The generated image is the subject; chrome recedes into soft tonal panels and a floating pill nav. Acid lime is the expose/ready signal — Generate, Save, selection borders, status dots — never wallpaper.

Personality is calm, precise, and image-first. Controls feel refined and restrained (coss / new-york density), with rare high-voltage CTAs. Depth comes mostly from tonal steps (void → stage → popover), not heavy shadows. A light theme exists in tokens for completeness, but the product defaults to dark and that is the visual authority.

Confirmed visual rejections: neon cyberpunk overload; purple AI-SaaS gradients; dense Comfy/node-graph chrome; terminal green-on-black hacker UI.

**Key Characteristics:**

- Dark-first void stage with soft card tonal lifts
- Acid lime used sparingly as the ready/expose signal
- Floating blurred pill navigation
- Image-centered three-rail studio (Advanced · Stage · Gallery)
- Outfit geometric sans + Geist Mono for code/IDs
- Uppercase tracked section labels for panel headers

## Colors

A near-black neutral field with one electric accent and quiet semantic status colors.

### Primary

- **Acid Lime** (`#d4ff00`): Primary actions (Generate, Save recipe), focus ring, active tab underline, gallery selection border, status dots, brand icon tint. Rarity is the point.
- **Acid Lime Foreground** (`#121212`): Text/icons on primary fills for contrast.

### Neutral

- **Void Black** (`#0b0b0d`): App background / stage floor.
- **Stage Ink** (`#141416`): Cards, rails, list rows, floating header fill.
- **Popover Ink** (`#121214`): Dialogs, menus, popovers — one step off the stage.
- **Rail Ink** (`#18181b`): Muted wells, inset panels, secondary surfaces.
- **Paper White** (`#f4f4f5`): Primary text on dark.
- **Zinc Mute** (`#a1a1aa`): Secondary labels, helper copy, inactive tabs.
- **Hairline** (`rgba(255,255,255,0.08)`): Default borders and dividers.
- **Input Wash** (`rgba(255,255,255,0.10)`): Field and outline-control fills in dark.
- **Accent Wash** (`rgba(255,255,255,0.05)`): Ghost/hover washes.

### Semantic

- **Destructive** (red-400 family): Errors, cancel emphasis, missing-field warnings.
- **Success** (emerald): Ready / installed status.
- **Warning** (amber): Caution states.
- **Info** (blue): Informational accents.

### Light (secondary; not product default)

- **Light Canvas** (`#ffffff`) / **Light Ink** (`#262626`): Available via theme toggle; primary in light becomes neutral-800. Prefer dark when designing new studio surfaces unless the task is explicitly light-mode.

### Named Rules

**The Exposure Rule.** Acid lime occupies a small fraction of any screen — CTAs, selection, and live status only. If the UI starts to glow, pull it back.

**The Void Floor Rule.** New surfaces sit on Void Black or a single tonal step up (Stage / Rail / Popover). Do not introduce unrelated gray families.

## Typography

**Display / Heading Font:** Outfit (ui-sans-serif fallback)  
**Body Font:** Outfit  
**Mono Font:** Geist Mono (ui-monospace fallback)

**Character:** Geometric, modern, product-calm. Outfit carries UI and titles; mono is reserved for IDs, paths, seeds, and code-like values.

### Hierarchy

- **Display** (600, ~1.25rem, tight tracking, often uppercase): Page titles like DOWNLOADS / CREATOR.
- **Headline** (600, ~1.125rem): Panel titles (Image Gallery, section heads).
- **Title** (500, 0.875rem): Nav items, control labels, button text (sm: slightly smaller).
- **Body** (400, 0.875rem): Prompt text, descriptions, list primary lines.
- **Label** (500, ~11px / 0.6875rem, wide tracking, often uppercase): Section eyebrows (SAMPLING, REFINE, LORAS, RECENT).
- **Mono** (400, 0.75rem): Seeds, filenames, URLs, recipe IDs.

### Named Rules

**The Label Stamp Rule.** Structural section headers use small uppercase tracked labels in Zinc Mute — not oversized title case banners.

**The Mono Lane Rule.** Geist Mono is for machine-readable values only; never for marketing headlines.

## Layout

Desktop studio, full-bleed void. Image workspace is a three-rail composition: collapsible Advanced rail (left) · centered stage + prompt bar · Gallery rail (right). Utility pages (Downloads, Creator, Tools) are single-column content under the floating header with generous top padding for the pill.

- Density: compact coss controls (sm heights ~28–32px); comfortable gaps between sections (~16–24px).
- Header: centered floating pill (`rounded-full`, blurred card fill) — not a full-width top bar.
- Prompt bar docks under the stage as a wide rounded card; primary Generate sits inside it.
- Responsive: rails collapse behind handles on narrow widths; nav tabs scroll horizontally inside the pill.

### Named Rules

**The Stage Center Rule.** On Image (and future media) surfaces, the artwork owns the center; chrome and controls orbit it.

## Elevation & Depth

Hybrid: **tonal layering first**, soft shadows second. Surfaces are mostly flat at rest. The floating header uses a deeper shadow (`shadow-lg` + black/30) plus backdrop blur so it reads as chrome above the stage. Controls use hairline borders and tiny inset highlights (coss before-shadows), not stacked material cards.

### Shadow Vocabulary

- **Floating chrome** (`0 10px 15px -3px rgba(0,0,0,0.3)` family): Pill header only.
- **Control inset** (1px light/dark edge via before-pseudo): Buttons, inputs, selects at rest.
- **Overlay lift** (`shadow-lg/5`): Dialogs, menus, popovers.
- **Selection** (1–2px Acid Lime border): Gallery active thumb — not a drop shadow.

### Named Rules

**The Flat-By-Default Rule.** Prefer a tonal step or hairline over a new shadow. Shadows mark floating chrome or overlays, not every panel.

## Shapes

Base radius token `--radius: 0.625rem` (10px) → lg controls; sm/md for compact icon buttons; xl/2xl for dialogs and large cards; full for the nav pill, status dots, and some icon buttons.

Borders are soft hairlines on dark (`white/8`). Forms and lists favor gently rounded rectangles — no sharp editorial zero-radius, no playful mega-pills except the header and dots.

### Named Rules

**The Pill Is Special.** Full rounding is reserved for the floating nav (and small status dots). Do not pill every button.

## Components

### Buttons

Refined, restrained; primary is the bright exception.

- **Shape:** Gently curved (`rounded-lg` / 10px); icon-xs/sm may use `rounded-md`.
- **Primary:** Acid Lime fill, near-black text, light primary-tinted shadow; hover to ~90% opacity.
- **Outline / Secondary:** Input-wash fill, hairline border, Paper White text.
- **Ghost:** Transparent; Accent Wash on hover.
- **Focus:** Ring in Acid Lime (`ring` = primary), offset against background.
- **Destructive:** Red fill or destructive-outline for dangerous secondary actions.

### Inputs / Fields

- **Style:** Rounded-lg, Input Wash fill, hairline border, soft inset edge.
- **Focus:** Border + 3px ring using Acid Lime / ring token.
- **Error:** Destructive border/ring mix; helper text in destructive foreground.
- **Mono content:** Seeds, IDs, and URLs may render in Geist Mono inside otherwise Outfit UI.

### Cards / Containers

- **Corner Style:** xl for large panels; lg for nested wells.
- **Background:** Stage Ink on Void Black; Popover Ink for overlays.
- **Border:** Hairline; avoid double-boxing.
- **Internal Padding:** sm–lg rhythm (8–16px); section stacks with muted uppercase labels.

### Navigation

- Floating centered pill: brand mark (lime-tinted icon) + text tabs + settings.
- Inactive: Zinc Mute; hover → Paper White; active: Paper White + Acid Lime underline bar.
- Live activity: Acid Lime status dot on Downloads (or similar).

### Chips / Status

- **Ready:** Success green text/badge.
- **Working / transferring:** Muted copy + progress track.
- **Selected gallery thumb:** Acid Lime border; unselected stay quiet.

### Signature: Studio Stage

Three-rail media workspace with centered artwork, docked prompt card (blueprint chip, size, Enhance, Generate), Advanced sampling/refine/LoRA rail, and Image Gallery. Preserve image primacy and lime-only CTA emphasis when extending.

### Signature: Floating Pill Header

Blurred Stage Ink pill over content; never replace with a full-bleed opaque app bar without an explicit redesign.

## Do's and Don'ts

### Do:

- **Do** keep Acid Lime rare — primary actions, selection, and live status only (The Exposure Rule).
- **Do** build on Void → Stage → Popover tonal steps before adding shadows.
- **Do** center media on Image/Video/Audio surfaces; let chrome orbit the stage.
- **Do** use Outfit for UI and Geist Mono for machine values.
- **Do** stamp sections with small uppercase tracked labels.
- **Do** reuse coss control density (compact heights, soft inset edges, lime focus rings).

### Don't:

- **Don't** wash large regions in lime or add neon glow stacks.
- **Don't** introduce purple/indigo “AI product” gradients or glassmorphism for its own sake.
- **Don't** recreate Comfy node-graph visual language inside the studio.
- **Don't** make every control a pill; reserve full rounding for the header and dots.
- **Don't** treat the light theme as the default authority when inventing new studio UI.
- **Don't** fabricate brand illustrations or marketing chrome that fight the darkroom calm.
