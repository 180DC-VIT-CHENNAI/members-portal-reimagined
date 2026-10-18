# 180 Degrees Consulting VIT Chennai — Design System

## 0. Research Log

- Embedded refs: shortlisted `stripe.md`, `linear.app.md`, `vercel.md` → picked `soft-skill.md` (Layer A) + `stripe.md` (Layer B) because Stripe's weight-300 whisper authority, multi-layer chromatic shadows, and progressive tracking are the gold standard for premium consulting-grade web design; adapted from purple to green/white/black brand palette.
- Lazyweb: skipped — brand palette constraint (green/white/black only) and existing plan.md already define the section structure and color contract.
- Imagen drafts: skipped — the existing WebGL effects (MagicRings, ColorBends, VariableProximity) already provide the signature atmospheric moments; no new concept art needed.
- Skipped lanes: lazyweb (plan.md provides layout grammar), imagen (WebGL effects already exist).

## 1. Atmosphere & Identity

A quiet command center for social impact. The page feels like a premium editorial publication crossed with a precision-engineered instrument — surfaces float with soft, green-tinted ambient shadows, typography whispers at weight 200-300 with tight tracking, and every section breathes with macro-whitespace. The signature is **green-tinted depth**: shadows, glows, and atmospheric layers carry the brand color so elevation itself feels on-brand, not generic. The one moment a visitor remembers is the splash — variable-font typography that responds to cursor proximity over expanding WebGL rings, resolving into a hero split where a campus image sits in a double-bezel nested card. The overall impression reads as a $150k agency build for a consulting firm that means business about social impact.

## 2. Color

### Palette

| Role | Token | Light | Dark | Usage |
|------|-------|-------|------|-------|
| Surface/canvas | --surface-canvas | #FFFFFF | #0A0A0A | Main page background |
| Surface/soft | --surface-soft | #FAFAFA | #121212 | Alternating sections, subtle separation |
| Surface/elevated | --surface-elevated | #FFFFFF | #1A1A1A | Cards, modals, popovers |
| Surface/green-tint | --surface-green-tint | #F4F9E8 | #1A2410 | Subtle green-tinted backgrounds, stat cards |
| Text/primary | --text-primary | #0A0A0A | #FAFAFA | Headlines, body |
| Text/secondary | --text-secondary | #4A4A4A | #A8A8A8 | Captions, descriptions |
| Text/tertiary | --text-tertiary | #8A8A8A | #6A6A6A | Muted, disabled |
| Border/default | --border-default | #ECECEC | #2A2A2A | Standard dividers, card outlines |
| Border/subtle | --border-subtle | #F5F5F5 | #1E1E1E | Soft separations |
| Border/green | --border-green | rgba(141, 198, 63, 0.3) | rgba(141, 198, 63, 0.25) | Focus rings, active borders |
| Accent/primary | --accent-primary | #8DC63F | #8DC63F | Brand green, CTAs, links, interactive |
| Accent/hover | --accent-hover | #75A633 | #A8D96A | Hover state for green elements |
| Accent/soft | --accent-soft | rgba(141, 198, 63, 0.08) | rgba(141, 198, 63, 0.12) | Subtle green backgrounds, badges |
| Accent/glow | --accent-glow | rgba(141, 198, 63, 0.15) | rgba(141, 198, 63, 0.2) | Shadow tint, glow effects |
| Green ramp/1 | --green-50 | #F4F9E8 | #1A2410 | Lightest green tint |
| Green ramp/2 | --green-100 | #E8F5D0 | #2A3315 | Light green surfaces |
| Green ramp/3 | --green-200 | #C8E896 | #3D4D1F | Green accents, badges |
| Green ramp/4 | --green-300 | #A8D96A | #5A7A2E | Hover greens, decorative |
| Green ramp/5 | --green-500 | #8DC63F | #8DC63F | Brand anchor |
| Green ramp/6 | --green-600 | #75A633 | #9DDC4F | Darker brand, active states |
| Green ramp/7 | --green-700 | #5A8A1F | #7AB830 | Deep green, dark sections |
| Green ramp/8 | --green-900 | #3D6610 | #4A7A1A | Darkest green, footer bands |
| Status/error | --status-error | #DC2626 | #EF4444 | Errors |
| Status/success | --status-success | #16A34A | #22C55E | Confirmations |
| Status/warning | --status-warning | #D97706 | #F59E0B | Cautions |

### Rules
- Surface hierarchy creates depth through tonal shifts + green-tinted shadows. Never use hard-offset shadows (4px 4px 0).
- Accent green is used for interactive elements, CTAs, and brand moments. Never decorative-only green outside the ramp.
- Never introduce a color not in this table. Extend the table first.
- Dark mode inverts surfaces and text but keeps the green ramp intact — green is the brand anchor in both modes.

## 3. Typography

### Scale

| Level | Size | Weight | Line Height | Tracking | Usage |
|-------|------|--------|-------------|----------|-------|
| Display/hero | clamp(2.75rem, 6vw, 4.5rem) | 200 | 1.05 | -0.03em | Splash title, hero headline |
| Display/serif | clamp(2rem, 4vw, 3rem) | 400 | 1.15 | -0.01em | Editorial moments, quotes (Instrument Serif) |
| H1 | clamp(2rem, 4vw, 3rem) | 300 | 1.1 | -0.02em | Section headers |
| H2 | clamp(1.5rem, 3vw, 2rem) | 400 | 1.2 | -0.015em | Subsection headers |
| H3 | 1.25rem | 500 | 1.3 | -0.01em | Card titles |
| Body/lg | 1.125rem | 300 | 1.6 | 0 | Lead paragraphs, hero subtitle |
| Body | 1rem | 400 | 1.6 | 0 | Default text |
| Body/sm | 0.875rem | 400 | 1.5 | 0 | Secondary info, descriptions |
| Caption | 0.75rem | 500 | 1.4 | 0.02em | Labels, metadata |
| Overline | 0.6875rem | 600 | 1.3 | 0.12em | Eyebrow tags, section labels — uppercase |

### Font Stack
- **Primary (Grotesk)**: "Plus Jakarta Sans", system-ui, sans-serif — all UI, headings, body
- **Display Serif**: "Instrument Serif", Georgia, serif — editorial moments, large quotes, splash accent
- **Mono**: "JetBrains Mono", monospace — code (if needed)

### Rules
- Max 2 font families: Plus Jakarta Sans (primary) + Instrument Serif (editorial accent only).
- Body text never below 14px (0.875rem).
- Headings use weight 200-400 (whisper authority). Never 700+ for display text.
- Progressive tracking: tighter at larger sizes (-0.03em at display, 0 at body).
- Use `clamp()` for all display sizes to ensure smooth responsive scaling.
- Headings wrapping to 4+ lines are too large — reduce size.

## 4. Spacing & Layout

### Base Unit
All spacing derives from a base of **4px**.

| Token | Value | Usage |
|-------|-------|-------|
| --space-1 | 4px | Tight: icon-to-label |
| --space-2 | 8px | Compact: inline groups |
| --space-3 | 12px | Default: form field padding |
| --space-4 | 16px | Standard: card padding inner |
| --space-5 | 20px | Comfortable: section inner |
| --space-6 | 24px | Generous: card padding default |
| --space-8 | 32px | Separated: between card groups |
| --space-10 | 40px | Section sub-blocks |
| --space-12 | 48px | Major section breaks |
| --space-16 | 64px | Section vertical rhythm |
| --space-20 | 80px | Large section gaps |
| --space-24 | 96px | Hero spacing |
| --space-32 | 128px | Maximum section separation |

### Grid
- Max content width: 1280px (container)
- Reading width: 720px (long-form text)
- Card grid: `repeat(auto-fit, minmax(min(320px, 100%), 1fr))` — responsive without media queries
- Breakpoints: sm 640px, md 768px, lg 1024px, xl 1280px, 2xl 1536px

### Rules
- Section vertical padding: `clamp(4rem, 10vw, 8rem)` — macro-whitespace, the design breathes heavily.
- Container padding: `clamp(1rem, 4vw, 2rem)` horizontal.
- Asymmetric spacing is intentional — the editorial split hero uses unequal columns.
- Use `min-h-[100dvh]` for full-height sections, never `h-screen` (iOS Safari jumps).

## 5. Components

### Button (Primary)
- **Structure**: `<a>` or `<button>` with nested trailing-icon circle for CTAs
- **Variants**: primary (green bg), ghost (transparent, green border), text (no bg, green text)
- **Spacing**: px-6 py-3 (primary), px-5 py-2.5 (compact)
- **States**: default, hover (bg darkens, icon translates), active (scale 0.98), focus (2px green ring), disabled (opacity 0.5)
- **Accessibility**: keyboard reachable, focus ring visible, aria-label on icon-only
- **Motion**: `transition: all 300ms cubic-bezier(0.32, 0.72, 0, 1)`; hover: background darkens, trailing icon circle translates diagonally + scales; active: scale 0.98
- **Layout**: inline-flex cluster

### Button-in-Button (Trailing Icon)
- **Structure**: Icon inside its own `w-8 h-8 rounded-full` wrapper, flush with button's right padding
- **States**: inherits parent hover — translates `translate-x-0.5 -translate-y-px` and scales `1.05`
- **Motion**: 300ms cubic-bezier(0.32, 0.72, 0, 1)

### Card (Double-Bezel)
- **Structure**: Outer shell (subtle bg, hairline border, large radius `rounded-[1.5rem]`, p-1.5) → Inner core (distinct bg, inset highlight shadow, smaller radius `rounded-[1.125rem]`)
- **Variants**: default (white on white/5), green-tint (surface-green-tint), elevated (shadow level 3)
- **States**: default, hover (shadow intensifies, slight translateY(-2px)), active (scale 0.99)
- **Accessibility**: if interactive, keyboard reachable with focus ring
- **Motion**: `transition: all 400ms cubic-bezier(0.32, 0.72, 0, 1)`; hover: shadow grows, translateY(-2px)
- **Layout**: grid item or standalone block

### Navigation (Fluid Island Pill)
- **Structure**: Floating glass pill (`position: fixed`, `top: 1.5rem`, centered, `max-width: fit-content`), backdrop-blur-xl, subtle border, green-tinted shadow
- **Variants**: desktop (full pill with links), mobile (compact pill with hamburger)
- **States**: default (glass), scrolled (shadow intensifies), link hover (green-soft bg, green text), link active (green bg, white text)
- **Accessibility**: nav landmark, aria-label, keyboard reachable links, focus ring
- **Motion**: 400ms cubic-bezier(0.32, 0.72, 0, 1); mobile menu: staggered reveal with `translate-y-12 opacity-0` → `translate-y-0 opacity-100`

### Eyebrow Tag
- **Structure**: Pill-shaped badge before H1/H2 — `px-3 py-1 text-[0.6875rem] uppercase tracking-[0.12em] font-semibold`
- **Variants**: green (accent-soft bg, green-600 text), neutral (surface-soft bg, text-secondary)
- **States**: static (no hover)
- **Layout**: inline-block, mb-4

### Stat Card
- **Structure**: Double-bezel card with large display number + label
- **Variants**: default (green-tint bg), featured (green-50 bg + green border)
- **States**: default, hover (shadow lift)
- **Motion**: scroll reveal with fade-up

### Section Header
- **Structure**: Eyebrow tag → H1/H2 → optional description paragraph
- **Layout**: stack, max-width 720px for description

### Input Field
- **Structure**: Label (text-sm, text-secondary) → input (border-default, radius 0.75rem, px-4 py-3)
- **States**: default, focus (green border + green glow ring), error (red border), disabled
- **Motion**: 200ms ease-out on border/shadow

### Portal task activity
- A task's Activity disclosure opens a neutral, hairline-separated panel, using the existing 16px spacing step, stack, segmented radios, fields and buttons.
- Comments and History are alternate views. Opening loads the current page; Newer/Older page controls and Refresh remain keyboard reachable.
- All comment content is plain text and wraps, including long unbroken text. Removal uses the existing destructive confirmation dialog.
- Loading, empty and retryable error states use the shared portal primitives; access-denied refreshes clear private content.

### Portal official documents
- The Letter Studio editor reuses the portal cards, fields, dialogs, badges and responsive tables. The entire studio and PDF engines are lazy-loaded.
- Document pages are white A4 paper with fixed physical geometry and legacy letterhead artwork, independent of UI theme and phone width. All document CSS is isolated below `.letter-document`; never style global `.page`, `html` or `body` from the portal stylesheet.
- Visible previews scale a clone only. Measurement and PDF capture use an unscaled offscreen tree after fonts/images are ready. Content/signature overflow must paginate or fail explicitly, never silently clip.
- PDF save freezes bytes plus metadata. Send operates only on a selected saved version and uses the existing confirmation/dialog primitives. Open/print links always use permission-checked private file URLs.

## 6. Motion & Interaction

### Timing

| Type | Duration | Easing | Usage |
|------|----------|--------|-------|
| Micro | 120ms | ease-out | Button press, toggle |
| Standard | 250ms | cubic-bezier(0.32, 0.72, 0, 1) | Panel open, tab switch, link hover |
| Emphasis | 500ms | cubic-bezier(0.16, 1, 0.3, 1) | Page transition, hero entry |
| Scroll-driven | tied to scroll | linear | Parallax, progress, reveal |

### Rules
- Only animate `transform` and `opacity`. Never animate `width`, `height`, `top`, `left`, `margin`, `padding`.
- Every interactive element has hover + active + focus states.
- Scroll-triggered animations use `IntersectionObserver` or GSAP ScrollTrigger (already integrated).
- Reduced motion: respect `prefers-reduced-motion` — disable non-essential animation.
- Entry animations: elements fade-up from `translateY(2rem) opacity(0)` to `translateY(0) opacity(1)` over 500-800ms with stagger.
- Magnetic hover: buttons and cards translate slightly toward cursor on hover (via GSAP, already available).
- WebGL effects (MagicRings, ColorBends, VariableProximity) are signature moments — keep them, refine their color parameters to the green ramp.

## 7. Depth & Surface

### Strategy: Mixed (shadows + tonal-shift + hairline borders)

| Level | Value | Usage |
|-------|-------|-------|
| Subtle | `0 1px 2px rgba(141, 198, 63, 0.04), 0 1px 3px rgba(0, 0, 0, 0.03)` | Cards at rest |
| Default | `0 4px 12px rgba(141, 198, 63, 0.06), 0 2px 4px rgba(0, 0, 0, 0.04)` | Elevated cards, inputs focus |
| Ambient | `0 8px 24px rgba(141, 198, 63, 0.08), 0 4px 8px rgba(0, 0, 0, 0.04)` | Standard cards, dropdowns |
| Elevated | `0 16px 40px rgba(141, 198, 63, 0.10), 0 8px 16px rgba(0, 0, 0, 0.06)` | Featured cards, hover states |
| Prominent | `0 24px 56px rgba(141, 198, 63, 0.14), 0 12px 24px rgba(0, 0, 0, 0.08)` | Modals, floating panels, nav |
| Focus ring | `0 0 0 3px rgba(141, 198, 63, 0.3)` | Keyboard focus on interactive elements |

### Shadow Philosophy
Green-tinted chromatic depth. Where most sites use neutral gray shadows, our primary shadow color carries the brand green (`rgba(141, 198, 63, ...)`). This creates shadows that don't just add depth — they add brand atmosphere. The multi-layer approach pairs a green-tinted far shadow with a neutral near shadow, creating parallax-like depth. Negative spread values ensure shadows don't extend beyond the element's footprint horizontally.

### Border Usage
Hairline borders (`1px solid var(--border-default)`) on cards at rest, replaced by shadows on hover. Never thick (3px+) borders. Never dashed borders (except for drop zones/placeholders). The double-bezel pattern uses a hairline outer border + inset highlight for the nested architecture.

## 8. Accessibility Constraints & Accepted Debt

### Constraints
- WCAG target: 2.2 AA — contrast floor 4.5:1 body / 3:1 large text.
- Visible focus on every interactive element (3px green ring).
- Full keyboard reachability — tab order follows visual order.
- `prefers-reduced-motion` respected — disable WebGL animations and scroll-triggered reveals.
- All images have alt text. Decorative SVGs have `aria-hidden="true"`.
- Semantic HTML: `<nav>`, `<main>`, `<section>`, `<header>`, `<footer>`, `<button>`, `<a>`.

### Accepted Debt
| Item | Location | Why accepted | Owner / Exit |
|------|----------|--------------|--------------|
| ConsultingBoy cartoon character | ConsultingBoy.tsx | Existing feature — will refine styling but keep character | Next iteration |
| PolaroidGallery hand-drawn aesthetic | gallery/PolaroidGallery.tsx | Isolated to Globe section campus panel — low visibility | When Globe section is redesigned |
| OrgChart card variants | orgchart/OrgChart.css | Isolated to leadership section — will refine but keep structure | Next iteration |
| Members admin area | pages/members/ | Admin-only, not public-facing — lower priority | Separate admin redesign |
| Chat widget | components/chat/ | Third-party-style widget — refine but keep functionality | Next iteration |
