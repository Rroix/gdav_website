# GD Avenue Web Aesthetics And Interface System

Last reviewed: September 20, 2026

This document is the implementation guide for the public GD Avenue website, the Avenue Guard status pages, the application experience, and the authenticated Staff Portal. It records the visual language, CSS architecture, interaction rules, responsive behavior, and accessibility expectations currently implemented in the repository.

The canonical CSS remains in the source files. This guide explains how those styles fit together and which file owns each visual decision.

## Source Of Truth

| Surface | Primary files | Purpose |
|---|---|---|
| Public website | `styles.css` | Rules, generator, About Us, privacy, Avenue Guard status, and the public recommendation detail page |
| Staff and applications | `staff/staff.css` | Discord sign-in, application chooser/forms/status, and every Staff Portal module |
| Public level directory | `levels/public-levels.css` | Compact additions for `/levels/`; inherits the Staff Portal tokens loaded before it |
| Shared public status logic | `bot-core.js`, `bot.js` | Relative time, health-history normalization, system states, and canvas graphs |
| Page-specific behavior | `about.js`, `generator.js`, `level.js`, `levels/levels.js`, `apply/apply.js`, `staff/staff.js` | Data loading and interaction behavior; these files should not introduce unrelated visual tokens |

## Product Character

The public site is calm, dark, and editorial. Content has generous breathing room, clear page-level hierarchy, and restrained elevated surfaces. It is designed for reading rather than for looking like a software dashboard.

The Staff Portal is a dense operational workspace. It uses flatter sections, compact tables, stable controls, and short travel distances. It must feel practical during repeated daily use. Decorative cards, oversized headings, and marketing composition do not belong in the portal.

Across both systems:

- Information hierarchy comes from spacing, type weight, borders, and surface contrast.
- Color communicates state. It is not used as decoration.
- Controls use familiar shapes and explicit labels.
- Layout dimensions are stable so loading, hover, and dynamic status changes do not shift nearby content.
- Text must remain readable without relying on color alone.

## Public-Site Tokens

Defined in `styles.css`:

| Token | Value | Use |
|---|---|---|
| `--bg` | `#0b0b0c` | Page background |
| `--bg-elev` | `#111214` | Primary public surfaces |
| `--bg-soft` | `#17181b` | Secondary surface and navigation hover |
| `--bg-hover` | `#1d1f23` | Interactive hover state |
| `--text` | `#f2f2f3` | Primary copy |
| `--muted` | `#b3b7bf` | Supporting copy and metadata |
| `--line` | `#2a2d33` | Standard dividers and borders |
| `--line-strong` | `#3a3e46` | Inputs and emphasized boundaries |
| `--accent` | `#f2f2f3` | Neutral public accent |
| `--maxw` | `920px` | Default public content width |
| `--radius` | `14px` | Public surface radius |
| `--shadow` | `0 1px 2px rgba(0,0,0,.28)` | Default surface depth |
| `--shadow-soft` | `0 8px 22px rgba(0,0,0,.22)` | Elevated interactive depth |
| `--t-fast` | `140ms` | Hover/focus transitions |
| `--t-med` | `220ms` | Larger interface transitions |

The public palette is intentionally neutral. Health visualization adds semantic green `#52d273`, amber `#f2c14e`, and red `#f16b74`. The status chart line uses `#58d5ba`. These colors are reserved for meaning and should always be paired with text or an accessible label.

## Staff And Application Tokens

Defined in `staff/staff.css`:

| Token | Value | Use |
|---|---|---|
| `--bg` | `#090b0d` | Workspace background |
| `--sidebar` | `#0d1013` | Fixed navigation rail |
| `--surface-1` | `#101418` | Default panel/input surface |
| `--surface-2` | `#151a1f` | Menus, selected rows, secondary surfaces |
| `--surface-3` | `#1b2228` | Active controls and higher contrast |
| `--border` / `--line` | `#283138` | Standard workspace divisions |
| `--line-strong` | `#3b4851` | Inputs and interactive boundaries |
| `--text-primary` | `#f2f5f5` | Primary copy |
| `--text-secondary` | `#c3ccd0` | Secondary copy |
| `--text-muted` | `#9aa7ae` | Metadata and quiet labels |
| `--accent-primary` | `#44d1ad` | Focus, active navigation, primary actions |
| `--accent-ink` | `#062b22` | Text placed on the accent color |
| `--success` | `#4fc79f` | Completed/accepted/healthy states |
| `--warning` | `#f0b85a` | Holds, stale work, and attention |
| `--danger` | `#f06b6b` | Destructive/error states |
| `--info` | `#65a9ff` | Informational state |
| `--rate` | `#aab1b6` | Rate tier |
| `--feature` | `#f1d94c` | Feature tier |
| `--epic` | `#ff9a45` | Epic tier |
| `--legendary` | `#d765f3` | Legendary tier |
| `--mythic` | `#54d8ec` | Mythic tier |
| `--sidebar-width` | `244px` | Desktop navigation width |
| `--radius` | `6px` | Compact operational radius |
| `--content-max` | `1320px` | Portal workspace limit |
| `--t-fast` | `140ms` | Hover, focus, and row-state transitions |
| `--t-med` | `210ms` | Drawers and larger workspace transitions |

The portal does not use the public site's 14px radius. Its tighter 6px radius is deliberate: the workspace should feel precise, not soft or promotional.

## Typography

- Font stack: `Inter`, then native UI sans-serif fonts.
- Public body line height: `1.62`; operational body line height: `1.5`.
- Public `h1` uses a stable page-scale size and may be centered when it introduces a reading page. Font size does not scale continuously with viewport width.
- Portal page titles stay compact, roughly `1.55rem` to `2rem`.
- Eyebrows are small, bold, uppercase labels. Portal eyebrows use the accent color and `.08em` positive tracking.
- Discord IDs, correlation IDs, and other machine identifiers use the system monospace stack and must wrap safely.
- Application labels and controls use sentence case. Status pills use normalized human-readable text rather than raw database keys.
- Application numbers are internal record identifiers and are never displayed in applicant-facing pages, Discord notifications, or DMs.

## Spacing And Layout

### Public pages

- The shared main column is at most `920px`, with `18px` horizontal padding.
- The sticky header uses `14px 20px`; navigation wraps rather than overflowing.
- Public surfaces use a one-pixel border, 14px radius, and minimal shadow.
- Repeated page sections are separated by margin and dividers. Sections are not wrapped in redundant nested cards.
- About profiles use repeated cards because each profile is a discrete item.
- The Avenue Guard status page uses a stable metric grid, a system grid, and two graph panels. Graph canvases have a fixed CSS height of `190px` and resize their backing resolution for the current device pixel ratio.

### Staff workspace

- Desktop uses a fixed `244px` sidebar and a fluid second column.
- Workspace content is constrained to `1320px` and padded by `28px`.
- Operational summaries use stable grid tracks. Tables and list rows keep identifiers and actions aligned.
- The right-side inspector is `500px` wide, preserves the main view, and becomes full width below `680px`.
- Panels are usually unframed sections divided by one-pixel rules. Cards are reserved for a genuine contained tool, modal, repeated record, or sign-in/application surface.
- Application pages use a focused `780px` column with a three-pixel accent top border.

## Geometric Signature

The shared GD Avenue signature is a restrained line-and-diamond language, not a decorative illustration system. It appears only where it helps orientation or state recognition:

- A small outlined diamond accompanies the public wordmark and portal Overview module.
- The Staff sidebar has a single cut-corner line and simple CSS-drawn module glyphs.
- Page headings use a short angular mint underline.
- Pipelines, timelines, application stages, milestones, service states, and empty states use compact diamond or check markers.
- The inspector has one shallow clipped corner with a short mint edge.

Do not add geometric backgrounds, repeated patterns, floating shapes, gradients, or large ornamental art. The signature must remain secondary to content.

## Components

### Navigation

- Public navigation is a sticky, lightly translucent header with a blur backdrop.
- Portal navigation is a fixed left rail with compact module glyphs and a two-pixel active indicator.
- The active location must be visible in text/color and not depend only on URL state.
- The portal's top-level structure is Overview, Work, Team, and Admin. Secondary tabs remain horizontally scrollable rather than wrapping into an unpredictable grid.
- Portal search is a stable 38px command surface. Focus adds an inset mint edge without changing its dimensions.

### Buttons

- Primary actions use the mint accent with dark ink.
- Secondary actions use a bordered dark surface.
- Destructive actions use the danger semantic color and require confirmation when they have irreversible effects.
- Icon-only controls need an accessible name and tooltip. Text commands keep explicit text.
- Disabled controls remain legible, explain why they are unavailable where necessary, and cannot be activated by keyboard or pointer.

### Forms

- Inputs use stable heights, dark surfaces, and a strong border.
- `:focus-visible` uses the accent outline. Long-text fields also receive an inset accent ring without adding a second left-edge highlight.
- Radio/choice options are entire clickable labels and visibly change surface and ink when selected.
- Required state is stated in the visible label and validated again by Avenue Guard.
- Help buttons are real 18px buttons. They use one shared, overlay-context-aware fixed-position tooltip that is clamped to the visual viewport, opens on hover/focus/click, closes on Escape/outside interaction, and never combines a native `title` tooltip with custom help text.
- A help trigger in a browser top-layer dialog or popover renders the shared tooltip into a host inside that active top-layer context. Normal pages and non-top-layer drawers use the document overlay host. A body-level tooltip must never be used to fight a native dialog with a larger `z-index`.
- Dialog and drawer scrolling belongs to an intentional inner scroll region. Overlay hosts sit outside that clipping region; do not solve tooltip clipping by making every form or table overflow-visible.
- Application-type availability and cooldown are different states. A closed type is unavailable; a cooldown is per applicant and per application type.

### Layering

- Staff layers use `--z-base`, `--z-sticky`, `--z-menu`, `--z-drawer`, `--z-overlay`, and `--z-tooltip`. Do not introduce one-off giant `z-index` values.
- Native dialogs and popovers participate in the browser top layer, which is outside the normal z-index hierarchy. The layer tokens order content only within the same DOM/top-layer context.
- The drawer transform is retained for its entrance transition and intentionally creates a stacking context. Drawer help uses the document overlay host so it is neither transformed nor clipped by the drawer's scrolling surface.
- Sticky top bars and application save rows retain `backdrop-filter` for legibility and therefore create intentional local stacking contexts. Decorative transforms on diamonds and markers are local and must not become overlay ancestors.
- Only one contextual tooltip is open at a time. Click-open help remains visible through pointer leave and blur; Escape, outside click, parent-overlay close, or a view change removes it and its temporary `aria-describedby` relationship.

### Tables And Lists

- Tables are used for scan-heavy operational comparisons.
- Rows expose their primary object first, supporting metadata second, and actions last.
- Small viewports use responsive labels or stacked rows. No identifier may force horizontal page overflow.
- Claims, queue state, application state, and delivery state use explicit labels or pills in addition to color.
- Queue rows prioritize level name, creator, and monospace level ID before score metadata. Tier artwork stays compact and decorative.
- Hover and selected rows use an inset two-pixel accent edge, so state changes never move table content.

### Pills And Status

- Accepted uses green/success styling.
- Held or stale uses warning styling.
- Rejected and failed use danger styling.
- Unknown is neutral and must never be presented as healthy or as zero.
- Recommendation tiers use the dedicated `--rate`, `--feature`, `--epic`, `--legendary`, and `--mythic` tokens and their matching image assets where the surface supports them.
- Staff roles use a compact rectangular role badge with a semantic left edge. It is intentionally distinct from workflow-status pills.

### Dialogs And Drawers

- Modals use native dialog semantics, a labelled title, explicit Close and Cancel actions, and focus restoration.
- Side inspectors use dialog semantics when modal, close on Escape, and prevent background scrolling.
- Destructive actions explain the consequence and require deliberate confirmation.
- Dense details use progressive disclosure with `details`/`summary` rather than showing every diagnostic at once.
- The level inspector leads with tier artwork, queue rank, and priority, followed by stable F/G/H/P component cells. Actions remain visible before outreach, history, and notes disclosures.

### Loading, Empty, And Error States

- Portal views use skeletons during initial loads.
- Empty states explain what is absent and, when useful, the next action.
- Errors are concise and actionable. They do not expose secrets, raw environment values, or private Discord payloads.
- Public avatar and image requests keep a checked-in fallback so a bot restart does not leave a broken visual.
- Status graphs display a labelled empty state until persisted health samples exist.
- Portal empty states are compact, include one quiet geometric marker, and do not consume a dashboard-sized region.

### Shared Component Families

- `page-heading` and `section-title` establish hierarchy without cards.
- `summary-band`, `progress-strip`, and `today-line` present related metrics as one ruled surface.
- `pipeline-strip` communicates ordered state with labelled diamond nodes.
- `record-row`, `list-row`, and `data-table` cover increasing information density.
- `role-badge`, `pill`, and tier artwork communicate different semantic categories and are not interchangeable.
- `detail-drawer` is the signature inspection surface for levels, applications, tasks, staff, and QA records.
- `timeline` uses a line with diamond event nodes; application stages use the same geometry.
- Skeleton, empty, warning, and error states preserve the surrounding layout.

## Page Inventory

### Rules (`index.html`)

Reading-focused public layout with section surfaces, clear hierarchy, restrained controls, and shared sticky navigation.

### Idea Generator (`generator.html`)

Interactive public tool using the shared surface language. Generated choices remain in the browser. Controls must remain keyboard operable and must not resize the layout when results change.

### About Us (`about.html`)

Introductory copy followed by repeated staff profile cards. Each avatar has a stable checked-in source plus a configured Discord user ID. `about.js` requests `/api/team` and replaces only valid HTTPS avatar URLs returned by Avenue Guard.

### Avenue Guard Status (`bot.html`)

Live service identity, overall state, version, process uptime, measured availability, latency, member count, relative last-check time, system-by-system availability, recent availability bars, Discord latency history, and release history. Exact timestamps remain available as title text while the visible value uses natural relative wording such as “4 hours ago.”

### Public Levels (`levels/index.html`)

Wide, search-first directory. Stable 78px rows prioritize level identity, creator and ID, recommendation artwork, queue state, and public priority band. The compact `public-levels.css` layer inherits portal tokens for a consistent operational feel without importing private portal behavior.

### Recommendation Detail (`level.html`)

Public immutable route keyed by Geometry Dash level ID. The visual is dominated by actual level information and thumbnail when available, with a black fallback when the external thumbnail is missing. Internal rank, scores, requester/reviewer IDs, and outreach targets stay private.

### Applications (`apply/index.html`)

Focused authenticated workflow. The first view is always the application-type chooser. Existing drafts are labelled “Return to draft.” Forms support short text, long text, single choice, browser-suggested timezone, and embedded reviewer showcases. Submitted/final records show stages and status without exposing application record numbers.

### Staff Portal (`staff/index.html`)

Role-aware operational workspace with capability-gated navigation and server-enforced mutations. Reviewer, Head Reviewer, Admin, Owner, and Dev views share the same component vocabulary while exposing different actions. Dev View Mode is visually explicit and read-only.

- Overview opens with a personal greeting, role badge, attention count, current-week contribution, actionable attention list, and a Queued to Rated team pipeline.
- My Work behaves like an inbox: Claimed, Assigned tasks, Follow-ups, and monthly contribution each expose the next useful action.
- Queue uses quick filters, Tier and State controls, search, compact scan rows, and a right-side level inspector.
- Team uses a single contribution strip plus workload and human-identity rows. Resolved people are named first; exact Discord IDs remain secondary metadata.
- Admin Operations opens on calm service health and keeps diagnostics behind disclosure.
- Dev System begins with a high-level summary. Runtime, Database, Outbox, Workers, Providers, Requests/PPS, and Identity integrity details stay collapsed until requested.

### Privacy (`privacy.html`)

Long-form reading layout using the public surface system. Policy sections use headings, paragraphs, and lists rather than dashboard widgets.

### Queue Methodology (`methodology/queue/`)

Public editorial documentation, not a dashboard. A sticky left contents rail sits outside a 700–800px reading column on desktop and becomes a collapsible contents panel on mobile. Sections are unframed, anchorable, and separated by quiet rules. Formula surfaces use accessible MathML, restrained accent borders, and overflow protection. The PPS calculator is the only tool-like block; it never reads private queue data. Live model status is one compact sentence and never exposes evidence counts, routes, targets, posterior parameters, or staff identities. Public spacing, typography rhythm, and 14px surface radius apply; Staff Portal density does not.

## Motion And Interaction

- Motion is short and functional. Public transitions use `140ms` or `220ms`; Staff transitions use `140ms` or `210ms`.
- The portal respects `prefers-reduced-motion`.
- Hover never carries information that focus cannot reveal.
- Tooltip, drawer, modal, menu, and search behavior must be operable from a keyboard.
- Refreshes update content without forcing page navigation or clearing active form input.
- Form drafts are server-backed, but local typing is not overwritten by background refreshes.
- Drawer motion is a small horizontal reveal with opacity correction. Rows, arrows, and buttons use color or two-pixel movement at most.

## Responsive Rules

- Public navigation wraps on medium screens and layouts collapse to a single column where needed.
- Public system and graph grids become one column below `560px`.
- Portal breakpoints are `900px`, `680px`, and `430px`.
- Below the portal desktop breakpoint, the fixed sidebar yields to compact navigation and the content column uses the full viewport.
- Drawers become full width on narrow screens.
- Application stages, choice controls, tables, toolbars, and summary grids must preserve readable labels without overlap.

## Accessibility Contract

- Every page declares its language, viewport, title, and meaningful landmark structure.
- Focus is always visible.
- Interactive non-link elements are native buttons, inputs, selects, details, or dialogs whenever possible.
- Images have meaningful alt text; decorative status dots are hidden from assistive technology.
- Canvas graphs use `role="img"`, a live `aria-label`, and an adjacent text summary containing the same key information.
- Tooltips contain supplemental explanations only. The trigger has a concise accessible name and references the `role="tooltip"` element only while it is open, preventing duplicate announcements. Tooltip content is not an `aria-live` region.
- Color-coded state always has readable text.
- `aria-live` is reserved for meaningful status changes and not applied to entire rapidly changing workspaces.

## Implementation Rules

1. Reuse the owning stylesheet and existing tokens before creating a selector or color.
2. Keep public and staff token systems separate; they intentionally have different density and radii.
3. Do not add inline styles for reusable behavior.
4. Do not use application database IDs as applicant-facing labels.
5. Do not add native `title` attributes to custom help controls.
6. Treat unknown telemetry and failed external lookups as unknown, never as zero or healthy.
7. Keep checked-in fallbacks for externally hosted images.
8. Pair every new dynamic view with loading, empty, error, keyboard, and small-screen states.
9. Validate responsive layouts and browser console output before deployment.
10. Update this document when adding a new visual token, component family, breakpoint, or public page type.

## Visual QA Checklist

- Desktop widths: 1440px and 1024px.
- Mobile widths: 430px and 375px.
- Keyboard-only navigation through header, application form, portal navigation, filters, dialogs, drawers, and help.
- Browser zoom at 200% with no clipped labels or inaccessible actions.
- Long display names, IDs, errors, and status labels wrap without overlap.
- Empty and unavailable API states preserve usable navigation and fallback images.
- The help tooltip appears once, stays inside the viewport, and closes predictably on page, drawer, dialog, nested-overlay, touch, keyboard, scroll, resize, Safari, and 200% zoom checks.
- Status canvases are nonblank when data exists and provide textual summaries when it does not.
- Reviewer, Head Reviewer, Admin, Owner, and Dev views expose only capability-appropriate controls.
