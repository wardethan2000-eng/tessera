# Tree Page Improvements Brainstorm

## The Core Problem

When you first arrive at the tree page, you see the **full tree at low zoom** through React Flow's default viewport. This creates several compounding issues:

- **All nodes are identical tiny circles** — no visual hierarchy, no depth, no life
- **The dot-grid background looks like graph paper** — undermines the warm parchment/constellation aesthetic
- **React Flow's default pan/zoom is snappy and tech-y** — it feels like a dev tool, not the SPEC's "page turning" feel
- **The toolbar crams everything into one busy row** — screams admin panel, not quiet archive
- **No arrival moment** — you just pop into a flat, frozen spreadsheet of people

The family-focus animations work well because they solve all of these simultaneously: they center on meaningful content, use the Tessera easing curve, reduce visual clutter by dimming irrelevance, and create narrative motion. The whole-tree view needs to accomplish the same thing at scale.

---

## Tier 1: Minor Polish (hours–days, high impact)

### A. Replace the dot grid with atmospheric texture

The `Background` component at `gap=44 size=1` looks like engineering graph paper. Replace with either:
- A very faint organic noise/paper grain (SVG filter or tiled texture)
- A sparse scatter of larger, softer "dust" dots at irregular intervals
- Or remove it entirely and lean into the existing radial gradient background (which is already nice)

**Relevant files:** `TreeCanvas.tsx` (lines ~1661–1666, the `<Background>` component)

### B. Add a canvas vignette

A CSS radial-gradient overlay that darkens/fades the edges of the viewport. This creates depth and draws the eye inward — exactly the "held, not swiped" feeling. Very low effort, very high return.

**Relevant files:** `TreeCanvas.tsx` (add overlay div inside the root container)

### C. Implement the missing zoom-level-of-detail system

The code comments say `essence-line` should appear "at higher zoom, shown via CSS class from parent" but the CSS rule doesn't exist. More importantly, the *entire* node should adapt:
- **Very low zoom (< 0.3):** Just a softly glowing dot + first name, no portrait circle, no dates
- **Low zoom (0.3–0.6):** Small portrait circle + name, no dates/essence
- **Medium zoom (0.6–1.0):** Current full node
- **High zoom (> 1.0):** Full node + essence line visible, slightly larger portrait

This alone would transform the whole-tree view from "wall of identical boxes" to "constellation of labeled stars."

**Relevant files:** `PersonNode.tsx` (add zoom-aware conditional rendering), `TreeCanvas.tsx` (pass viewport zoom to node data), `globals.css` (add CSS rules for zoom-level classes), `treeLayout.ts` (add zoom field to node data type)

### D. Standardize animation durations

Right now durations range from 420ms to 760ms with no clear logic. The SPEC says 400–700ms for major, 150–250ms for micro. Adopt a strict token system:
- `--duration-micro: 200ms` — hover, color shifts
- `--duration-focus: 500ms` — node opacity/scale
- `--duration-camera: 600ms` — viewport animations
- `--duration-arrival: 800ms` — initial load, page transitions

**Relevant files:** `globals.css` (add duration tokens), `TreeCanvas.tsx`, `PersonNode.tsx`, `DecadeRail.tsx`, `PersonBanner.tsx`, `CinematicPersonOverlay.tsx` (replace all hardcoded durations)

### E. Soften the toolbar

The current header is a dense control panel. Consider:
- Reduce to just tree name + one or two actions visible by default
- Move search/memory/add to a subtle action menu or side drawer
- Make the toolbar semi-transparent and auto-hide after 3 seconds of inactivity, reappearing on mouse-move to top 40px (like a fullscreen video player)
- The navigation tabs (Home/Tree/Drift) could be a minimal breadcrumb, not a full segmented control

**Relevant files:** `TreeCanvas.tsx` (toolbar section, lines ~1168–1372)

### F. Add subtle node halos

A very faint, warm radial glow behind each portrait at rest (maybe 2-3px of `box-shadow: 0 0 12px rgba(246,241,231,0.4)`). This makes nodes feel like they're *emitting light* rather than sitting on a flat surface. At low zoom, these halos become the primary visual.

**Relevant files:** `PersonNode.tsx` (portrait circle div, add box-shadow)

---

## Tier 2: Medium Improvements (days–weeks, significant impact)

### G. Design a proper "arrival" sequence

Instead of popping into the full tree, the first experience should be:
1. Screen starts soft-focused / slightly blurred
2. The camera slowly resolves, settling on the user's own position (or the tree's most dense/meaningful area)
3. Names and connections bloom in with staggered timing (parents first, then siblings, then children)
4. After 1-2 seconds, the full tree is revealed with a gentle breathe-out

This transforms "beta software" into "entering a space." The Drift mode already proves you have the cinematic instinct — apply it to the first arrival.

**Relevant files:** `TreeCanvas.tsx` (initial viewport animation on mount, currently `fitView({ duration: 600, padding: 0.12 })`), possibly new `ArrivalSequence.tsx` component

### H. Atmospheric depth-of-field

When viewing the full tree, nodes near the viewport center or near the selected person are at full opacity and sharpness. Nodes further from the "center of attention" get very slight blur and reduced contrast. This is a single CSS `filter: blur()` on dimmed nodes — it makes the scene feel photographed rather than diagrammed.

**Relevant files:** `PersonNode.tsx` (add `filter: blur()` to dimmed nodes, combine with existing `saturate(0.75)`)

### I. Animated/breathing edges

The SPEC says edges should feel like "hairlines that indicate relationships." Currently they're static SVG paths with uniform opacity. Options:
- Subtle pulse animation that travels down parent-child edges (like a slow nerve pulse, 8-10 second cycle)
- Spouse lines that shimmer very faintly (1-2% opacity oscillation)
- A very slow "flow" gradient along edges using SVG `animate` on stroke-dashoffset

These should be *barely* perceptible — the SPEC says "the app is alive but calm."

**Relevant files:** `TreeCanvas.tsx` (ParentChildEdge and SpouseEdge components, ~lines 2360–2659)

### J. Constellation cluster glow

Behind family groupings (people connected by parent-child or spouse relationships), render a very soft, warm elliptical glow — like a nebula behind a star cluster. This is just a handful of absolutely-positioned `radial-gradient` divs with large radii and very low opacity. It visually groups families even at low zoom, solving the "wall of identical dots" problem without changing the layout algorithm.

**Relevant files:** `TreeCanvas.tsx` (new layer between background and ReactFlow), `treeLayout.ts` (compute bounding boxes per family cluster from existing family-group logic)

### K. Momentum-based camera physics

Replace React Flow's default pan/zoom with custom inertia:
- Pan deceleration curve that takes ~1.5 seconds to settle (not the instant-stop default)
- Zoom with exponential steps that feel like "stepping through depth" rather than linear scaling
- Overshoot damping — the camera slightly overshoots its target on `fitBounds()` then gently settles back (like the existing easing curve, but applied to viewport position)
- This single change would make the biggest dent in the "beta" feel

**Relevant files:** `TreeCanvas.tsx` (custom wheel/drag handlers, intercept before React Flow), possibly new `camera.ts` utility module

### L. Family cluster labels at low zoom

When zoomed out (< 0.4), render family last names as large, faded typography behind or near family clusters. Think of it as constellation labels on a star chart. The `FamilySelector` already computes these groupings — surface them visually on the canvas itself.

**Relevant files:** `TreeCanvas.tsx` (new overlay layer), `FamilySelector.tsx` (reuse family grouping logic), `treeLayout.ts` (compute cluster centroids)

---

## Tier 3: Significant Redesigns (weeks, transformative)

### M. Drop React Flow's default viewport behavior entirely

Keep `@xyflow/react` for node/edge rendering but intercept *all* viewport interactions:
- Custom wheel handler with momentum physics
- Custom drag handler with elastic boundaries (canvas doesn't end abruptly)
- Custom double-click-to-zoom with the Tessera easing (not React Flow's built-in)
- Disable `zoomOnScroll` and `panOnScroll`, implement your own via `onWheel` + `setViewport` with interpolated animation frames

**Relevant files:** `TreeCanvas.tsx` (ReactFlow component props, viewport control hooks)

### N. The "Living Constellation" — ambient node drift

Nodes very slowly orbit their layout position by ±2-4px over 30-60 second cycles (using `transform: translate()` with very gentle sine waves, offset per person by hash of their ID). This makes the tree feel *alive* when you're just looking at it — like stars with proper motion. When a focus action triggers, nodes snap to their precise layout positions. At rest, they drift.

**Relevant files:** `PersonNode.tsx` (add ambient animation), `TreeCanvas.tsx` (coordinate ambient state)

### O. Zoom-through to person pages

The SPEC explicitly describes this: *"Zooming in on a name transitions (via a gentle zoom-through) into that person's node."* Currently, double-click opens a `CinematicPersonOverlay`. Instead:
1. On double-click, the camera smoothly zooms toward the person's center position
2. As zoom increases past a threshold (~1.8), the node's portrait expands, other nodes fade
3. The entire canvas cross-fades into the person's full page

This is the single most "Tessera" interaction, and it's currently a slide-up card.

**Relevant files:** `TreeCanvas.tsx` (handleNodeDoubleClick), `CinematicPersonOverlay.tsx`, `page.tsx` (tree page route — may need transition support)

### P. WebGL / Canvas2D rendering layer for large trees

React Flow renders SVG elements for every node and edge. At 50+ people this gets sluggish, and it prevents certain visual effects (blur, glow, particle trails). Options:
- For edges: render to a Canvas2D layer beneath the SVG nodes (edges don't need DOM events at rest)
- Add a WebGL layer purely for atmospheric effects (glows, particles, background stars)
- Keep SVG nodes for accessibility, but offload visual atmosphere to canvas

**Relevant files:** `TreeCanvas.tsx`, `treeLayout.ts`, new edge renderer component

### Q. Force-directed layout as secondary mode

The SPEC calls for "physics-based layout (force-directed) with manual-override pinning." The current deterministic lane layout is good for genealogical clarity, but it *looks* mechanical. Consider:
- Start with the lane layout (it works)
- Apply a soft force simulation *on top of it* as a post-process (D3-force with very low alpha, position-locking to ~80% of the lane position)
- This would organic-ify the rigid rows without sacrificing structure
- Allow stewards to pin/unpin individual node positions

**Relevant files:** `treeLayout.ts` (add optional force-simulation post-pass), new `forceLayout.ts` module, `@dagrejs/dagre` dependency (already installed but unused) can be removed, `d3-force` would need to be added

---

## Tier 4: Radical Rethinks (months, identity-defining)

### R. The Dark Constellation

Implement the SPEC's dark mode as a *separate visual identity* for the tree page specifically — a warm, candlelit star-field on deep indigo/parchment-black:
- Background: deep `#1A1814` with warmer-than-OLED tones
- Nodes become softly luminous (warm amber/moss glow halos)
- Edges become faint golden threads
- The decade rail becomes a time-of-night metaphor
- This is what the "constellation" metaphor was *meant* for — you see it in the dark

Even if the rest of the app stays light-mode only, the tree page under dark mode could be the signature visual of the product.

**Relevant files:** `globals.css` (dark mode tokens), `TreeCanvas.tsx`, `PersonNode.tsx`, `DecadeRail.tsx`, `FamilySelector.tsx`, all tree components

### S. Canvas-as-universe — replace React Flow entirely

Build a purpose-built renderer from scratch (Canvas2D or WebGL) with:
- Your own zoom/pan physics (momentum, boundaries, easing)
- Zoom-level-of-detail baked into the render pipeline
- Built-in atmospheric effects (glow, depth-of-field, particle trails)
- No external viewport-interaction model to fight against
- Native support for the "zoom-through" transition
- Better performance at scale (100+ people)

This is the biggest commitment but would eliminate the "beta" feel at its root, because the interaction model would be *designed* for the SPEC rather than adapted from a flowchart library.

**Relevant files:** Everything in `components/tree/`, would be a ground-up rewrite

### T. The Map Metaphor — treat the tree like a cartographic atlas

Instead of a single pannable canvas, present the tree as an **atlas** with different "pages" or "sheets":
- **Overview sheet** — the whole tree as a hand-drawn map/constellation chart (abstract, labeled, atmospheric)
- **Region sheets** — per-family branch closeups with full detail
- **Person sheets** — the individual node pages

Navigation between sheets uses the same gentle zoom/crossfade that already works for family focus. This changes the metaphor from "endless pan" (which feels cheap when zoomed out) to "turning pages of an atlas" (which feels curated and archival).

**Relevant files:** `TreeCanvas.tsx`, `page.tsx` (tree page route), new atlas navigation components

---

## Priority Assessment

Impact per effort ranking:

| # | Improvement | Effort | Impact | Status |
|---|------------|-------|--------|--------|
| C | Zoom-level-of-detail | hours | ★★★★★ | ✅ Done |
| G | Arrival sequence | days | ★★★★★ | |
| A | Replace dot grid | hours | ★★★★☆ | ✅ Done (organic noise SVG filter) |
| B | Canvas vignette | hours | ★★★★☆ | ✅ Done |
| K | Momentum camera | days | ★★★★★ | ✅ Done (useMomentumCamera) |
| E | Soften toolbar | hours | ★★★★☆ | ✅ Done (auto-hide + ...) |
| F | Node halos | hours | ★★★★☆ | ✅ Done |
| J | Cluster glow | days | ★★★★☆ | ✅ Done (computeClusterCentroids) |
| L | Family labels at low zoom | hours | ★★★★☆ | ✅ Done |
| H | Depth-of-field on dim | hours | ★★★☆☆ | ✅ Done (blur on dimmed) |
| M | Custom viewport intercepts | days | ★★★★★ | |
| O | Zoom-through transition | weeks | ★★★★★ | |
| N | Ambient drift | days | ★★★☆☆ | |
| I | Breathing edges | days | ★★★☆☆ | ✅ Done (pulse + shimmer CSS) |
| D | Standardize durations | hours | ★★★☆☆ | ✅ Done (CSS tokens) |
| G | Arrival sequence | days | ★★★★★ | ✅ Done (blur → resolve → complete) |
| R | Dark constellation mode | weeks | ★★★★★ | |

### Implementation Notes (Tier 2)

**G. Arrival sequence** — Tree canvas loads with a `backdrop-filter: blur(3px)` + `rgba(246,241,231,0.3)` overlay in the "entering" phase. After 200ms, transitions to "resolving" phase: blur and overlay fade to zero over 800ms while `fitView` animates. After 1200ms, "complete" phase — overlay removed from DOM. For returning visits within the same session (tracked via `didArriveRef`), skips arrival and goes straight to `fitView`. When arriving with `initialSelectedPersonId`, also skips arrival. For the initial frame, if the current user has a position, the camera centers on them at 0.9 zoom before the resolve animation.

**H. Depth-of-field on dim** — Dimmed nodes now get `blur(1.5px)` at medium/high zoom, `blur(0.8px)` at low zoom, and no blur at very-low zoom (tiny dots don't benefit). Composed with existing `saturate(0.75)` via a `dimFilter` computed property in `PersonNode.tsx`.

**I. Breathing edges** — Added two CSS keyframes to `globals.css`: `edgePulse` (animates `stroke-dashoffset` over 10s with `2 18` dash pattern) for parent-child edges, and `edgeShimmer` (subtle 3% opacity oscillation over 12s) for spouse edges. CSS classes `.edge-pulse`, `.edge-shimmer`, and `.edge-dimmed` (pauses animation) applied via `className` on `BaseEdge` components. Dimmed edges (opacity < 0.5) get `.edge-dimmed` to pause the animation.

**J. Constellation cluster glow** — Added `computeClusterCentroids()` function to `treeLayout.ts` that groups people by family relationships (using Union-Find on parent-child + spouse relationships), computes bounding boxes and centroids, and returns `FamilyCluster` objects with center/width/height/familyName. In `TreeCanvas.tsx`, clusters are projected to screen coordinates and rendered as elliptical `radial-gradient` divs (`rgba(212,190,159,0.07)`) behind the nodes at `zIndex: 1`. Clusters with < 2 members are filtered out. Dimmed when focus is active and no cluster member is in the focus set.

**K. Momentum camera physics** — Created `useMomentumCamera.ts` hook that provides custom zoom/pan handling:
- **Custom wheel handler**: Ctrl/meta+scroll zooms to cursor point with 400ms animation. Regular scroll pans with 200ms animation.
- **Drag pan with inertia**: On pointer up, computes velocity from last move events and applies exponential decay momentum (0.92 per frame) until speed drops below threshold.
- **Smooth programmatic moves**: `fitViewSmooth()`, `fitBoundsSmooth()`, and `setCenterSmooth()` all stop momentum before animating with 800ms duration.
- Disabled React Flow's built-in `zoomOnScroll`, `zoomOnDoubleClick`, and `panOnScroll`. Kept `panOnDrag` in non-edit mode. `nodesDraggable` only in edit mode.

**L. Family cluster labels at low zoom** — When zoom < 0.4, not in edit mode, and no person selected, rendered family surnames as large faded labels at cluster centroids. Font: `var(--font-display)`, size scales inversely with zoom (18–32px), opacity 0.14, letter-spacing 0.08em. Labels share the `projectedFamilyClusters` useMemo from item J.

**C. Zoom-level-of-detail** — PersonNode now uses `useViewport()` from `@xyflow/react` (debounced to 1-decimal rounding via `useMemo`) to determine a zoom level tier (`very-low` < 0.3, `low` < 0.6, `medium` < 1.0, `high` ≥ 1.0). Each tier renders a different node:
- `very-low`: 18px glowing dot + first name only, 48px container
- `low`: 36px portrait + name (no dates), 74px container
- `medium`: full current node (portrait, name, dates, no essence)
- `high`: full node with essence line visible

Essence line uses `opacity` transition rather than conditional rendering for smooth fade.

**D. Duration tokens** — Added `--duration-micro: 200ms`, `--duration-focus: 500ms`, `--duration-camera: 600ms`, `--duration-arrival: 800ms` to `:root` in globals.css. Updated PersonNode, DecadeRail, PersonBanner, FamilySelector, SearchOverlay, CinematicPersonOverlay, AddMemoryWizard, DriftChooserSheet, MemoryLightbox, and PromptComposer to use `var(--duration-*)` and `var(--ease-tessera)` instead of hardcoded values. Keyframe animations left as-is (CSS `animation` shorthand doesn't reliably support `var()` for durations).

**E. Toolbar softening** — Three changes:
1. Auto-hide: toolbar fades to 15% opacity after 3 seconds of inactivity. Edit mode disables auto-hide. Moving mouse to top 44px strip reveals the toolbar. Hovering the toolbar resets the timer.
2. Secondary actions collapsed: Search, Request a memory, Messages, and Settings are now in a "⋯" dropdown menu. Only "+ Add memory" and "⋯" remain in the right section.
3. Removed `flexWrap: "wrap"` and `maxWidth: "min(100%, 980px)"` from the right section for a cleaner layout.

**F. Node halos** — Portrait circles now have subtle warm box-shadow at rest: `0 0 8px rgba(212,190,159,0.25)` for default, `0 0 10px rgba(78,93,66,0.45)` for "is you", and `0 0 0 4px rgba(212,190,159,0.28), 0 0 14px rgba(212,190,159,0.3)` for focused.

---

## Context: What Works Well

The family-focus animations are the strongest part of the current tree page. They work because they:
- Center on meaningful content
- Use the Tessera easing curve (`cubic-bezier(0.22, 0.61, 0.36, 1)`)
- Reduce visual clutter by dimming irrelevance
- Create narrative motion (camera, opacity, scale all choreographed)

The whole-tree view needs to accomplish the same things at scale. Every improvement above should be evaluated against whether it makes the initial view feel as intentional as the focused view.

---

## References

- **SPEC:** `/SPEC.md` — Part I (Soul), Part II (Design Language), Part VII (Constellation)
- **Tree canvas:** `apps/web/src/components/tree/TreeCanvas.tsx`
- **Person node:** `apps/web/src/components/tree/PersonNode.tsx`
- **Layout algorithm:** `apps/web/src/components/tree/treeLayout.ts`
- **Type definitions:** `apps/web/src/components/tree/treeTypes.ts`
- **Global styles:** `apps/web/src/app/globals.css`
- **Decade rail:** `apps/web/src/components/tree/DecadeRail.tsx`
- **Family selector:** `apps/web/src/components/tree/FamilySelector.tsx`
- **Person banner:** `apps/web/src/components/tree/PersonBanner.tsx`
- **Cinematic overlay:** `apps/web/src/components/tree/CinematicPersonOverlay.tsx`
- **Drift mode:** `apps/web/src/components/tree/DriftMode.tsx`