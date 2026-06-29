---
# ═══════════════════════════════════════════════════════════════════════════════
# OPERIUM DESIGN SYSTEM — design.md
# ═══════════════════════════════════════════════════════════════════════════════
#
# Single source of truth for Operium's visual design language.
# Derived entirely from the login/signup pages — the gold standard of the brand.
#
# Structure:
#   - YAML front matter → machine-readable design tokens (for AI agents)
#   - Markdown body     → human-readable usage guidelines & constraints
#
# Created: 2026-06-22
# Source:  apps/web/src/app/(auth)/login/page.tsx + globals.css lines 1–501
# ═══════════════════════════════════════════════════════════════════════════════

name: Operium Design System
version: 2.0.0
theme: dark-first
color_scheme: dark
css_methodology: vanilla-css    # No Tailwind for component styles. BEM-like with lf- and db- prefixes.

# ── BRAND IDENTITY ──────────────────────────────────────────────────────────
brand:
  name: Operium
  tagline: "Persistent memory for your AI coding assistant"
  logo-mark:
    content: "O"
    size: "42×42px"
    radius: "11px"
    background: "linear-gradient(140deg, #7c3aed 0%, #4338ca 100%)"
    box-shadow: "0 0 0 1px rgba(139,92,246,0.35), 0 6px 20px rgba(99,40,215,0.3), inset 0 1px 1px rgba(255,255,255,0.2)"
    font-weight: 800
    letter-spacing: "-0.02em"
  hero-image:
    file: "/auth-bg.png"
    description: "Bioluminescent neural network tendrils — violet/indigo/cyan on deep black void"
    dominant-colors: ["#7c3aed", "#4338ca", "#6d28d9", "#0f0a1e"]

# ── COLOR TOKENS ────────────────────────────────────────────────────────────
colors:
  # Surface ladder (darkest → lightest)
  s0: "#09090b"           # Page base / root background
  s1: "#111113"           # Card surface / sidebar
  s2: "#18181b"           # Elevated surface
  s3: "#232329"           # Hover / pressed state

  # Auth-specific surfaces
  auth-page-bg: "#050505"       # Login/signup full-page background
  auth-form-bg: "#0c0c0f"       # Right panel (form area)
  auth-form-radial: "radial-gradient(ellipse 60% 50% at 60% 50%, rgba(109,40,217,0.05) 0%, transparent 100%)"
  input-bg: "#141418"           # Input field resting state
  input-bg-focus: "#18181c"     # Input field hover/focus state

  # Borders
  border-subtle: "#1e1e24"
  border-default: "#2e2e36"
  border-strong: "#3f3f46"
  border-input: "#2a2a35"       # Input/button borders
  border-input-hover: "#383845" # Input hover border

  # Text
  text-primary: "#fafafa"
  text-secondary: "#a1a1aa"
  text-muted: "#63637a"
  text-placeholder: "#55556a"
  text-placeholder-focus: "#424255"
  text-label-focus: "#d4d4d8"   # Label when input is focused

  # Accent (violet)
  accent: "#8b5cf6"
  accent-hover: "#7c3aed"
  accent-deep: "#4338ca"
  accent-glow-16: "rgba(139, 92, 246, 0.16)"  # Focus ring
  accent-glow-15: "rgba(139, 92, 246, 0.15)"  # Checkbox hover
  accent-glow-12: "rgba(124, 58, 237, 0.12)"  # Ambient blob
  accent-link-hover: "#a78bfa"                 # Link hover

  # Semantic
  error: "#ef4444"
  error-bg: "rgba(220, 38, 38, 0.12)"
  error-border: "rgba(220, 38, 38, 0.3)"
  error-title: "#fca5a5"
  error-body: "#f87171"
  error-glow: "rgba(239, 68, 68, 0.14)"
  success: "#22c55e"
  warning: "#f59e0b"

  # Gradients
  logo-gradient: "linear-gradient(140deg, #7c3aed 0%, #4338ca 100%)"
  submit-gradient: "linear-gradient(160deg, rgba(109,40,217,0.55) 0%, rgba(67,56,202,0.45) 100%)"
  submit-gradient-hover: "linear-gradient(160deg, rgba(124,58,237,0.7) 0%, rgba(79,70,229,0.6) 100%)"
  shimmer-gradient: "linear-gradient(to right, transparent, rgba(255,255,255,0.1), transparent)"
  divider-left: "linear-gradient(to left, #2e2e36, transparent)"
  divider-right: "linear-gradient(to right, #2e2e36, transparent)"
  vignette-top: "linear-gradient(to bottom, rgba(6,0,18,0.6) 0%, transparent 100%)"
  vignette-bottom: "linear-gradient(to bottom, transparent 0%, rgba(6,0,18,0.82) 100%)"
  tagline-radial: "radial-gradient(ellipse 70% 60% at 50% 50%, rgba(0,0,0,0.65) 0%, transparent 100%)"

# ── TYPOGRAPHY ──────────────────────────────────────────────────────────────
typography:
  font-families:
    display: "'Inter', system-ui, sans-serif"
    mono: "'JetBrains Mono', ui-monospace, monospace"
  font-weights:
    regular: 400
    medium: 500
    semibold: 600
    bold: 700
    extrabold: 800
  font-rendering:
    - "-webkit-font-smoothing: antialiased"
    - "-moz-osx-font-smoothing: grayscale"
    - "font-variant-numeric: tabular-nums"
  type-scale:
    page-heading: { size: "30px", weight: 700, tracking: "-0.028em", line-height: 1.15 }
    tagline: { size: "26px", weight: 500, tracking: "-0.01em", line-height: 1.4 }
    body: { size: "14px", weight: 400, tracking: "0" }
    label: { size: "13px", weight: 500, tracking: "0.005em" }
    error-title: { size: "13px", weight: 600 }
    error-body: { size: "12px", weight: 400, line-height: 1.55 }
    divider: { size: "11px", weight: 600, tracking: "0.1em" }
    footer: { size: "13px", weight: 400 }
    link: { size: "13px", weight: 500 }

# ── SPACING ─────────────────────────────────────────────────────────────────
spacing:
  base: "4px"
  form-gap: "14px"       # Gap between form fields
  group-gap: "6px"       # Gap between label and input
  section-margin: "26px" # OAuth row margin-bottom
  form-wrap-max: "392px" # Max width of form container
  auth-padding: "40px 32px"

# ── BORDER RADIUS ───────────────────────────────────────────────────────────
radii:
  input: "9px"
  button: "9px"
  logo: "11px"
  alert: "10px"
  oauth: "14px"
  checkbox: "4px"
  eye-btn: "4px"

# ── SIZING ──────────────────────────────────────────────────────────────────
sizing:
  input-height: "44px"
  submit-height: "44px"
  oauth-btn: "56×56px"
  logo-mark: "42×42px"
  checkbox: "15×15px"
  icon-small: "16px"
  icon-medium: "18px"
  icon-large: "22px"

# ── ANIMATIONS ──────────────────────────────────────────────────────────────
animations:
  fadeUp:
    from: "opacity: 0; transform: translateY(16px)"
    to: "opacity: 1; transform: translateY(0)"
    duration: "0.7s"
    easing: "cubic-bezier(0.16, 1, 0.3, 1)"
  breathe:
    keyframes: "scale(1)/opacity(0.7) → scale(1.05)/opacity(1) → scale(1)/opacity(0.7)"
    duration: "8s"
    easing: "ease-in-out"
    loop: true
  shine:
    description: "Shimmer sweep across submit button on hover"
    duration: "1.5s"
    easing: "ease"
  spin:
    description: "Loading spinner rotation"
    duration: "0.75s"
    easing: "linear"
    loop: true
  transitions:
    color: "200ms ease"
    border: "200ms ease"
    background: "200ms ease"
    box-shadow: "200ms ease"
    transform-bounce: "200ms cubic-bezier(0.34, 1.56, 0.64, 1)"
    submit-shadow: "250ms cubic-bezier(0.34, 1.56, 0.64, 1)"
    logo-transform: "300ms cubic-bezier(0.34, 1.56, 0.64, 1)"

# ── SHADOWS ─────────────────────────────────────────────────────────────────
shadows:
  logo:
    rest: "0 0 0 1px rgba(139,92,246,0.35), 0 6px 20px rgba(99,40,215,0.3), inset 0 1px 1px rgba(255,255,255,0.2)"
    hover: "0 0 0 1px rgba(139,92,246,0.5), 0 8px 24px rgba(99,40,215,0.4), inset 0 1px 1px rgba(255,255,255,0.3)"
  input-focus: "0 0 0 3px rgba(139,92,246,0.16), 0 2px 8px rgba(0,0,0,0.2) inset"
  input-error: "0 0 0 3px rgba(239,68,68,0.14)"
  submit:
    rest: "0 1px 0 rgba(255,255,255,0.06) inset, 0 4px 16px rgba(99,40,215,0.2)"
    hover: "0 1px 0 rgba(255,255,255,0.08) inset, 0 6px 20px rgba(99,40,215,0.35), 0 0 0 2px rgba(139,92,246,0.15)"
  oauth-hover: "0 6px 16px rgba(0,0,0,0.2)"
  link-glow: "0 0 8px rgba(139,92,246,0.4)"
  checkbox-hover: "0 0 0 2px rgba(139,92,246,0.15)"
  tagline-text: "0 2px 8px rgba(0,0,0,0.8)"

# ── BREAKPOINTS ─────────────────────────────────────────────────────────────
breakpoints:
  md: "768px"  # Left panel appears at this width

---

# Operium Design System v2

> **Persistent memory for your AI coding assistant — for you and your team.**

This document is the single source of truth for the Operium visual language. It is derived entirely from the login/signup pages — the brand's gold-standard UI — and must be used as the foundation for every new page and component.

---

## 1. Design Philosophy

Operium's visual identity is inspired by **bioluminescent neural networks** — the hero image (`auth-bg.png`) shows glowing violet/indigo tendrils branching through deep black space. This metaphor of "living connections in the dark" shapes every design decision.

### Five Pillars

| Principle | Description |
|---|---|
| **Abyss Void** | Backgrounds are ultra-deep blacks (`#050505`, `#09090b`, `#0c0c0f`). Never pure `#000000`. The slight blue-purple tint creates warmth. |
| **Violet Luminescence** | The accent color `#8b5cf6` and its gradients (`#7c3aed → #4338ca`) are used *sparingly* — only for the logo, submit buttons, focus rings, links, and ambient glow. |
| **Ambient Atmosphere** | A breathing violet glow blob (`login-glow`) animates slowly behind the form. This creates depth and life without being distracting. |
| **Cinematic Imagery** | The left panel uses a full-bleed neural network image with dark vignette overlays. Text floats over it with a radial gradient halo for readability. |
| **Craft in Every Pixel** | Every input, button, and link has carefully tuned hover/focus/active/disabled states with unique shadows, transforms, and timing curves. |

### Hard Rules (Anti-Patterns)

- ❌ **Never use flat, unshadowed buttons.** Every interactive element has a hover lift, glow, or shadow transition.
- ❌ **Never use generic Tailwind colors** (`blue-500`, `slate-800`). Use the exact hex values from the YAML tokens above.
- ❌ **Never use `border-radius: 50%` on non-avatar elements.** Buttons use `9px`, cards use `10–11px`, OAuth buttons use `14px`.
- ❌ **Never skip the `caret-color` on inputs.** It must be `var(--accent)` (`#8b5cf6`).
- ❌ **Never use `box-shadow` without `inset` on the submit button.** The signature Operium button uses BOTH inset highlights AND outward violet glow.
- ❌ **Never animate for decoration.** Every animation signals state (breathing glow = page is alive, fadeUp = content entered, shimmer = button is hoverable).

---

## 2. The Hero Image — `auth-bg.png`

The image is the emotional anchor of the brand. It depicts:

- **Content**: Bioluminescent neural network tendrils branching from a central synapse node
- **Color palette**: Deep violet (`#7c3aed`), indigo (`#4338ca`), soft cyan-blue, lavender wisps — all on an abyss-black (`#0f0a1e`) background
- **Mood**: Scientific, alive, mysterious, premium
- **Usage**: Full-bleed `object-fit: cover` in the 46%-width left panel. Two vignette gradients (top + bottom) darken the edges so the tagline text remains readable.

### Image-Derived Color Vocabulary

These colors were sampled from the image and should inform the broader UI palette:

| Name | Hex | Where in Image |
|---|---|---|
| Neural Violet | `#7c3aed` | Central tendril glow |
| Deep Indigo | `#4338ca` | Secondary branches |
| Synapse Core | `#c4b5fd` | Bright white-lavender at the node center |
| Ambient Purple | `#6d28d9` | Diffused background wash |
| Void Black | `#0f0a1e` | Deep background between tendrils |
| Cyan Whisper | `#818cf8` | Faint highlights on thinner branches |

---

## 3. Color System

### Surface Ladder

```
Level  │  Token   │  Hex       │  Usage
───────┼──────────┼────────────┼────────────────────────────────
  -1   │  auth    │  #050505   │  Auth page full-page bg
   0   │  --s0    │  #09090b   │  App root bg, page base
   1   │  --s1    │  #111113   │  Card surface, sidebar
   2   │  --s2    │  #18181b   │  Elevated surface (hover bg)
   3   │  --s3    │  #232329   │  Pressed / active state bg
  form │  auth-r  │  #0c0c0f   │  Login right panel
 input │  input   │  #141418   │  Input field resting bg
 i-foc │  i-focus │  #18181c   │  Input field hover/focus bg
```

### Border System

| Token | Value | Usage |
|---|---|---|
| `--border-subtle` | `#1e1e24` | Card edges, dividers |
| `--border-default` | `#2e2e36` | Default component borders |
| `--border-strong` | `#3f3f46` | Strong emphasis borders |
| Input border | `#2a2a35` | Input/OAuth button resting |
| Input border hover | `#383845` | Input hover |
| Accent border | `rgba(139,92,246,0.25)` | Submit button |
| Accent border hover | `rgba(139,92,246,0.4)` | Submit button hover |
| Error border | `rgba(220,38,38,0.3)` | Error alert |

### Accent Gradients

| Name | CSS | Usage |
|---|---|---|
| Logo | `linear-gradient(140deg, #7c3aed, #4338ca)` | Logo mark background |
| Submit (rest) | `linear-gradient(160deg, rgba(109,40,217,0.55), rgba(67,56,202,0.45))` | Submit button |
| Submit (hover) | `linear-gradient(160deg, rgba(124,58,237,0.7), rgba(79,70,229,0.6))` | Submit hover |
| Shimmer | `linear-gradient(to right, transparent, rgba(255,255,255,0.1), transparent)` | Button sweep animation |
| Ambient glow | `radial-gradient(circle, rgba(124,58,237,0.12), transparent 65%)` | Breathing blob |
| Form radial | `radial-gradient(ellipse 60% 50%, rgba(109,40,217,0.05), transparent)` | Subtle purple tint on right panel |

---

## 4. Typography

### Font Stack

| Context | Family | Loaded Via |
|---|---|---|
| **All UI** | `Inter` (400, 500, 600, 700) | Google Fonts import in globals.css |
| **Code / Technical** | `JetBrains Mono` (400, 500) | Google Fonts import in globals.css |

### Type Scale

| Element | Size | Weight | Tracking | Line Height |
|---|---|---|---|---|
| Page heading | `30px` | `700` | `-0.028em` | `1.15` |
| Tagline (over image) | `26px` | `500` | `-0.01em` | `1.4` |
| Body / Input text | `14px` | `400` | — | — |
| Labels | `13px` | `500` | `0.005em` | — |
| Error title | `13px` | `600` | — | — |
| Error body | `12px` | `400` | — | `1.55` |
| Divider text ("OR") | `11px` | `600` | `0.1em` | — |
| Footer / links | `13px` | `500` | — | — |

### Text Colors

| Usage | Value |
|---|---|
| Primary (headings, values) | `#fafafa` (`--text-primary`) |
| Secondary (labels, body) | `#a1a1aa` (`--text-secondary`) |
| Muted (meta, disabled) | `#63637a` (`--text-muted`) |
| Placeholder (resting) | `#55556a` |
| Placeholder (focused) | `#424255` |
| Label (when focused) | `#d4d4d8` |
| Links | `#8b5cf6` (`--accent`) |
| Links (hover) | `#a78bfa` + `text-shadow: 0 0 8px rgba(139,92,246,0.4)` |
| Error title | `#fca5a5` |
| Error body | `#f87171` |
| Submit button | `rgba(255,255,255,0.92)` |

---

## 5. Layout — Auth Pages

### Two-Column Split

```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│   ┌────────────────────┬──────────────────────────┐     │
│   │  LEFT PANEL (46%)  │   RIGHT PANEL (flex: 1)  │     │
│   │                    │                          │     │
│   │  auth-bg.png       │   .login-glow (ambient)  │     │
│   │  (object-fit:cover)│                          │     │
│   │                    │   ┌──────────────────┐   │     │
│   │  ┌──────────────┐  │   │  .login-form-wrap│   │     │
│   │  │ Vignette Top │  │   │  max-w: 392px    │   │     │
│   │  └──────────────┘  │   │                  │   │     │
│   │                    │   │  [O] Logo mark   │   │     │
│   │  "Unlock the       │   │  Welcome back    │   │     │
│   │   potential of     │   │                  │   │     │
│   │   persistent AI    │   │  [Email input]   │   │     │
│   │   memory."         │   │  [Password input]│   │     │
│   │                    │   │  [Remember] [Fgt]│   │     │
│   │  ┌──────────────┐  │   │  [Sign in btn]   │   │     │
│   │  │ Vignette Bot │  │   │  ──── OR ────    │   │     │
│   │  └──────────────┘  │   │  [GH]  [Google]  │   │     │
│   │                    │   │  Sign up link     │   │     │
│   │                    │   │                  │   │     │
│   │                    │   └──────────────────┘   │     │
│   │  display:none      │                          │     │
│   │  below 768px       │  bg: #0c0c0f + radial   │     │
│   └────────────────────┴──────────────────────────┘     │
│                                                         │
│  Root bg: #050505                                       │
└─────────────────────────────────────────────────────────┘
```

- **Left panel** is `flex: 0 0 46%`, hidden below `768px`
- **Right panel** is `flex: 1`, centered content, `padding: 40px 32px`
- Form container max-width: `392px`
- The ambient glow blob is `500×500px`, positioned at `top: 45%; left: 50%` with the `breathe` animation

---

## 6. Component Patterns

### Logo Mark

```css
width: 42px; height: 42px;
border-radius: 11px;
background: linear-gradient(140deg, #7c3aed, #4338ca);
box-shadow: 0 0 0 1px rgba(139,92,246,0.35),
            0 6px 20px rgba(99,40,215,0.3),
            inset 0 1px 1px rgba(255,255,255,0.2);
font: 800 19px Inter; color: #fff; letter-spacing: -0.02em;

/* Hover: playful micro-interaction */
transform: scale(1.05) rotate(-2deg);
/* Enhanced glow on hover */
```

### Input Fields

```css
/* Resting */
height: 44px; padding: 0 14px;
border-radius: 9px;
border: 1px solid #2a2a35;
background: #141418;
color: var(--text-primary);
font-size: 14px;
caret-color: var(--accent);

/* Hover */
background: #18181c;
border-color: #383845;

/* Focus */
background: #18181c;
border-color: var(--accent);
box-shadow: 0 0 0 3px rgba(139,92,246,0.16),
            0 2px 8px rgba(0,0,0,0.2) inset;

/* Error */
border-color: var(--error);
box-shadow: 0 0 0 3px rgba(239,68,68,0.14);
```

### Submit Button (The Signature Element)

This is the most carefully crafted component. It uses a **translucent violet gradient** with `backdrop-filter`, an **inset white highlight**, an **outward violet glow**, and a **shimmer sweep animation** on hover.

```css
/* Resting */
height: 44px; border-radius: 9px;
border: 1px solid rgba(139,92,246,0.25);
background: linear-gradient(160deg, rgba(109,40,217,0.55), rgba(67,56,202,0.45));
backdrop-filter: blur(8px);
color: rgba(255,255,255,0.92);
font: 600 14px Inter; letter-spacing: 0.01em;
box-shadow: 0 1px 0 rgba(255,255,255,0.06) inset,
            0 4px 16px rgba(99,40,215,0.2);

/* Hover */
background: linear-gradient(160deg, rgba(124,58,237,0.7), rgba(79,70,229,0.6));
border-color: rgba(139,92,246,0.4);
box-shadow: 0 1px 0 rgba(255,255,255,0.08) inset,
            0 6px 20px rgba(99,40,215,0.35),
            0 0 0 2px rgba(139,92,246,0.15);
transform: translateY(-1px);

/* Active */
transform: translateY(1px) scale(0.985);

/* Shimmer (::after pseudo-element on hover) */
animation: shine 1.5s ease;  /* sweeps left→right */
```

### OAuth Buttons

```css
width: 56px; height: 56px;
border-radius: 14px;
border: 1px solid #2a2a35;
background: #141418;

/* Hover */
background: #1e1e26;
border-color: #38384a;
transform: translateY(-2px);
box-shadow: 0 6px 16px rgba(0,0,0,0.2);

/* Active */
transform: translateY(1px) scale(0.95);
```

### Alert (Error Banner)

```css
padding: 13px 16px; border-radius: 10px;
background: rgba(220,38,38,0.12);
border: 1px solid rgba(220,38,38,0.3);
/* Title: #fca5a5, Body: #f87171, Icon: #f87171 */
animation: fadeUp 0.4s cubic-bezier(0.16,1,0.3,1) forwards;
```

### Divider ("OR" line)

```css
/* Left line:  linear-gradient(to left, #2e2e36, transparent) */
/* Right line: linear-gradient(to right, #2e2e36, transparent) */
/* Text: 11px, 600 weight, #55556a, letter-spacing: 0.1em */
margin: 20px 0 18px;
```

### Checkbox

```css
width: 15px; height: 15px;
border-radius: 4px;
accent-color: var(--accent);
border: 1px solid var(--border-default);
background: rgba(255,255,255,0.03);
backdrop-filter: blur(10px);

/* Hover */
transform: scale(1.05);
box-shadow: 0 0 0 2px rgba(139,92,246,0.15);
```

### Links

```css
color: var(--accent);  /* #8b5cf6 */
font-weight: 500;
text-decoration: none;

/* Hover */
color: #a78bfa;
text-shadow: 0 0 8px rgba(139,92,246,0.4);
```

---

## 7. Animation System

### Keyframes

| Name | Purpose | Duration | Easing |
|---|---|---|---|
| `fadeUp` | Content entrance (form wrap, error alert) | `0.7s` / `0.4s` | `cubic-bezier(0.16, 1, 0.3, 1)` |
| `breathe` | Ambient glow blob pulsing | `8s` (infinite) | `ease-in-out` |
| `shine` | Submit button shimmer sweep | `1.5s` | `ease` |
| `spin` | Loading spinner | `0.75s` (infinite) | `linear` |

### Transition Curves

| Element | Property | Duration | Easing |
|---|---|---|---|
| Inputs | border, shadow, bg | `200ms` | `ease` |
| Submit button | bg, border | `250ms` | `ease` |
| Submit button | box-shadow | `250ms` | `cubic-bezier(0.34, 1.56, 0.64, 1)` — bouncy |
| Submit button | transform | `150ms` | `ease` |
| Logo mark | transform | `300ms` | `cubic-bezier(0.34, 1.56, 0.64, 1)` — bouncy |
| Logo mark | box-shadow | `300ms` | `ease` |
| OAuth buttons | transform | `200ms` | `cubic-bezier(0.34, 1.56, 0.64, 1)` — bouncy |
| Links | color, text-shadow | `200ms` | `ease` |
| Labels | color | `200ms` | `ease` |
| Eye toggle | transform | `100ms` | `ease` |

---

## 8. Icon System

The login page uses **zero external icon libraries**. All icons are inline SVGs with consistent properties:

```
stroke="currentColor"
strokeWidth="2"
strokeLinecap="round"
strokeLinejoin="round"
fill="none" (except brand logos)
```

| Icon | Size | Purpose |
|---|---|---|
| Eye / EyeOff | `18×18` | Password visibility toggle |
| AlertCircle | `18×18` | Form error alert |
| TriangleAlert | `16×16` | Input field error indicator |
| Spinner | `16×16` | Loading state (0.75s spin) |
| GitHub | `22×22` | OAuth button (`fill="currentColor"`) |
| Google | `22×22` | OAuth button (multi-color fills) |

> **Rule for Dashboard**: When expanding to the dashboard, use Google **Material Symbols Rounded** (weight 300, FILL 0) for navigation and action icons. Keep inline SVGs for auth pages only.

---

## 9. CSS Architecture

### Methodology

The codebase uses **vanilla CSS with BEM-like prefixed namespaces**:

| Prefix | Scope | Example |
|---|---|---|
| `login-` | Auth page structural elements | `login-root`, `login-left`, `login-glow` |
| `lf-` | Login form elements | `lf-input`, `lf-btn-submit`, `lf-label` |
| `db-` | Dashboard elements (future) | `db-shell`, `db-sidebar`, `db-card` |

### File Organization

```
globals.css
├── Lines 1–7      → Font imports + Tailwind directives (base/components/utilities only)
├── Lines 8–37     → Design tokens (:root variables)
├── Lines 38–52    → Reset & base styles
├── Lines 53–501   → Login/Signup page CSS (login-* and lf-* classes)
├── Lines 502+     → Dashboard CSS (db-* classes)
```

### Tailwind Usage

Tailwind is imported (`@tailwind base/components/utilities`) but is **NOT used for login/signup/dashboard component styles**. It is available only for quick layout utilities in internal pages. All visual styling uses vanilla CSS classes from the prefixed namespaces.

---

## 10. Responsive Behavior

| Breakpoint | Behavior |
|---|---|
| `< 768px` | Left image panel hidden. Right panel fills 100% width. Form centers vertically. |
| `≥ 768px` | Two-column split: left 46%, right fills remainder. Image panel visible with vignettes. |

---

## 11. Extending to the Dashboard

When building dashboard pages, these tokens from the login page must be carried over:

| Login Element | Dashboard Equivalent |
|---|---|
| `#050505` / `#0c0c0f` bg | Page background, sidebar background |
| `#141418` input bg | Search bars, filter inputs |
| `#2a2a35` input border | Card borders, list item borders |
| `rgba(139,92,246,0.16)` focus glow | Active nav state, selected items |
| Logo gradient (`140deg, #7c3aed, #4338ca`) | Sidebar logo mark |
| `breathe` animation glow | Ambient blob behind main content |
| `fadeUp` entrance animation | Card entrance, staggered lists |
| `cubic-bezier(0.16, 1, 0.3, 1)` | All entrance animation easing |
| Inter 700 / -0.028em tracking | Dashboard page headings |
| JetBrains Mono 400 | Code snippets, hashes, metadata tags |

---

## 12. File Reference

```
apps/web/
├── public/
│   └── auth-bg.png                     # Neural network hero image (1.4MB)
├── src/app/
│   ├── globals.css                     # All design tokens + component CSS
│   ├── layout.tsx                      # Root layout (html.dark, metadata)
│   ├── (auth)/
│   │   ├── layout.tsx                  # Auth layout (pass-through)
│   │   ├── login/page.tsx              # Login page (276 lines)
│   │   └── signup/page.tsx             # Signup page (292 lines)
│   └── (dashboard)/
│       ├── layout.tsx                  # Dashboard shell (sidebar + header)
│       └── page.tsx                    # Dashboard home page
```
