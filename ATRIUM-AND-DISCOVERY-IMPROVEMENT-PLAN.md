# Atrium and Discovery Improvement Plan

> Drafted: 2026-04-23

## Purpose

This document addresses the remaining gaps in the atrium experience, guided drift modes, life chapters, event/place storytelling, and filtered discovery. It also proposes a concrete direction for making the homepage/atrium feel immersive rather than like "just another webpage with a bunch of cards."

---

## The Core Problem

The atrium has the right information architecture — Stage → Context → Trail → Family — but it still reads as a sequence of sections rather than a continuous movement through memory. Each trail section is a "card block" with a lead scene and echo entries. The visual rhythm is uniform: big scene, then smaller echoes, then the next section starts fresh. The user scrolls through discrete modules instead of feeling drawn into a living archive.

The goal: make the atrium feel like walking through a carefully curated exhibit, not scrolling through a feed.

---

## Part 1: Atrium Memory Display — From Cards to Rooms

### What's Wrong Now

The AtriumMemoryTrail works as a data structure — it builds editorial sections ("Begin here", "From this branch", "Across generations") — but every section is rendered the same way: a lead scene card followed by echo cards. The visual cadence doesn't vary. There's no sense of entering and leaving spaces. Every memory feels like a card to read, not a moment to inhabit.

### Target Experience

The trail should feel like walking through rooms in a family archive:

- **The opening room** (Stage) should feel like stepping into a gallery — one dominant piece of memory, atmospheric, slow to leave.
- **Each transition** should feel like walking through a doorway into the next space, not scrolling past the next card.
- **Smaller memories** should feel like detail cases or wall labels next to the main work, not separate items in a grid.
- **Section headers** ("From this branch") should feel like room titles etched into the wall, not UI labels hovered above content.
- **The overall passage** should breathe: slower for the featured memory, faster for echoes, punctuated by ambient space.

### Concrete Changes

#### 1A. Depth-Based Visual Treatment

Currently every lead scene gets the same height (`clamp(360px, 62vw, 620px)`) and every echo gets the same layout (text + optional small image). Instead:

- **Lead memories** for "Begin here" should be the tallest and most atmospheric — near-full-viewport, parallax-like gradient overlay, the memory as an environment.
- **Lead memories** for "From this branch" should be shorter and more focused — a mounted photograph on a textured wall.
- **Lead memories** for "Across generations" should vary in height based on content richness (longer stories get more space, brief photo memories get a compact treatment).
- **Echo entries** should feel like margin notes or wall labels — light, proportional, not competing with the leads.

#### 1B. Section Transitions as Thresholds

Instead of `gap: clamp(28px, 4vw, 48px)` between sections, create intentional transitions:

- A thin gilt-rule divider between sections (not just spacing).
- A section title that sits in the margin alongside the first memory, not above it as a separate header.
- A brief text epigraph for each section drawn from the description — rendered as an architectural inscription, not a UI subtitle.

#### 1C. Memory Title Treatment

Memory titles are already display-serif, but they feel like headings above cards. Instead:

- Titles for lead scenes should be large and integrated with the image — overlaid on the dark image surface at the bottom, not floating above.
- Titles for echo entries should be proportional and anchored — small enough to feel like captions on a wall case, not repeated large headings.

#### 1D. Person Bubbles as Wayfinding Markers

PersonBubble items currently float as rounded pills under each memory. Instead:

- Make them feel like name plates next to a displayed piece — subtle, typographic, with portrait initials for those without photos.
- Consider a single person attribution line rather than repeated bubble rows when consecutive memories share the same person.

#### 1E. The "Across Generations" Section as a Widening Path

Instead of rendering the final section identically to the first two, make it explicitly feel like the archive widening:

- Use a more compact card treatment — inherited from the current echo style but with a horizontal layout (image left, text right, like an index card).
- Consider grouping by era within this section, showing subtle decade markers as wayfinding.
- End with a "Continue into the full archive" handoff that feels like a doorway, not a link.

#### 1F. AtriumFamilyPresence Integration

The FamilyPresence section should feel like arriving at a family portrait wall at the end of the exhibit:

- Wire the component into the page (currently built but not rendered).
- The orbital layout should feel like walking up to a family arrangement, not a feature diagram.
- Person groups should feel like wall groupings — "The Carters", "Raised by", "Alongside" — with comfortable spacing.
- The "Open full tree" link should feel like the exit from the exhibit into the wider archive.

#### 1G. Today Banner as an Anteroom Notice

The AtriumTodayBanner currently appears as an inline notification card. Instead:

- It should feel like a notice board just inside the entrance — "On this day" rendered as an ambient reminder, not as a grid of horizontal cards.
- Birthday/deathiversary cards should feel like inscriptions: warm paper, serif type, a portrait like a framed photograph, not a horizontal link row.
- Upcoming milestones (not just today) should appear here too — "In the coming days" as a quiet secondary section.

---

## Part 2: Anniversaries and Birthdays

### Current State

`AtriumTodayBanner` surfaces birthdays, deathiversaries, and memory anniversaries — but only for the exact current day. The backend `buildTodayHighlights` does exact month/day matching against `birthDateText` and `deathDateText`.

### What's Missing

- **Upcoming days**: No visibility into birthdays, anniversaries, or milestones happening in the next 3–7 days.
- **Milestone awareness**: Round-number anniversaries (100th, 50th, 25th, 10th) get a `milestoneScore` for sorting but aren't called out visually as significant.
- **Sensitivity for recent loss**: Deathiversaries within the first year should be handled with extra care (slower pacing, different language).
- **Memory anniversaries**: Only exact-day matches. A memory from "June 1955" won't surface in June of any subsequent year because the day doesn't match.

### Changes

#### 2A. Expand "On this day" to "Coming up" (Backend)

Add an `upcomingDays` window parameter to `buildTodayHighlights`:

- Default window: 7 days ahead.
- Return two groups in the payload: `today` (current matches) and `upcoming` (next 7 days, excluding today).
- For `upcoming`, include relative labels like "Tomorrow", "In 3 days", "Saturday".
- For fuzzy month/year dates (e.g., "June 1955", "Summer 1970"), match on month only during the month window — don't require an exact day.

#### 2B. Milestone Callouts in the Banner

When an anniversary is a milestone (100 years, 75, 50, 25, 10, 5), surface a visual indicator:

- Use the `--gilt` design token for milestone badges.
- Language should change: "Would have been 100" becomes a more prominent callout.
- Memory anniversaries at milestones should get larger cards.

#### 2C. Sensitivity for Recent Loss

For deathiversaries within the first year:

- Use the remembrance pacing language already developed for DriftMode.
- Add a "Remember" CTA that opens drift in remembrance mode.
- Tone shifts: softer language ("One year since" rather than "1 year ago today").

---

## Part 3: Guided Drift Modes

### Current State

DriftChooserSheet offers four modes: All memories, About one person, From an era, In remembrance. The backend drift endpoint supports `personId`, `mode=remembrance`, `yearStart`, `yearEnd` filters.

### What's Missing

- **Branch drift**: Start from a person or memory and stay within the branch before widening.
- **Place drift**: Move through memories connected to a specific place.
- **Event drift**: Assemble memories around an event (requires event grouping, see Part 4).
- **Perspective weaving**: Interleave contributions from different family members about the same moment.

### Changes

#### 3A. Branch Drift (Can ship now)

Branch drift can be built from existing data — `personId` plus branch expansion via relationships. Add it as a mode in the chooser:

- After selecting a person, offer "Close to {name}'s branch" as a drift option.
- Backend: filter by `branchPersonIds` (the focus person + their nearby relationships) instead of a single `personId`.
- Ordering: start with the focus person's memories, then widen to partners/parents/siblings/children, then nearby branch members.

The API already has all relationship data needed. The drift endpoint just needs a `branchPersonIds` parameter (or client-side filtering).

#### 3B. Place Drift (Requires place data surfacing)

The `places` table exists with `label`, `normalizedLabel`, `latitude`, `longitude`. Memories have `placeId` and `placeLabelOverride`. To support place drift:

- Add a place chooser to the DriftChooserSheet (similar to person chooser but listing places that have memories).
- Backend: add a `placeId` filter to the drift endpoint that matches `memories.placeId = :placeId`.
- Consider also fuzzy matching: if a place label contains the search query, include it.

#### 3C. Event Drift (Requires event grouping — see Part 4)

Event drift depends on a memory grouping model that doesn't exist yet. Plan it in the schema but don't build the UI until the event model is ready.

#### 3D. Perspective Weaving (Requires multi-perspective assembly)

The `memory_perspectives` table exists but isn't surfaced in the drift response. To support perspective weaving:

- When a memory has multiple perspectives, present them sequentially in drift (primary first, then additional perspectives as follow-up scenes).
- Add a `perspectives` field to the drift memory response.
- In DriftMode, after showing a memory scene, offer a "Other voices on this moment" transition if perspectives exist.

---

## Part 4: Life Chapters and Exhibits

### Current State

Not built. The `person_memory_curation` table exists with `is_featured` and `sort_order` but has no UI surface.

### What Should Be Built

Life chapters are curated narrative sections within a person's archive. They are not automatically generated pages — they are **system-suggested drafts that users refine**.

#### 4A. Schema: `life_chapters` table

```sql
CREATE TABLE life_chapters (
  id TEXT PRIMARY KEY,
  person_id TEXT NOT NULL REFERENCES people(id),
  tree_id TEXT NOT NULL REFERENCES trees(id),
  title TEXT NOT NULL,
  subtitle TEXT,
  chapter_kind TEXT NOT NULL DEFAULT 'curated', -- 'curated' | 'system_suggested'
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE life_chapter_memories (
  id TEXT PRIMARY KEY,
  chapter_id TEXT NOT NULL REFERENCES life_chapters(id) ON DELETE CASCADE,
  memory_id TEXT NOT NULL REFERENCES memories(id),
  sort_order INTEGER NOT NULL DEFAULT 0,
  caption TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

#### 4B. System-Suggested Drafts

When a person has enough memories with dates, the system can suggest chapter drafts:

- **Childhood** — memories with dates before the person's 18th birthday.
- **Adulthood** — memories between 18 and a significant life event or relationship start.
- **Family life** — memories involving spouse/children relationships.
- **Work and service** — memories that mention work, career, or service terms.
- **Later years** — memories in the last third of their life.

These are drafts. The user can rename, reorder, add to, remove from, and change the boundaries.

#### 4C. Chapter UI Surface

Chapters appear on the person's lifeline page (`/trees/[treeId]/people/[personId]/lifeline`):

- Each chapter is a horizontal or vertical section with a serif title, optional subtitle, and arranged memories.
- Memories within a chapter can have captions written by the curator.
- The whole thing reads like a book chapter with illustrations.

#### 4D. Exhibit Mode

An exhibit is a curated collection spanning multiple people or a theme — like a museum exhibit for the whole family:

- Could be implemented as a `life_chapter` with `person_id = null` and a `tree_id` reference.
- Exhibits get their own short URL for sharing.
- Target: reunions, funerals, family milestones, anniversaries.

---

## Part 5: Event and Place Storytelling

### Current State

- `places` table exists with geocoding fields.
- `memories` have `placeId` and `placeLabelOverride`.
- Map view exists at `/trees/[treeId]/map` but is basic.
- No `events` table. No grouping model.

### What's Missing

- **Event grouping**: No way to say "these 7 memories are all from the 1985 Carter family reunion."
- **Place narratives**: Places are data rows, not storytelling surfaces.
- **Migration paths**: No "where the family lived over time" view.

### Changes

#### 5A. Schema: `memory_groups` (Event Grouping)

```sql
CREATE TABLE memory_groups (
  id TEXT PRIMARY KEY,
  tree_id TEXT NOT NULL REFERENCES trees(id),
  title TEXT NOT NULL,
  subtitle TEXT,
  group_kind TEXT NOT NULL DEFAULT 'event', -- 'event' | 'theme' | 'period'
  date_text TEXT,
  place_id TEXT REFERENCES places(id),
  created_by_user_id TEXT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE memory_group_items (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES memory_groups(id) ON DELETE CASCADE,
  memory_id TEXT NOT NULL REFERENCES memories(id),
  sort_order INTEGER NOT NULL DEFAULT 0,
  caption TEXT,
  perspective_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

This also serves as the foundation for event drift and perspective weaving in Part 3.

#### 5B. Place Narrative Surfaces

Create a place detail page at `/trees/[treeId]/places/[placeId]`:

- A place is not just a pin on a map — it's a chapter in the family story.
- The page shows:
  - The place name and region.
  - A timeline of memories connected to this place.
  - People who lived or spent time here.
  - Migration context: "Before this, the family was in X. After, they moved to Y."
- This page should feel like a geographic chapter, not a search results page.

#### 5C. Place Drift Integration

With the place detail page, place drift (3B) gains a natural entry point:

- From a place page, "Drift through memories of this place" starts a place-filtered drift session.
- From the map, clicking a place cluster could open either the place page or a place drift.

---

## Part 6: Stronger Filtered Discovery

### Current State

- `SearchOverlay` provides Cmd+K person + memory search.
- Era chips in `AtriumMemoryTrail` filter by decade.
- Drift modes provide person, era, and remembrance filtering.

### What's Missing

- No filtering by contributor.
- No voice-only filter.
- No year-range filter outside of drift.
- No place-based discovery.
- No event-based discovery (events don't exist yet).
- No kind-based discovery (show me all voice memories, all documents).

### Changes

#### 6A. Atrium Discovery Drawer

Add a "Discover" entry point to the atrium (either in the header or as a subtle persistent affordance) that opens a discovery panel:

- **By person**: Select a person, see their memories and branch.
- **By era**: Year range slider or decade chips.
- **By kind**: Photo, story, voice, document.
- **By place**: Recently mentioned places or search.
- **By contributor**: People who have contributed memories.

This should not be a full filter bar. It should feel like a drawer of curiosities — pull it open, find what you're looking for, close it and return to the guided trail.

#### 6B. SearchOverlay Enhancement

Extend the existing SearchOverlay to:

- Show filtered result counts.
- Support kind filters (voice-only, photos-only).
- Support place suggestions.
- Show "N stories about {person}" result previews.

#### 6C. Person Page Deep Discovery

On person pages, add discovery tabs/filters:

- "All memories about {name}"
- "Photos of {name}"
- "Stories about {name}"
- "Voices of {name}"
- "Memories {name} contributed"

---

## Implementation Priority

### Ship Now (Concrete Fixes)

1. **Wire AtriumFamilyPresence into the home page** — The component exists but isn't rendered. Add it to `page.tsx` after `AtriumMemoryTrail`.
2. **Extend today highlights to include upcoming days** — Backend: add 7-day window to `buildTodayHighlights`. Frontend: add "Coming up" section to `AtriumTodayBanner`.
3. **Add branch drift to DriftChooserSheet** — The data exists. Add a mode that expands from a person through their relationships.
4. **Update PRODUCT-ROADMAP** — Mark anniversaries/birthdays as now in progress, update drift mode status.

### Next Phase (Schema + New Surfaces)

5. **Life chapters schema + system-suggested drafts** — Add `life_chapters` and `life_chapter_memories` tables. Build a first pass at chapter suggestion logic.
6. **Memory groups (events) schema** — Add `memory_groups` and `memory_group_items`. Start with event grouping from the memory composer or curation queue.
7. **Place detail pages** — New route `/trees/[treeId]/places/[placeId]` with timeline, people, migration context.
8. **Atrium discovery drawer** — New component for multi-axis discovery.

### Later (Polish + Immersion)

9. **Trail visual redesign** — Implement the "rooms and thresholds" visual language from Part 1.
10. **Event drift** — Depends on memory groups schema.
11. **Perspective weaving in drift** — Depends on multi-perspective API changes.
12. **Life chapter UI on person lifeline** — Depends on chapter schema and suggestion logic.
13. **Exhibit mode** — Depends on chapter infrastructure.

---

## Design Principles for All Changes

These extend the ATRIUM-REVISION-PLAN rules:

1. **Room, not feed.** Every surface should feel like walking through a space, not scrolling an inbox.
2. **Threshold, not divider.** Transitions between content should feel like doorways, not whitespace.
3. **Name, not label.** People are called by name with their lifespan, not by role tags.
4. **Inscription, not badge.** Milestones and dates should feel etched, not stickered.
5. **Exhibit, not grid.** Grouped content should feel curated, not tiled.
6. **Drawer, not search bar.** Discovery should feel like opening a drawer of curiosities, not querying a database.
7. **Chapter, not section.** Narrative grouping should feel like turning pages, not scrolling cards.