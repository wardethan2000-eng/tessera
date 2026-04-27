# Lifeline (Personal Timeline) — Full Implementation Plan

> **Drafted:** 2026-04-26
> **Status:** Phase 1 superseded — see `LIFELINE-PAGE-FIXES.md` for current fix list. Phases 2–7 are active planning.
> **Scope:** Complete buildout of the personal timeline/lifeline feature, from fixing broken V1 to immersive, chapter-driven experience

---

## Table of Contents

1. [Current State Assessment](#1-current-state-assessment)
2. [Architectural Decision: Hybrid Model](#2-architectural-decision-hybrid-model)
3. [Phase 1 — Fix What's Broken](#3-phase-1--fix-whats-broken)
4. [Phase 2 — Person Page Lifeline Preview](#4-phase-2--person-page-lifeline-preview)
5. [Phase 3 — Dedicated Lifeline Immersive Redesign](#5-phase-3--dedicated-lifeline-immersive-redesign)
6. [Phase 4 — Life Chapters](#6-phase-4--life-chapters)
7. [Phase 5 — Dedicated Timeline API](#7-phase-5--dedicated-timeline-api)
8. [Phase 6 — Memory System Integration](#8-phase-6--memory-system-integration)
9. [Phase 7 — Advanced Interactivity](#9-phase-7--advanced-interactivity)
10. [Implementation Order and Estimates](#10-implementation-order-and-estimates)
11. [Design Principles for the Lifeline](#11-design-principles-for-the-lifeline)
12. [Open Questions](#12-open-questions)

---

## 1. Current State Assessment

### 1.1 What Exists

The lifeline page lives at:

```
/trees/[treeId]/people/[personId]/lifeline/page.tsx
```

It is a 571-line standalone client component that:

- Fetches person data via `GET /api/trees/:treeId/people/:personId` (the full person detail endpoint)
- Filters to `directMemories` only (excluding contextual memories)
- Groups memories by year extracted from `dateOfEventText` via regex
- Renders a vertical timeline with a decorative "spine" line
- Shows **birth** and **death** markers as `AnchorRow` components
- Computes **age** at each year and **life era** labels (Childhood, Teen years, Young adult, Mid life, Later years, Elder years) with era-specific color hues
- Renders undated memories in a separate section
- Each year row shows `MemoryCard` components with photo thumbnails, audio players, video embeds, and body text
- Has a "Back to {displayName}" link returning to the person page

The person page (`people/[personId]/page.tsx`, 3329 lines) links to the lifeline via a small "Lifeline" pill in its sticky header.

### 1.2 What's Broken

| # | Issue | Severity | Detail |
|---|-------|----------|--------|
| 1 | **Memory cards don't link anywhere** | Critical | `MemoryCard` receives `treeId=""` and `personId=""` (line 282, voided at lines 307-309). No path from a timeline card to the full memory detail page. |
| 2 | **No auth guard** | Critical | Unlike the person page (which checks `useSession()` and redirects to `/auth/signin` at line 355), the lifeline has no client-side auth check. It relies entirely on the API returning 401/403. |
| 3 | **No route normalization** | High | The person page has `resolveCanonicalTreeId` and `resolveCanonicalPersonId` logic (lines 358-406) that handles index-based route shortcuts like `/trees/1/people/2`. The lifeline page has none — these URLs will break. |
| 4 | **Fragile year extraction** | High | The regex `/\b(1[5-9]\d{2}\|20\d{2}\|21\d{2})\b/` only matches years 1500-2199. The person page uses a different, more permissive regex `/\b(\d{4})\b/`. A free-text date like "Around 500 BC" or "95 AD" would fail. The inconsistency will produce different year groupings on different pages. |
| 5 | **No contextual memories** | High | Only `directMemories` are shown. The person page already shows contextual memories (surfaced via reach rules from other family members) with a `memoryReasonLabel`. The lifeline ignores this entire category, making the timeline incomplete. |
| 6 | **No loading skeleton** | Medium | Just a text "Loading lifeline..." instead of the `Shimmer` animation used elsewhere in the app. |
| 7 | **"Add the first memory" link is broken** | Medium | Line 166 links back to the person page but doesn't open the memory composer. There's no query param or state to trigger the wizard. |
| 8 | **No session-dependent controls** | Medium | No edit, delete, memory creation, visibility toggles, or any interactive features. The page is purely a read-only display. |
| 9 | **All styles are inline CSS** | Medium | ~300 lines of `CSSProperties` constants make up roughly 60% of the file. Design tokens are used inconsistently; some values are hardcoded (`#5C4F3A`, `#C9A26A`) rather than referenced via CSS variables. |
| 10 | **No dedicated API** | Low | The lifeline reuses the full person detail endpoint, which returns all relationships, curation data, cross-tree info, suppressed memories, and full memory metadata. Most of this payload is unused by the timeline view. |

### 1.3 What's Missing (Product Vision)

| # | Feature | Source | Status |
|---|---------|--------|--------|
| 1 | **Life chapters** | ATRIUM-AND-DISCOVERY-IMPROVEMENT-PLAN Part 4; PRODUCT-BRAINSTORM-2026-04-22 line 63 | No `life_chapters` or `life_chapter_memories` tables. No chapter UI. No system-suggested draft generation. |
| 2 | **Era-based navigation** | DecadeRail and EraRibbon exist on other pages | Nothing on the lifeline. No way to jump to an era. |
| 3 | **Relationship events on timeline** | relationships have `startDateText`/`endDateText` | Marriages, partnerships, moves are not shown on the timeline even though the data exists. |
| 4 | **Timeline ↔ Drift bridge** | Drift API supports `personId` filter | "Drift through this person's memories" is a natural lifeline action but has no entry point. |
| 5 | **Multi-perspective memories** | `memory_perspectives` table exists | Memories with multiple voices aren't surfaced on the timeline. |
| 6 | **Contextual awareness** | PRODUCT-ROADMAP Phase 3 "Explainable surfacing" | No "why am I seeing this?" indicator for contextual memories on the timeline. |
| 7 | **Timeline minimap** | New concept | No compressed overview of the full lifespan for orientation. |
| 8 | **Curation integration** | Curation queue has "needs date" filter | No link between undated memories on the timeline and the curation workflow. |
| 9 | **Person page preview** | ConstellationPreview pattern on Atrium | No compressed timeline preview on the person page itself. |

### 1.4 Type Duplication

The lifeline page defines its own `Person` and `Memory` interfaces (lines 12-35) that are subsets of the person page's types (lines 62-116). There is no shared types package. This means type changes must be synchronized manually across files.

---

## 2. Architectural Decision: Hybrid Model

**Decision: The lifeline is both a section within the person page AND a dedicated immersive page.**

### Rationale

| Option | Pros | Cons |
|--------|------|------|
| Within person page only | Simpler routing; single data fetch; everything in one scroll | Person page is already 3329 lines; adding timeline content makes it heavier; timeline deserves its own focused experience |
| Separate page only | Clean separation; focused experience | Poor discoverability (currently just a tiny pill); user must navigate away to see chronological view; breaks the "chapter" metaphor where timeline is part of the person |
| **Hybrid** | **Discoverable on person page; immersive dedicated page for deep engagement** | **Two components to maintain; need to ensure data consistency** |

The hybrid approach mirrors a pattern already established in the codebase: the Atrium contains a `ConstellationPreview` (compressed SVG) that links to the full `TreeCanvas` (immersive interactive graph). The lifeline gets the same treatment:
- **LifelinePreview**: Compressed, interactive section on the person page
- **Dedicated Lifeline Page**: Full immersive experience at `/trees/[treeId]/people/[personId]/lifeline`

### Navigation Flow

```
Person Page
  └── Lifeline section (scroll-to: inline preview)
       ├── Click era/year → scroll person page to era
       └── "Open full lifeline" → navigate to dedicated page
            ├── Era rail navigation
            ├── Memory cards → /trees/:treeId/memories/:memoryId
            ├── "Drift this life" → DriftMode (personId filter)
            └── "Add memory" → AddMemoryWizard (primaryPersonId prefilled)
```

---

## 3. Phase 1 — Fix What's Broken

> **Superseded.** This section described bugs in the original lifeline component. The V1 immersive redesign shipped in commit `274ad6c` and replaced that component entirely. Current bugs and fixes are tracked in `LIFELINE-PAGE-FIXES.md`, which is the authoritative fix list for the V1 build. Do not work from this section — use `LIFELINE-PAGE-FIXES.md` instead.

**Goal:** Make the current lifeline page functional and consistent with the rest of the app. No new features — just fixing what's broken.

**Estimate:** 2-3 days

### 3.1 Fix Memory Card Navigation

**Problem:** `MemoryCard` at line 282 passes `treeId=""` and `personId=""`. Lines 307-309 explicitly void both props with `void treeId; void personId;`.

**Fix:**

- Pass real `treeId` and `personId` to `MemoryCard` from `YearRow` and the undated section
- Wrap the card's outer `article` in a Next.js `Link` to `/trees/${treeId}/memories/${memory.id}`
- Add `?from=lifeline&personId=${personId}` query param so the memory detail page can link back
- Ensure keyboard accessibility (the `Link` should be focusable and the card should have `tabIndex={0}`)

**Files changed:**
- `apps/web/src/app/trees/[treeId]/people/[personId]/lifeline/page.tsx`

### 3.2 Add Auth Guard

**Problem:** No `useSession()` check; the person page redirects unauthenticated users at line 355.

**Fix:**

- Import `useSession` from the auth provider (matching the person page's pattern)
- Add the same redirect: if `session` is null and not loading, redirect to `/auth/signin?callbackUrl=${currentPath}`
- Ensure this runs before the data fetch effect

**Files changed:**
- `apps/web/src/app/trees/[treeId]/people/[personId]/lifeline/page.tsx`

### 3.3 Add Route Normalization

**Problem:** The person page resolves non-UUID route params (e.g., `/trees/1/people/2`) via `resolveCanonicalTreeId` and `resolveCanonicalPersonId`. The lifeline has none.

**Fix:**

- Import `isCanonicalTreeId`, `resolveCanonicalTreeId`, `isCanonicalPersonId`, `resolveCanonicalPersonId` from `@/lib/tree-route`
- Add the same early-redirect logic: if the `treeId` or `personId` from params is not canonical, resolve and redirect to the canonical URL
- This must run before the data fetch

**Files changed:**
- `apps/web/src/app/trees/[treeId]/people/[personId]/lifeline/page.tsx`
- Confirm `apps/web/src/lib/tree-route.ts` exports the needed utilities

### 3.4 Extract Shared Date Utilities

**Problem:** `extractYear()` exists with different regexes in at least 3 places:
- Lifeline page: `/\b(1[5-9]\d{2}|20\d{2}|21\d{2})\b/`
- Person page: `/\b(\d{4})\b/`
- Home utilities and tree layout: their own variants

**Fix:**

Create a shared utility file:

**New file:** `apps/web/src/lib/date-utils.ts`

```typescript
/**
 * Extract the most likely 4-digit year from a free-text date string.
 * Returns the LAST 4-digit year found (to handle "June 1952 or 1953" correctly
 * picking 1953, and "Summer of 1985" picking 1985).
 * Returns null if no 4-digit year is found.
 */
export function extractYear(text: string | null | undefined): number | null {
  if (!text) return null;
  const matches = text.match(/\b(\d{4})\b/g);
  if (!matches || matches.length === 0) return null;
  return Number(matches[matches.length - 1]);
}

/**
 * Extract month and day from a free-text date string.
 * Handles ISO formats (1952-06-15), spelled-out (June 15, 1952),
 * and slash formats (6/15/1952).
 */
export function extractMonthDay(
  text: string | null | undefined
): { month: number; day: number } | null {
  // ... implementation matching the pattern from trees.ts buildTodayHighlights
}

/**
 * Format an age display string.
 */
export function formatAgeText(age: number): string {
  if (age < 0) return "";
  return `age ${age}`;
}

/**
 * Era definitions with color tokens from the design system.
 */
export const LIFELINE_ERAS = [
  { label: "Childhood", ageStart: 0, ageEnd: 12, hue: "var(--lifeline-childhood, #C9A26A)" },
  { label: "Teen years", ageStart: 13, ageEnd: 19, hue: "var(--lifeline-teen, #A88B57)" },
  { label: "Young adult", ageStart: 20, ageEnd: 35, hue: "var(--lifeline-young-adult, #7A7A4F)" },
  { label: "Mid life", ageStart: 36, ageEnd: 55, hue: "var(--lifeline-mid-life, #4E5D42)" },
  { label: "Later years", ageStart: 56, ageEnd: 75, hue: "var(--lifeline-later, #5C4F3A)" },
  { label: "Elder years", ageStart: 76, ageEnd: 200, hue: "var(--lifeline-elder, #3F3424)" },
] as const;

export function eraForAge(
  age: number
): { label: string; hue: string } {
  return LIFELINE_ERAS.find((e) => age >= e.ageStart && age <= e.ageEnd)
    ?? LIFELINE_ERAS[LIFELINE_ERAS.length - 1];
}
```

**Update all call sites:**
- `lifeline/page.tsx`: Remove local `extractYear`, `ERAS`, `eraForAge`; import from `@/lib/date-utils`
- `people/[personId]/page.tsx`: Replace local `extractYear` with shared version
- `apps/web/src/components/home/homeUtils.ts`: Replace local `extractYearFromText`
- `apps/web/src/components/tree/treeLayout.ts`: Replace local year extraction

**Files changed:**
- New: `apps/web/src/lib/date-utils.ts`
- Modified: `lifeline/page.tsx`, `people/[personId]/page.tsx`, `homeUtils.ts`, `treeLayout.ts`

### 3.5 Include Contextual Memories

**Problem:** The lifeline only uses `directMemories`, ignoring contextual memories that surface via reach rules.

**Fix:**

- Merge `directMemories` and `contextualMemories` into a single chronological stream
- Add a `memoryContext` property so the UI can visually distinguish direct vs. contextual
- Contextual memories get:
  - A subtle left-border accent in `var(--ink-faded)` instead of era hue
  - An attribution line: "via family context" or the specific `memoryReasonLabel`
  - A slightly reduced visual weight (smaller card, muted background)
- Group contextual memories by year alongside direct memories
- Within a year group, direct memories sort first, contextual after

**Files changed:**
- `apps/web/src/app/trees/[treeId]/people/[personId]/lifeline/page.tsx`

### 3.6 Add Shimmer Loading State

**Problem:** "Loading lifeline..." is plain text; the rest of the app uses the `Shimmer` component.

**Fix:**

- Import `Shimmer` from `@/components/ui/Shimmer`
- Render 4-5 shimmer blocks matching the approximate shape of a loaded lifeline:
  - One tall shimmer for the header
  - Three shimmer blocks for year rows (year column + dot + card area)

**Files changed:**
- `apps/web/src/app/trees/[treeId]/people/[personId]/lifeline/page.tsx`

### 3.7 Convert Inline Styles to CSS Module

**Problem:** ~300 lines of `CSSProperties` constants. Some values are hardcoded (`#5C4F3A`) instead of using design tokens.

**Fix:**

- Create `apps/web/src/app/trees/[treeId]/people/[personId]/lifeline/lifeline.module.css`
- Migrate all style constants to CSS classes using design tokens (`var(--paper)`, `var(--ink)`, `var(--rule)`, `var(--gilt)`, `var(--font-display)`, etc.)
- Register era hue values as CSS custom properties in the module or `globals.css`:
  ```css
  --lifeline-childhood: #C9A26A;
  --lifeline-teen: #A88B57;
  --lifeline-young-adult: #7A7A4F;
  --lifeline-mid-life: #4E5D42;
  --lifeline-later: #5C4F3A;
  --lifeline-elder: #3F3424;
  ```
- Ensure dark mode variants are defined (darker, cooler-toned versions of the same hues)

**Files changed:**
- New: `lifeline/lifeline.module.css`
- Modified: `lifeline/page.tsx`
- Modified: `apps/web/src/app/globals.css` (add era hue variables)

### 3.8 Fix "Add the First Memory" Link

**Problem:** The link at line 166 navigates to the person page but doesn't open the memory composer.

**Fix:**

- Change the link to `/trees/${treeId}/people/${personId}?action=add-memory`
- On the person page, check for `action=add-memory` in the query string and auto-open the `AddMemoryWizard`

**Files changed:**
- `lifeline/page.tsx`
- `people/[personId]/page.tsx` (add query param handling)

---

## 4. Phase 2 — Person Page Lifeline Preview

**Goal:** Surface a compressed, interactive timeline within the person page so the lifeline is discoverable without navigation.

**Estimate:** 3-4 days
**Dependencies:** Phase 1

### 4.1 LifelinePreview Component

A new section in the person page's scrolling layout, positioned between "Life" and "Stories" sections.

**New file:** `apps/web/src/components/tree/LifelinePreview.tsx`

**Props:**

```typescript
interface LifelinePreviewProps {
  treeId: string;
  personId: string;
  birthYear: number | null;
  deathYear: number | null;
  isLiving: boolean;
  displayName: string;
  directMemories: Memory[];
  contextualMemories: Memory[];
  relationships: Relationship[];
}
```

**Visual Design:**

```
┌─────────────────────────────────────────┐
│ LIFELINE                          ══╗  │
│                                    ║  │
│ ● 1930  Born                      ║  │
│ │ June 3, 1930 · San Antonio, TX   ║  │
│ │                                   ║  │
│ ● 1952  Age 22 · Young adult      ║  │
│ │   3 memories                      ║  │
│ │   ∞ Married Julio Alvarez         ║  │
│ │                                    ║  │
│ ● 1968  Age 38 · Mid life          ║  │
│ │   1 memory                        ║  │
│ │                                    ║  │
│ ● 1985  Age 55 · Later years       ║  │
│ │   5 memories                      ║  │
│ │                                    ║  │
│ ● 2017  Passed                     ║  │
│ │ February 14, 2024                 ║  │
│                                    ══╝  │
│                                         │
│ [Open full lifeline →]  [Drift →]      │
└─────────────────────────────────────────┘
```

**Behavior:**

- Section only renders if the person has at least one memory with an extractable date, or birth/death dates that can be displayed
- Uses the same vertical spine design as the dedicated lifeline but compressed: one line per year that has memories, showing only the year, age/era, and memory count
- Era color-coding on spine nodes (from shared `LIFELINE_ERAS`)
- Relationship events appear as inline markers (e.g., "∞ Married Julio Alvarez")
- Hover on a year row shows a floating card with the top memory title and thumbnail for that year
- Click on a year row navigates to the dedicated lifeline page at `/trees/${treeId}/people/${personId}/lifeline?year=${year}`
- "Open full lifeline" link navigates to the dedicated page
- "Drift" link opens DriftMode with `personId` filter (reuse existing DriftChooserSheet integration)

**Compressed rendering rules:**
- If a year has only 1 memory, show: `"1 memory"`
- If 2-5: `"3 memories"`
- If 6+: `"12 memories"` — don't enumerate
- For the hover preview, show the first (most featured/curated) memory

### 4.2 Person Page Section Navigation

**Changes to `people/[personId]/page.tsx`:**

- Add "Lifeline" to the sidebar section navigation (alongside Life, Stories, Archive, Family, Questions, Shared context)
- Give it section ID `lifeline`
- Change the header "Lifeline" pill from `Link` navigation to scroll-to-section behavior (same as the other section pills)
- Keep `Link` navigation to the dedicated page accessible from within the `LifelinePreview` component

**Section ordering:**

| # | Section ID | Label |
|---|-----------|-------|
| 1 | `life` | Life |
| 2 | `lifeline` | Lifeline | ← NEW
| 3 | `stories` | Stories |
| 4 | `archive` | Archive |
| 5 | `family` | Family |
| 6 | `questions` | Questions |
| 7 | `context` | Shared context |

**Files changed:**
- New: `apps/web/src/components/tree/LifelinePreview.tsx`
- Modified: `apps/web/src/app/trees/[treeId]/people/[personId]/page.tsx`

---

## 5. Phase 3 — Dedicated Lifeline Immersive Redesign

**Goal:** Transform the lifeline from a basic year-grouped list into an immersive, interactive, editorial experience that embodies the app's design philosophy.

**Estimate:** 5-7 days
**Dependencies:** Phase 1

### 5.1 File Structure

Replace the monolithic 571-line page with a component-based structure:

```
apps/web/src/components/lifeline/
├── LifelinePage.tsx            ← main page component (data fetching, auth, layout)
├── LifelineHeader.tsx         ← person header with portrait, name, dates, CTAs
├── LifelineSpine.tsx          ← vertical spine line + year markers
├── LifelineYearGroup.tsx      ← a single year's content block
├── LifelineMemoryCard.tsx     ← a single memory rendered on the timeline
├── LifelineAnchorRow.tsx      ← birth/death marker row
├── LifelineRelationship.tsx   ← relationship event marker
├── LifelineUndated.tsx        ← "Time unknown" section
├── LifelineEraRail.tsx        ← fixed era navigation sidebar
├── LifelineMinimap.tsx        ← compressed lifespan overview (Phase 7)
├── LifelineChapterBreak.tsx   ← chapter section divider (Phase 4)
└── lifeline.module.css        ← shared CSS module
```

The route file at `apps/web/src/app/trees/[treeId]/people/[personId]/lifeline/page.tsx` becomes a thin shell that renders `<LifelinePage />`.

### 5.2 Visual Design — "Open Book" Timeline

**Design metaphor:** The lifeline reads like the chronological appendix of a biography. Not a social media timeline, not a Gantt chart — a **book's chapter-by-chapter progression through a life**.

#### Header

```
┌────────────────────────────────────────────────────────────────┐
│  ← Rosa Alvarez                                               │
│                                                                │
│  ████████████████████   Rosa Alvarez                           │
│  ████████████████████   1928 — 2024                           │
│  ████████████████████   "Loved the garden, terrible at cards"  │
│  ████████████████████                                          │
│  ████████  portrait  ▬▭▭▭▭▭▭▭▭▭▭▭▭▭▭▭▭▭▭▭▭▭▭▭▭▭▭▭▭▭▭▭▭  │
│  ████████████████████                                          │
│  ████████████████████   [Drift this life]  [Add a memory]      │
│                                                                │
│  ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ──  │
└────────────────────────────────────────────────────────────────┘
```

- Full-width header with portrait and overlaid text (reuses person page cinematic portrait pattern)
- Name in `var(--font-display)`, large (32-38px)
- Date range in small text: "1928 — 2024"
- Essence line in italic `var(--font-body)`
- Action buttons: "Drift this life" (moss accent) and "Add a memory" (rule-bordered)

#### Year Markers

Each year that has memories gets a horizontal rule with the year typeset in `var(--font-display)`:

```
── 1952 ──────────────────────────────────────────────── ∙ ∙ ──
   AGE 22 · Young adult
```

- Year number is large (22-26px), serif, aligned to a consistent left column
- The `──` line extends the full content width in `var(--rule)`, creating a running header effect
- Age and era label sit below the year in small `var(--font-ui)` text
- Era label is colored using the era's CSS variable hue

#### Memory Cards

Each memory within a year is a card that respects the design brief's "mounted, matted" philosophy:

**Photographs:**
```
┌───────────────────────────────────────────────┐
│  ┌─────────────────────────────────────┐      │
│  │                                      │     │
│  │           [matted photo]             │     │
│  │                                      │     │
│  └─────────────────────────────────────┘      │
│  "Rosa at the church"                         │
│  ✎ by Elena Alvarez · December 1952          │
│  📍 San Antonio, TX                          │
└───────────────────────────────────────────────┘
```

- Photo has a generous matte (16-24px padding in `var(--paper)`)
- Preserves original aspect ratio (never cropped to fill)
- Subtle inner shadow (`box-shadow: inset 0 1px 3px var(--shadow)`)
- Title in `var(--font-display)`, 16-18px
- Attribution ("by [name]") in `var(--ink-faded)`, `var(--font-ui)`
- Place in `var(--ink-faded)` with a small map-pin icon (not emoji — use a custom thin-line icon)
- Clicking navigates to memory detail page

**Voice Memories:**
```
┌───────────────────────────────────────────────┐
│  🎙  "How we met"                 3:24       │
│  ─────────────●────────────────────           │
│  "Your grandfather was so nervous..."          │
│  ✎ by Rosa Alvarez                            │
└───────────────────────────────────────────────┘
```

- Audio player with a simplified waveform/progress bar (thin line, accent color for played portion)
- Duration displayed
- Transcript excerpt (first 2-3 lines, truncated)
- Clicking the card opens the full memory detail page (which has full transcript + audio player)

**Stories:**
```
┌───────────────────────────────────────────────┐
│  📖  "Sunday dinners at home"                  │
│                                                │
│  Every Sunday without fail, the house          │
│  would fill with the smell of mole             │
│  negro. Abuela would start early               │
│  in the morning...                             │
│                                                │
│  ✎ by Elena Alvarez · 1968                    │
│  📍 142 Maple Street, San Antonio              │
└───────────────────────────────────────────────┘
```

- Typeset as prose in `var(--font-body)`, 15-16px, generous line-height (1.6-1.75)
- Measure capped at ~65 characters (max-width 480px for the text block)
- Italic for quoted speech within the story
- Story body is truncated to 5 lines with a "Continue reading →" link
- Clicking navigates to memory detail page

**Documents:**
```
┌───────────────────────────────────────────────┐
│  ┌──────────────┐                              │
│  │  [scanned     │  "Grandma's mole recipe"    │
│  │   document    │                              │
│  │   thumbnail]  │  ✎ by Rosa Alvarez          │
│  └──────────────┘                              │
└───────────────────────────────────────────────┘
```

- Thumbnail to the left, metadata to the right (horizontal layout, like a library card)
- The "Hands" category from the spec — recipe cards, handwriting, letters — gets this treatment

#### Contextual Memory Visual Treatment

Contextual memories (surfaced via reach rules rather than direct tagging) get a subtly different treatment:

- Lighter background: `var(--paper)` instead of `var(--paper-deep)`
- A thin left border in `var(--rule)` (2px) instead of the era-hued left accent
- Attribution line says: "via family context" or the specific `memoryReasonLabel` (e.g., "Shared with Rosa's descendants")
- Slightly smaller card size (90% of direct memory card width)

#### Birth/Death Markers

```
── 1930 ────────────────────────────────────────────── ∙ ∙ ──
   BORN · June 3, 1930
   San Antonio, TX

── 2024 ────────────────────────────────────────────── ∙ ∙ ──
   PASSED · February 14, 2024
```

- "BORN" and "PASSED" labels in small caps, `var(--font-ui)`, letter-spacing 0.12em
- BORN uses `var(--gilt)` accent (gold, like the design system's token for significant markers)
- PASSED uses `var(--ink-soft)` — warm and understated, not funereal
- Place shown if available
- No decorative crosses, wreaths, or funerary iconography

#### Relationship Event Markers

```
   ∞ Married Julio Alvarez · 1952
   ↔ Partnership with Maria ended · 1978
```

- Marriage: `∞` symbol in `var(--rose)`, followed by partner name and date
- Partnership end: `↔` symbol in `var(--ink-faded)`
- These render inline within the year group, between memory cards
- Clicking the partner's name navigates to their person page

### 5.3 Era Navigation Rail

A fixed sidebar (desktop) or horizontal strip (mobile) for era-based navigation.

**Desktop** (`min-width: 768px`):
```
┌──────────────┐
│  Childhood   │  (3)
│  ──────────  │
│  Teen years  │  (0)
│  ──────────  │
│  Young adult │  (7)  ← highlighted if scroll is here
│  ──────────  │
│  Mid life    │  (12)
│  ──────────  │
│  Later years │  (5)
│  ──────────  │
│  Elder years │  (2)
└──────────────┘
```

- Each era label is clickable, scrolling to the first year in that era
- Memory count in parentheses
- The currently visible era is highlighted with `var(--moss)` left-border accent + bolder text
- Uses `IntersectionObserver` on year markers to detect which era is in view
- On scroll, updates the highlighted era in real-time

**Mobile** (`max-width: 767px`):
```
[Childhood] [Teen] [Young adult] [Mid life] [Later] [Elder]
 ────────── scrolled horizontally
```

- Horizontal scrollable chip strip (like the existing `EraRibbon`)
- Active era is highlighted
- No memory counts on mobile (too cramped)

**Implementation:**
- `LifelineEraRail.tsx` — client component with `IntersectionObserver`
- Fixed position on desktop: `position: sticky; top: 120px` in a left column
- The main content area uses a two-column grid: `[era-rail (160px)] [timeline content (1fr)]`
- On mobile, the rail collapses to a horizontal strip at the top

### 5.4 Scroll-Triggered Reveal

Memories appear as you scroll into view, using the same `useTrailReveal()` pattern from `AtriumMemoryTrail`:

- Each year group has a threshold observation
- When 16% of the group enters the viewport, it fades in with a gentle `translateY(16px → 0) + opacity(0 → 1)` transition
- Duration: `var(--duration-focus)` (500ms)
- Easing: `var(--ease-tessera)`
- `prefers-reduced-motion: reduce` → instant appearance, no animation

### 5.5 "Drift This Life" Integration

The header includes a "Drift this life" button:

- Clicking opens `DriftMode` with `personId` filter set to the current person
- If the person is deceased, open with `mode=remembrance` by default
- The drift attribution bar shows "From Rosa's lifeline" instead of "From the Alvarez archive"
- Drift's "Open [person]'s archive" CTA returns to the lifeline page (not the general person page)

### 5.6 "Add Memory" Integration

The header includes an "Add a memory" button:

- Clicking opens `AddMemoryWizard` with `primaryPersonId` pre-filled
- After the wizard completes and the memory is created:
  - The lifeline data refetches
  - The new memory appears at its chronologically correct position
  - The new year group gets a subtle entrance animation
  - If the memory has no date, it appears in the "Time unknown" section
- The wizard should also pre-suggest a `dateOfEventText` based on the currently-visible era/year (e.g., if you're looking at 1975 and click "add memory", the date field could suggest "1975")

---

## 6. Phase 4 — Life Chapters

**Goal:** Enable curated narrative chapters on the lifeline — system-suggested, user-refinable.

**Estimate:** 5-7 days
**Dependencies:** Phase 3 (UI surface must exist before chapters can be rendered on it)

### 6.1 Schema Addition

**New tables in `packages/database/src/schema.ts`:**

```typescript
// Life chapters for a person's lifeline
export const lifeChapters = pgTable("life_chapters", {
  id: uuid("id").primaryKey().defaultRandom(),
  personId: uuid("person_id").notNull().references(() => people.id),
  treeId: uuid("tree_id").notNull().references(() => trees.id),
  title: varchar("title", { length: 200 }).notNull(),
  subtitle: varchar("subtitle", { length: 255 }),
  chapterKind: varchar("chapter_kind", { length: 20 }).notNull().default("curated"),
  // 'curated' = user-created or user-refined
  // 'system_suggested' = auto-generated draft, unrefined
  sortOrder: integer("sort_order").notNull().default(0),
  startDateText: varchar("start_date_text", { length: 100 }),
  endDateText: varchar("end_date_text", { length: 100 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Memories within a life chapter
export const lifeChapterMemories = pgTable("life_chapter_memories", {
  id: uuid("id").primaryKey().defaultRandom(),
  chapterId: uuid("chapter_id").notNull().references(() => lifeChapters.id, { onDelete: "cascade" }),
  memoryId: uuid("memory_id").notNull().references(() => memories.id),
  sortOrder: integer("sort_order").notNull().default(0),
  caption: text("caption"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
```

**Migration:** Create a new migration file adding both tables. Add indexes on `life_chapters(person_id, tree_id)` and `life_chapter_memories(chapter_id)`.

### 6.2 System-Suggested Chapter Generation

When a person has >= 5 memories with extractable dates, the system can auto-generate chapter drafts. This is a server-side function callable via API:

**Logic** (in a new `apps/api/src/lib/lifeline-service.ts`):

```
1. Extract all years from the person's direct memories
2. Compute the person's lifespan range (birthYear...deathYear or currentYear)
3. Define era boundaries using the shared era definitions
4. For each era that has >= 1 memory:
   a. Create a chapter with title = era label (e.g., "Childhood")
   b. Set startDateText and endDateText based on era age range + birthYear
   c. Assign all memories with dates in that range to the chapter
   d. Mark chapter_kind = 'system_suggested'
5. Additionally check for relationship events:
   a. If there are marriage/partnership start dates, create a chapter like
      "Family life" spanning from the earliest marriage to the latest family-related memory
   b. Check for memories co-tagged with children/spouse to validate
6. Return the generated chapters
```

**Important:** System-suggested chapters are drafts. They should NOT auto-save. The API returns suggested chapters, and the user must explicitly accept them (or they auto-save with `chapter_kind='system_suggested'` and a UI affordance to refine or dismiss).

### 6.3 Chapter UI on the Lifeline

Chapters appear as **section breaks** between era-year groups:

```
── CHAPTER: Childhood ──────────────────────────────────
   Growing up in San Antonio
   (3 memories · system suggested)

   [year 1932 group]
   ── 1932 ─── age 2 ───
   [memories...]

   [year 1938 group]
   ── 1938 ─── age 8 ───
   [memories...]

── CHAPTER: Young Adult ────────────────────────────
   Leaving home, starting a family
   (7 memories · curated by Elena Alvarez)

   [year 1950 group]
   ...
```

**Chapter header design:**
- Title in `var(--font-display)`, 24-28px, italic
- Subtitle in `var(--font-body)`, 15px, `var(--ink-soft)`
- Decorative rule above the chapter title (a hairline with center dot: `── ─ ─ ─ ─ ─ ─`)
- Chapter-kind indicator:
  - `system_suggested`: A subtle "Draft" badge in `var(--paper-deep)` with `var(--ink-faded)` text + a "Refine" CTA
  - `curated`: An attribution line "Curated by [name]" in `var(--ink-faded)`
- Memory count below the subtitle
- Left-border accent: era hue for system-suggested, `var(--moss)` for curated

**Chapter interaction:**
- **"Refine" CTA**: Opens a chapter editing panel (slide-in drawer or inline editing mode) where the user can:
  - Rename the chapter
  - Edit the subtitle
  - Drag-reorder memories within the chapter
  - Remove memories from the chapter
  - Add memories to the chapter (searchable picker from undated or other-year memories)
  - Accept the chapter (changes `chapter_kind` to `curated`)
  - Dismiss the chapter (deletes it; its memories return to the main timeline)
- **"Edit chapter" affordance** (curated chapters): Same panel but starts in editing mode

### 6.4 Chapter API Routes

**New file:** `apps/api/src/routes/lifeline-chapters.ts`

| Method | Route | Purpose |
|--------|-------|---------|
| `GET` | `/api/trees/:treeId/people/:personId/chapters` | List chapters with their memories, sorted by `sortOrder` |
| `POST` | `/api/trees/:treeId/people/:personId/chapters` | Create a new chapter |
| `POST` | `/api/trees/:treeId/people/:personId/chapters/suggest` | Generate system-suggested chapters (does not save; returns drafts for acceptance) |
| `PATCH` | `/api/trees/:treeId/chapters/:chapterId` | Update title, subtitle, sortOrder, dates |
| `DELETE` | `/api/trees/:treeId/chapters/:chapterId` | Delete chapter (memories return to main timeline; cascade deletes `life_chapter_memories`) |
| `POST` | `/api/trees/:treeId/chapters/:chapterId/memories` | Add a memory to a chapter |
| `PATCH` | `/api/trees/:treeId/chapters/:chapterId/memories/reorder` | Reorder memories within a chapter (accepts array of `{memoryId, sortOrder}`) |
| `DELETE` | `/api/trees/:treeId/chapters/:chapterId/memories/:memoryId` | Remove a memory from a chapter |
| `PATCH` | `/api/trees/:treeId/chapters/:chapterId/accept` | Accept a system-suggested chapter (changes kind to `curated`) |

**Permission checks:**
- Chapters are editable by stewards, founders, and the subject (if linked)
- Viewers and contributors can see chapters but not edit them
- System suggestions are only generated for people where the requester has edit access

### 6.5 Chapter Editing Drawer

**New component:** `apps/web/src/components/lifeline/LifelineChapterEditor.tsx`

A slide-in drawer (matching the existing `BiographyDrawer` pattern) for editing a chapter:

- Slide-in from the right with Framer Motion `AnimatePresence`
- Contains:
  - Title input (text field)
  - Subtitle input (text field)
  - Date range display (start → end, read-only, derived from memories)
  - Memory list with drag-reorder (use `@dnd-kit/core` or similar, if already in deps; otherwise, simple up/down buttons)
  - "Add memory" button that opens a searchable memory picker
  - "Remove" button per memory (removes from chapter, not from the tree)
  - "Accept chapter" button (system-suggested → curated)
  - "Dismiss chapter" button (deletes the chapter)
  - "Save" and "Cancel" buttons

---

## 7. Phase 5 — Dedicated Timeline API

**Goal:** Create a purpose-built API endpoint for timeline data instead of reusing the full person detail endpoint.

**Estimate:** 2-3 days
**Dependencies:** Phase 3 (the API shape should serve the redesigned UI)

### 7.1 New Endpoint

**Route:** `GET /api/trees/:treeId/people/:personId/timeline`

**Query parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `yearStart` | number (optional) | Filter to years >= this value |
| `yearEnd` | number (optional) | Filter to years <= this value |
| `includeContextual` | boolean (optional, default true) | Include contextual memories |
| `includeRelationshipEvents` | boolean (optional, default true) | Include marriage/partnership events |
| `includeChapters` | boolean (optional, default true) | Include life chapters |

**Response shape:**

```json
{
  "person": {
    "id": "uuid",
    "displayName": "Rosa Alvarez",
    "essenceLine": "Loved the garden, terrible at cards",
    "birthDateText": "June 3, 1930",
    "deathDateText": "February 14, 2024",
    "birthPlaceResolved": {
      "label": "San Antonio, TX",
      "latitude": 29.4241,
      "longitude": -98.4936
    },
    "deathPlaceResolved": null,
    "isLiving": false,
    "portraitUrl": "https://..."
  },
  "timeline": {
    "birthYear": 1930,
    "deathYear": 2024,
    "lifespanYears": 94,
    "yearGroups": [
      {
        "year": 1952,
        "age": 22,
        "era": {
          "label": "Young adult",
          "hue": "var(--lifeline-young-adult)"
        },
        "memories": [
          {
            "id": "uuid",
            "kind": "photo",
            "title": "Rosa at the church",
            "body": null,
            "dateOfEventText": "December 1952",
            "mediaUrl": "https://...",
            "mimeType": "image/jpeg",
            "place": { "label": "San Antonio, TX" },
            "memoryContext": "direct",
            "contributorName": "Elena Alvarez",
            "perspectiveCount": 0,
            "isFeatured": false
          }
        ],
        "relationshipEvents": [
          {
            "year": 1952,
            "type": "marriage",
            "label": "Married Julio Alvarez",
            "partnerPersonId": "uuid",
            "partnerDisplayName": "Julio Alvarez",
            "dateText": "1952"
          }
        ]
      }
    ],
    "undated": [
      {
        "id": "uuid",
        "kind": "story",
        "title": "A quiet afternoon",
        "body": "The house was always...",
        "memoryContext": "contextual",
        "memoryReasonLabel": "Shared with Rosa's descendants",
        "contributorName": "Maria Alvarez"
      }
    ]
  },
  "chapters": [
    {
      "id": "uuid",
      "title": "Childhood",
      "subtitle": "Growing up in San Antonio",
      "chapterKind": "system_suggested",
      "sortOrder": 0,
      "startDateText": "1930",
      "endDateText": "1948",
      "memoryCount": 3
    }
  ],
  "eraCounts": {
    "Childhood": 3,
    "Teen years": 0,
    "Young adult": 7,
    "Mid life": 12,
    "Later years": 5,
    "Elder years": 2
  }
}
```

### 7.2 Backend Service

**New file:** `apps/api/src/lib/lifeline-service.ts`

Key functions:

```typescript
/**
 * Build the full timeline data for a person.
 * Reuses cross-tree-read-service for visibility and reach expansion,
 * but returns only the timeline-relevant subset.
 */
async function buildPersonTimeline(
  db: DrizzleClient,
  params: {
    treeId: string;
    personId: string;
    viewerUserId: string;
    yearStart?: number;
    yearEnd?: number;
    includeContextual?: boolean;
    includeRelationshipEvents?: boolean;
    includeChapters?: boolean;
  }
): Promise<LifelineResponse>
```

The function:
1. Calls `getTreeScopedPerson()` for person metadata
2. Calls `getTreeMemories()` for visible memories
3. Splits into direct/contextual using `memoryPersonTags`
4. Groups by year using `extractYear(dateOfEventText)` (server-side matching the shared utility)
5. Loads relationships for the person to extract marriage/partnership events with dates
6. Loads life chapters if `includeChapters` is true
7. Computes era counts
8. Returns the shaped response

### 7.3 Performance Considerations

- The response is **paginated by year range** (use `yearStart`/`yearEnd` for infinite scroll or year-jumping)
- For large lifespans with many memories, the client should request year ranges in batches
- The server should cache the timeline computation for 60 seconds (memoize by `personId + treeId + viewerUserId`)
- The era counts and year list should be fast to compute since they only need year extraction, not full memory serialization

---

## 8. Phase 6 — Memory System Integration

**Goal:** Make the timeline feel like a living, bidirectional part of the memory system — not a read-only view.

**Estimate:** 3-4 days
**Dependencies:** Phases 2, 3, 5

### 8.1 Timeline → Memory Detail

Every memory card on the timeline links to `/trees/${treeId}/memories/${memoryId}?from=lifeline&personId=${personId}`.

**On the memory detail page:**
- Check for `from=lifeline` query param
- If present, the "back" navigation renders as "← Return to {person.displayName}'s lifeline" instead of the default back behavior
- The link navigates to `/trees/${treeId}/people/${personId}/lifeline`

**Files changed:**
- `apps/web/src/app/trees/[treeId]/memories/[memoryId]/page.tsx`

### 8.2 Memory Detail → Timeline

Add a "View on timeline" link in the memory detail page's metadata sidebar:

- Only shown if the memory has an extractable year AND a `primaryPersonId`
- Navigates to `/trees/${treeId}/people/${primaryPersonId}/lifeline?year=${extractedYear}`
- The lifeline page should scroll to the year specified in `?year=` on load (using `scrollIntoView` with the year group's ID)

**Files changed:**
- `apps/web/src/app/trees/[treeId]/memories/[memoryId]/page.tsx`
- `apps/web/src/app/trees/[treeId]/people/[personId]/lifeline/page.tsx` (add year-scroll logic)

### 8.3 AddMemoryWizard → Timeline

When creating a memory from the lifeline page:

- The "Add a memory" button passes `primaryPersonId` and optionally `dateOfEventText` to the wizard
- After saving, the lifeline data refetches
- The new memory appears at its chronologically correct position with an entrance animation
- If the memory has no date, it appears in the "Time unknown" section
- The wizard's success callback should trigger `router.refresh()` or a SWR/incremental revalidation

**Implementation:**
- The `AddMemoryWizard` already accepts props for pre-filling; extend with `defaultDateOfEventText`
- The lifeline page's `fetch` should be wrapped in a reusable `refreshLifeline()` function called after wizard completion

### 8.4 Curation → Timeline

The curation queue (`/trees/[treeId]/curation`) has a "Needs date" category for memories without `dateOfEventText`.

**Integration:**
- When a memory in the curation queue gets a date assigned to it, it automatically becomes eligible for the timeline
- Add a "See on timeline" link for memories that now have a date (visible after date is filled in)
- This link navigates to the lifeline page scrolled to the appropriate year

**Files changed:**
- `apps/web/src/app/trees/[treeId]/curation/page.tsx`

### 8.5 Prompt Replies → Timeline

When a prompt reply creates a memory:

- If the reply includes a date (from the prompt's question context or manually entered), the memory appears on the timeline
- If no date, it goes to "Time unknown"
- The prompt's `responded_at` timestamp could serve as a fallback date approximation if no `dateOfEventText` is provided
- The lifeline should show recent prompt replies with a subtle "Answered a question" badge

**Files changed:**
- `apps/api/src/routes/prompts.ts` (set `dateOfEventText` to approximated date if missing)
- `apps/web/src/app/trees/[treeId]/people/[personId]/lifeline/page.tsx` (display prompt-reply badge)

### 8.6 Person Page ↔ Lifeline Bidirectional Links

From the lifeline page:
- The header's "← Back to {displayName}" link returns to the person page scrolled to the "Lifeline" section

From the person page:
- The LifelinePreview section's "Open full lifeline" link navigates to the dedicated page
- Scroll position should be preserved: if the user was viewing "Mid life" in the preview, the full lifeline opens scrolled to the same era

---

## 9. Phase 7 — Advanced Interactivity

**Goal:** Add premium interactive features that make the lifeline feel alive and deeply connected to the rest of the app.

**Estimate:** 4-5 days
**Dependencies:** Phases 3, 4, 5

### 9.1 Horizontal Timeline Minimap

A compressed lifespan overview at the top of the dedicated lifeline page:

**Visual design:**
```
  1930                     1977                     2024
   ●───╌╌╌──●────●───●───╌╌╌──●────●──────────────●
   Born    3    5    1     7    2              Passed
           mems mems mem  mems mems
```

- Proportional horizontal positioning along the lifespan
- Each year with memories gets a node; node size maps to memory count (1-3 memories = small dot, 4-10 = medium, 11+ = large)
- Node color maps to era hue
- Birth and death markers at endpoints
- A subtle translucent rectangle overlays the currently visible viewport region
- **Click/drag** to jump to a year or year range in the vertical timeline
- **Scroll indicator**: as you scroll the vertical timeline, the viewport indicator on the minimap moves correspondingly

**Implementation:**
- `LifelineMinimap.tsx` — SVG component
- The minimap width equals the timeline content width
- Each year is positioned at `((year - birthYear) / lifespan) * 100%`
- Uses `IntersectionObserver` or scroll-position tracking to update the viewport indicator
- Clicking a point on the minimap scrolls the vertical timeline to that year group

### 9.2 Multi-Perspective Indicator

When a memory has perspectives (via `memory_perspectives`), the timeline shows:

1. A small "2 voices" / "3 voices" badge on the memory card
2. Expanding the card reveals perspective snippets with contributor names
3. A "Read all perspectives" link navigates to the memory detail page's perspectives section

**Visual treatment:**
- Perspectives render as secondary commentary blocks, slightly indented
- Each perspective has a contributor name and a short excerpt (1-2 lines)
- The primary memory is the "lead" voice; perspectives are "other voices"
- Background treatment: `var(--paper)` with a thin `var(--rule)` left border

### 9.3 Anniversary Integration

When viewing the lifeline of a person with an upcoming birthday or deathiversary:

- If the person is deceased and their deathiversary is within 7 days, show:
  *"Tuesday will be one year since Rosa passed."*
- If the person's birthday is within 7 days, show:
  *"Saturday would have been Rosa's 96th birthday."*
- Round-number milestones (100th, 75th, 50th, 25th, 10th, 5th) get a `var(--gilt)` accent callout
- Each callout has a "Drift through her memories" CTA
- For living people: *"Rosa's 96th birthday is on Saturday."* with different tone

**Data source:** Reuse `buildTodayHighlights` from the Atrium's API endpoint. The lifeline API can return an `anniversaryNotice` field.

### 9.4 Keyboard Navigation

The lifeline should support keyboard-first navigation:
- `↑` / `↓` — Move between year groups
- `Enter` — Open the focused year group's first memory
- `Escape` — Close any open drawer/panel
- `[` / `]` — Move between eras (jump to first year of previous/next era)
- `/` — Focus the year filter input

### 9.5 Year Filter Control

At the top of the lifeline (below the header, above the minimap), a subtle year range selector:

```
── Showing 1930 — 2024 ·  [  1940  ] ─── [  1990  ]  ──
```

- Two small inputs for start and end year
- Adjusting either filters the visible year groups (no page reload, just re-render)
- The minimap updates its viewport indicator
- The era rail updates its era counts
- Clear button to reset to full range

---

## 10. Implementation Order and Estimates

### Recommended Build Sequence

```
Phase 1: Fix What's Broken        (2-3 days)
   │
   ▼
Phase 3: Immersive Redesign       (5-7 days)   ← do before Phase 2 so the
   │                                           dedicated page is solid first
   ▼
Phase 5: Dedicated Timeline API   (2-3 days)
   │
   ▼
Phase 2: Person Page Preview      (3-4 days)   ← now build the preview that
   │                                           links to the polished page
   ▼
Phase 6: Memory Integration       (3-4 days)
   │
   ▼
Phase 4: Life Chapters            (5-7 days)   ← chapters build on the
   │                                           stable timeline surface
   ▼
Phase 7: Advanced Interactivity   (4-5 days)
```

**Total estimate:** 24-33 days

### Rationale for This Order

1. **Phase 1 first** because shipping broken code is not acceptable. The fixes are small and unblock everything else.
2. **Phase 3 before Phase 2** because the dedicated page is the "source of truth" for the lifeline experience. Building the compressed preview before the full page would require guessing at the design, leading to rework.
3. **Phase 5 before Phase 2 and 6** because the person page preview and memory integration both benefit from the dedicated API. Loading the full person endpoint for a preview section adds unnecessary weight.
4. **Phase 4 after Phase 3, 5, and 6** because chapters need the redesigned UI, the API, and working memory integration to be useful.
5. **Phase 7 last** because it's the most ambitious and depends on everything else being stable.

---

## 11. Design Principles for the Lifeline

These extend the product-wide design principles from SPEC.md and UI-INSPIRATION-BRIEF.md with lifeline-specific guidance:

1. **Chapter, not feed.** The lifeline reads like a chronological chapter in a biography. It should never feel like scrolling a social media timeline, activity log, or changelog.

2. **Spine, not list.** The vertical spine with era-colored nodes gives the timeline gravitas and spatial coherence. The spine should feel architectural — a structural element of the page, not a decorative flourish.

3. **Sparse is honest.** A person with 3 dated memories gets a dignified, short lifeline — not shame-inducing empty gaps or "complete your timeline!" nudges. The empty state copy should read something like: *"A few memories placed in time. That is enough."*

4. **Contextual memories belong.** Family-context memories appear on the timeline with clear attribution. A person's lifeline isn't limited to what was directly tagged — it includes what the family remembers about them.

5. **Relationships are events.** Marriages, partnerships, and other relationship milestones are life events and belong on the timeline alongside memories. They should feel like narrative markers, not data points.

6. **Eras breathe.** Era labels provide gentle narrative structure but don't rigidly partition the timeline. A memory from age 19 ("Teen years") that continues into "Young adult" themes doesn't need to be forcefully categorized.

7. **Chapters are curated, not auto-generated.** System suggestions are drafts that the user refines. The user is the editor. The system proposes; the human decides.

8. **The timeline bridges everywhere.** Timeline ↔ memory detail, timeline ↔ drift, timeline ↔ curation, timeline ↔ prompts. The lifeline is a hub, not a dead end. Every memory on the timeline should be one click from its full story.

9. **Time unknown is honest, not broken.** Undated memories aren't a failure. They belong to the person even if we don't know when. Their section should read like: *"Some memories arrive without a date. They belong here."*

10. **Motion breathes.** Scroll-reveal is gentle — a slow fade, a slight rise, then rest. No bouncing, snapping, or spring physics. The animation should feel like pages settling after being turned.

---

## 12. Open Questions

These questions should be resolved before or during implementation:

| # | Question | Options | Recommendation |
|---|----------|---------|----------------|
| 1 | **Should chapters replace or supplement era-based grouping?** | (a) Chapters completely replace era grouping, (b) Chapters overlay onto era grouping, (c) User can toggle between chapter view and raw-era view | **(b)** — Chapters provide curated narrative on top of the raw chronological spine. If a person has no chapters, you see eras. If they have chapters, chapters appear as section breaks between eras. |
| 2 | **Should the minimap be interactive (draggable viewport) or static (click-only)?** | (a) Full drag-to-reposition, (b) Click-only jump to year, (c) Static overview with no interaction | **(b) for V1** — Click-to-jump is simpler and sufficient. Drag can be added later. |
| 3 | **How should system-suggested chapters be stored?** | (a) Auto-saved as `system_suggested` (user can refine or dismiss), (b) Only returned by the suggest endpoint, never persisted until accepted | **(a)** — Auto-save with `system_suggested` kind. This way the chapters appear on the lifeline immediately (making it richer), and the user can refine or dismiss. Only generating on-demand (b) means the user might never see them. |
| 4 | **Should the lifeline support infinite scroll or load all at once?** | (a) Load all years at once (simpler, works for most people), (b) Infinite scroll with year-range batching | **(a) for V1** — Most people will have < 100 year groups. Switch to (b) if performance testing shows issues for high-memory-count people. |
| 5 | **Should the era rail be sticky or scroll with the page?** | (a) `position: sticky` so it follows scroll, (b) Fixed position always visible, (c) Scroll with the page | **(a)** — Sticky top so it follows the user but doesn't consume permanent screen space. |
| 6 | **Should free-text dates be parsed into structured dates in the database?** | (a) Keep as free-text (current), (b) Add parsed `date_of_event` timestamp column, (c) Add a `year_int` column alongside the text | **(c)** — Adding a `year_of_event INT` column (nullable) would dramatically improve timeline query performance and sorting reliability without losing the free-text richness. This is a schema migration that should be planned alongside Phase 5. |
| 7 | **How much of the person page should the lifeline header duplicate?** | (a) Full cinematic portrait header (like person page), (b) Compact header with portrait thumbnail, name, dates, (c) No header — use browser back button only | **(b)** — Compact header. A full cinematic portrait would be redundant since the user just came from the person page. But some context is needed since they may arrive directly via URL. |
| 8 | **Should the lifeline be exportable?** | (a) No standalone export, (b) Include lifeline view in person-level mini-archive export, (c) Dedicated lifeline PDF/export | **(b)** — When a person-level mini-archive export is built (Phase 5 of PRODUCT-ROADMAP), the lifeline view should be a section in that export. No standalone needed yet. |

---

## Appendix A: Shared Type Definitions

These types should be extracted to a shared location (e.g., `apps/web/src/types/lifeline.ts`) to eliminate duplication:

```typescript
// Re-export from date-utils for era definitions
export { LIFELINE_ERAS, eraForAge, extractYear } from "@/lib/date-utils";

// Lifeline API response types
export interface LifelinePerson {
  id: string;
  displayName: string;
  essenceLine: string | null;
  birthDateText: string | null;
  deathDateText: string | null;
  isLiving: boolean;
  portraitUrl: string | null;
}

export interface LifelineMemory {
  id: string;
  kind: MemoryKind;
  title: string;
  body: string | null;
  dateOfEventText: string | null;
  mediaUrl: string | null;
  mimeType: string | null;
  place: ResolvedPlace | null;
  memoryContext: "direct" | "contextual";
  memoryReasonLabel: string | null;
  contributorName: string | null;
  perspectiveCount: number;
  isFeatured: boolean;
}

export interface LifelineYearGroup {
  year: number;
  age: number | null;
  era: { label: string; hue: string } | null;
  memories: LifelineMemory[];
  relationshipEvents: LifelineRelationshipEvent[];
}

export interface LifelineRelationshipEvent {
  year: number;
  type: "marriage" | "partnership_start" | "partnership_end" | "other";
  label: string;
  partnerPersonId: string | null;
  partnerDisplayName: string | null;
  dateText: string | null;
}

export interface LifelineChapter {
  id: string;
  title: string;
  subtitle: string | null;
  chapterKind: "curated" | "system_suggested";
  sortOrder: number;
  startDateText: string | null;
  endDateText: string | null;
  memoryCount: number;
}

export interface LifelineResponse {
  person: LifelinePerson;
  timeline: {
    birthYear: number | null;
    deathYear: number | null;
    lifespanYears: number | null;
    yearGroups: LifelineYearGroup[];
    undated: LifelineMemory[];
  };
  chapters: LifelineChapter[];
  eraCounts: Record<string, number>;
}
```

---

## Appendix B: Copy Directory for the Lifeline

Key strings following the SPEC.md tone-of-voice guidelines:

**Empty states:**
- No memories with dates: *"A few memories, not yet placed in time. That is alright."*
- No memories at all: *"Nothing here yet. That is alright."*
- Undated section header: *"Time unknown"*
- Undated section subtitle: *"Some memories arrive without a date. They belong here."*

**Labels:**
- Birth marker: "Born"
- Death marker: "Passed"
- Era labels: "Childhood", "Teen years", "Young adult", "Mid life", "Later years", "Elder years"
- Chapter draft badge: "Draft"
- Contextual memory label: "via family context"
- Multi-perspective badge: "2 voices" / "3 voices"
- Relationship event labels: "Married [name]", "Partnership with [name]"

**Actions:**
- "Open full lifeline"
- "Drift this life"
- "Add a memory"
- "View on timeline"
- "Help date these memories" (for undated section)
- "Refine chapter" (for system-suggested chapters)
- "Edit chapter" (for curated chapters)
- "Dismiss chapter"

**Anniversary notices:**
- Birthday (deceased): *"Saturday would have been Rosa's 96th birthday."*
- Birthday (living): *"Rosa's 96th birthday is on Saturday."*
- Deathiversary: *"One year since Rosa passed."*
- Milestone: *"Rosa would have been 100 this year."* (with gilt accent)

---

## Appendix C: Files to Create or Modify

### New Files

| File | Phase | Description |
|------|-------|-------------|
| `apps/web/src/lib/date-utils.ts` | 1 | Shared date extraction and era utilities |
| `apps/web/src/types/lifeline.ts` | 1 | Shared lifeline type definitions |
| `apps/web/src/app/trees/[treeId]/people/[personId]/lifeline/lifeline.module.css` | 1 | CSS module for lifeline styles |
| `apps/web/src/components/lifeline/LifelinePage.tsx` | 3 | Main lifeline page component |
| `apps/web/src/components/lifeline/LifelineHeader.tsx` | 3 | Person header component |
| `apps/web/src/components/lifeline/LifelineSpine.tsx` | 3 | Vertical spine + year markers |
| `apps/web/src/components/lifeline/LifelineYearGroup.tsx` | 3 | Single year content block |
| `apps/web/src/components/lifeline/LifelineMemoryCard.tsx` | 3 | Memory card for timeline |
| `apps/web/src/components/lifeline/LifelineAnchorRow.tsx` | 3 | Birth/death marker |
| `apps/web/src/components/lifeline/LifelineRelationship.tsx` | 3 | Relationship event marker |
| `apps/web/src/components/lifeline/LifelineUndated.tsx` | 3 | "Time unknown" section |
| `apps/web/src/components/lifeline/LifelineEraRail.tsx` | 3 | Era navigation sidebar/strip |
| `apps/web/src/components/lifeline/LifelineMinimap.tsx` | 7 | Horizontal lifespan minimap |
| `apps/web/src/components/lifeline/LifelineChapterBreak.tsx` | 4 | Chapter section divider |
| `apps/web/src/components/lifeline/LifelineChapterEditor.tsx` | 4 | Chapter editing drawer |
| `apps/web/src/components/tree/LifelinePreview.tsx` | 2 | Compressed preview for person page |
| `apps/api/src/routes/lifeline-chapters.ts` | 4 | Chapter CRUD API |
| `apps/api/src/lib/lifeline-service.ts` | 5 | Timeline data building service |
| `drizzle/XXXX_add_life_chapters.sql` | 4 | Migration for life_chapters tables |
| `drizzle/XXXX_add_year_of_event.sql` | 5 | Migration for year_of_event column on memories |

### Modified Files

| File | Phase | Changes |
|------|-------|---------|
| `apps/web/src/app/trees/[treeId]/people/[personId]/lifeline/page.tsx` | 1, 3 | Fix broken features, then refactor to thin shell rendering LifelinePage |
| `apps/web/src/app/trees/[treeId]/people/[personId]/page.tsx` | 2 | Add LifelinePreview section, update navigation |
| `apps/web/src/app/globals.css` | 1 | Add lifeline era hue CSS variables |
| `apps/web/src/components/tree/DecadeRail.tsx` | 1 | Use shared extractYear (if it has local version) |
| `apps/web/src/components/home/homeUtils.ts` | 1 | Use shared extractYear |
| `apps/web/src/components/tree/treeLayout.ts` | 1 | Use shared extractYear |
| `apps/web/src/app/trees/[treeId]/memories/[memoryId]/page.tsx` | 6 | Add "View on timeline" link, from=lifeline back-nav |
| `apps/web/src/app/trees/[treeId]/curation/page.tsx` | 6 | Add "See on timeline" link for dated memories |
| `apps/api/src/app.ts` | 4, 5 | Register lifeline-chapters and timeline routes |
| `packages/database/src/schema.ts` | 4, 5 | Add life_chapters, life_chapter_memories, year_of_event column |

---

*This plan should be kept in sync with PRODUCT-ROADMAP.md. As phases are completed, update the roadmap's phase items and mark completion notes. As scope changes, update this document rather than letting it drift.*