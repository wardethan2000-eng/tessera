# Atrium Revision Plan

> **Reviewed:** 2026-04-21 — Phases 0–6 completed; Phase 7 polish ongoing.

## Purpose

This document is the implementation handoff plan for revising `/trees/[treeId]/atrium`.

It is intentionally explicit. The goal is to remove ambiguity for follow-on agents and prevent the atrium from drifting back toward a dashboard, admin surface, or generic content feed.

This plan supersedes the atrium-specific direction inside [DASHBOARD-REDESIGN-PLAN.md](./DASHBOARD-REDESIGN-PLAN.md) where the two documents conflict.

---

## One-Sentence Product Decision

The atrium must become a memory-first editorial landing page for a single family tree, not a stack of utility sections.

---

## Scope

This plan applies to:

- `apps/web/src/app/trees/[treeId]/atrium/page.tsx`
- `apps/web/src/components/home/*` where those components are used by the atrium
- `apps/api/src/routes/trees.ts` only if the homepage data contract must be extended

This plan does **not** cover:

- `/dashboard` redesign beyond keeping it visually compatible later
- `/trees/[treeId]` full constellation workspace redesign
- memory detail page redesign
- inbox/curation redesign
- prompt/invitation flows

---

## Current State Summary

The current atrium is visually improved from the old version, but structurally it is still wrong for the intended experience.

Current page order in [page.tsx](./apps/web/src/app/trees/[treeId]/atrium/page.tsx):

1. header
2. hero
3. CTA row
4. summary band
5. era ribbon
6. constellation preview
7. memory lane
8. voice lane
9. family directory

This produces a page that feels like a polished dashboard instead of an emotional family archive entrance.

---

## Core Problems To Fix

### 1. The page has no single center of gravity

The hero exists, but the real decisions happen in a separate CTA row immediately below it.

Result:

- the hero does not fully own the opening moment
- the top of the page feels split into multiple competing modules

### 2. The page reads as stacked modules, not one composed experience

The sections are individually reasonable, but together they feel additive:

- hero
- stats
- filters
- preview
- rails
- directory

Result:

- the page feels assembled, not authored
- nothing feels essential and everything competes for attention

### 3. Too much dashboard language is exposed too early

The summary band uses stewardship/product language:

- people count
- generation count
- people without direct memories
- missing portraits

That may be useful somewhere, but it is not the right emotional tone for the atrium.

### 4. The era ribbon is too prominent

The current era ribbon is a full section near the top of the page.

Result:

- the atrium feels like a filterable archive browser before it feels like a lived family story
- the user is asked to sort before they are invited to feel

### 5. The constellation preview is diagram-first, not story-first

The current family-shape preview is technically coherent, but in the current page order it behaves like a mini tool dropped into the middle of the home page.

### 6. The memory lanes are generic content rails

`Resurfacing now` and `Voices in the archive` are list containers, not guided exploration paths.

Result:

- the atrium resembles a streaming/content shelf layout
- the page encourages browsing buckets instead of entering a branch of family history

### 7. The family section is a directory, not a presence

The current bottom section answers “who is here?” but not:

- how this family feels
- how large it is
- where the current memory lives within the family

---

## Non-Negotiable Product Rules

Any implementation that violates these rules is off-plan.

### The atrium must feel like:

- entering a living family archive
- beginning from one memory and its branch context
- drifting into related people and stories

### The atrium must not feel like:

- an admin dashboard
- a content management surface
- a social feed
- a report of archive statistics
- a mini version of the full constellation tool

### Therefore:

- memory comes before metrics
- branch context comes before broad filtering
- guided discovery comes before generic rail browsing
- family presence comes before family directory

---

## Top-Level Structural Rewrite

The atrium should be reorganized into **four primary sections** below the sticky header.

### Required section order

1. `AtriumStage`
2. `AtriumContextStrip`
3. `AtriumMemoryTrail`
4. `AtriumFamilyPresence`

That is the target information architecture.

The current sections that must be removed from the top-level flow:

- standalone CTA row
- standalone summary band
- standalone era ribbon
- standalone constellation preview
- separate voice-only lane
- simple people-directory framing

These concepts may survive in reduced or repositioned form, but not as separate first-class sections stacked one after another.

---

## Target Atrium Structure

## 1. `AtriumStage`

### Purpose

Create one dominant opening moment that makes the archive feel alive immediately.

### Required content

- one featured memory
- memory title
- short excerpt or transcript excerpt
- person name and date/era if available
- one branch cue
- one primary action
- one or two secondary actions only

### Required actions

- primary: `Continue with this memory`
- secondary: `Follow this branch`
- secondary or tertiary: `Open full tree`

### Forbidden actions in the stage

- `Add memory`
- `Search`
- inbox/curation badges
- multiple equal-weight utility buttons

Those belong in the header or elsewhere, not in the emotional center of the page.

### Required visual behavior

- the stage must own the page opening
- image/media and text should be composed together, not separated by a later CTA strip
- the memory must feel editorial, not carousel-like
- rotation, if kept, must be slow and quiet

### Rotation rules

- keep at most one visible featured memory at a time
- do not show dots as the main interaction affordance
- if rotation remains, it must feel like passive resurfacing, not a slideshow

### Mobile rules

- mobile still gets a single dominant stage
- do not collapse into hero followed by a stack of three utility buttons
- primary and secondary actions must remain clearly hierarchical

### Empty-state rules

If there are no memories:

- the stage becomes a “start the archive” scene
- it may contain `Add first memory`
- it may contain `Add first person`
- it must still feel atmospheric, not like an empty dashboard card

---

## 2. `AtriumContextStrip`

### Purpose

Give the user a quick human sense of family scale and context without turning the homepage into metrics.

### Replace the current summary band with:

- family scale
- historical span
- branch focus

### Example content style

- `128 people across 6 generations`
- `Memories from the 1880s to today`
- `Centered around the Carter branch`

### Forbidden content style

Do **not** surface these on the homepage:

- `X people still need direct memories`
- `Y missing portraits`
- “coverage deficit” language
- curation/inbox counts

Those are stewardship concerns, not atrium concerns.

### Visual rules

- this section should be quieter than the stage
- it should read as one contextual band, not three equal dashboard cards
- a segmented strip or three linked text blocks is preferred over boxed KPI tiles

---

## 3. `AtriumMemoryTrail`

### Purpose

Guide the user into meaningful discovery from the featured memory instead of exposing generic category rails.

### Replace current lane logic

Remove this top-level framing:

- `Resurfacing now`
- `Voices in the archive`

Replace with one primary guided trail:

- `Begin here`
- `From this branch`
- `Across generations`

The exact labels can change, but the logic cannot revert to generic rail names.

### Required trail behavior

The trail should be constructed from the featured memory and its related context.

The first implementation may derive from:

- same primary person
- same branch cluster
- nearby dates/eras
- different memory kinds for variety

### Optional secondary control

Era filtering may remain, but it must be demoted.

Allowed placements:

- compact segmented control inside the trail header
- collapsed “Browse by era” control
- secondary mode toggle

Forbidden placement:

- full standalone section above the family context

### Voice memories

Voice items should appear naturally in the trail when relevant.

Do not reserve a full dedicated top-level lane for voice unless there is a clearly justified later editorial treatment.

### Empty-state rules

If there are very few related memories:

- the trail can show fewer cards
- the trail can surface a lighter “open the full archive” handoff
- do not generate filler lanes just to keep section count high

---

## 4. `AtriumFamilyPresence`

### Purpose

Show the family as a living shape around the current memory, not as a member directory.

### Replace current framing

The current bottom section titled `The family` is too directory-like.

The replacement section should answer:

- where this memory sits in the family
- who is nearby in the branch
- how large the family feels

### Required content behavior

This section may include:

- a branch-focused family preview
- clustered portraits around the featured person
- generational grouping
- a simplified lineage/branch visual

### It may still link to the full constellation

But it must not feel like a miniature tool preview dropped into the middle of the page.

### Constellation preview guidance

If reusing the current `ConstellationPreview` logic:

- reframe it visually so it feels like family presence, not tree tooling
- increase portrait/identity emphasis
- reduce diagram-ness
- reduce the “mini-map” feeling

### Person list behavior

If a person grid remains:

- it must be secondary within the family-presence section
- it cannot be the main expression of family scale on the homepage

---

## Explicit Component Plan

## Components To Introduce

Create or refactor into these atrium-specific components:

- `AtriumStage`
- `AtriumContextStrip`
- `AtriumMemoryTrail`
- `AtriumFamilyPresence`
- `AtriumStartState` for true no-memory trees

These should live under:

- `apps/web/src/components/home/`

Suggested filenames:

- `AtriumStage.tsx`
- `AtriumContextStrip.tsx`
- `AtriumMemoryTrail.tsx`
- `AtriumFamilyPresence.tsx`
- `AtriumStartState.tsx`

## Components To Demote, Replace, Or Stop Using Directly

### Stop using directly in the atrium top-level composition

- `HomeSummaryBand`
- `EraRibbon`
- `MemoryLane` as the main exploration model

### Likely replace or heavily rewrite

- `TreeHomeHero`
- `ConstellationPreview`

### May survive as internal implementation pieces

- `MemoryCard`
- `homeUtils`
- payload types in `homeTypes`

---

## Route-Level Rewrite Rules

The atrium page file should be simplified into:

1. fetch/apply home payload
2. choose featured memory and branch context
3. assemble curated memory trail
4. render the four main sections

The page file should **not** keep growing as a long chain of inline section markup.

### Required route responsibilities

`apps/web/src/app/trees/[treeId]/atrium/page.tsx` should only:

- fetch and normalize data
- hold page-level state
- choose which top-level section components render
- wire handlers between sections and routes

### Forbidden route responsibilities

- owning large visual section markup inline
- duplicating presentational logic from home components
- assembling many unrelated dashboard-like sections directly in the route

---

## Data Contract Plan

## Current payload

Current `GET /api/trees/:treeId/home` is useful, but too flat for a curated atrium.

It currently provides enough to render the current page, but it forces the client to infer the homepage shape by slicing generic arrays.

## Required medium-term payload additions

Add atrium-oriented fields so the page is not built from flat arrays alone.

Suggested additions:

- `featuredMemory`
- `featuredBranch`
- `relatedMemoryTrail`
- `familyPresence`
- `archiveSummary`

### `featuredMemory`

One selected opening memory, already ranked server-side.

### `featuredBranch`

Minimal branch context for the opening memory:

- focus person id
- related nearby people ids
- optional branch label

### `relatedMemoryTrail`

Ordered memory cards already chosen for atrium exploration, ideally grouped or labeled.

### `familyPresence`

Enough people + relationships to render a branch-focused presence section without sending the whole tree or forcing the client to invent the focus model.

### `archiveSummary`

Only the homepage-appropriate context:

- people count
- generation depth
- earliest and latest year
- optional branch label or focus descriptor

### Explicitly exclude from homepage summary payload

Do not optimize the homepage around:

- missing portrait counts
- missing direct memory counts
- curation/inbox state

Those can still remain elsewhere in the API response if needed for the header, but they are not core atrium content.

---

## Implementation Phases

## Phase 0 - Lock The Direction

**Status: Completed**

Before coding:

- treat this document as the source of truth
- do not keep iterating on the current stacked section order
- do not spend time polishing the current `HomeSummaryBand` / `EraRibbon` / `MemoryLane` composition further

### Exit criteria

- team alignment that the current atrium shape is being replaced, not refined in place

---

## Phase 1 - Remove The Wrong Structure

**Status: Completed**

### Tasks

1. [x] Remove the standalone CTA row from below the hero.
2. [x] Remove `HomeSummaryBand` from the top-level atrium flow.
3. [x] Remove the standalone `EraRibbon` from the top-level atrium flow.
4. [x] Remove the separate `Voices in the archive` lane.
5. [x] Replace the bottom `The family` framing with a placeholder `AtriumFamilyPresence` shell.

### Notes

This phase is about deleting the wrong page shape first.

### Exit criteria

- the atrium no longer reads as hero + utilities + stats + filters + rails + directory

---

## Phase 2 - Build `AtriumStage`

**Status: Completed**

### Tasks

1. [x] Create `AtriumStage.tsx`.
2. [x] Move the opening memory title, excerpt, attribution, and primary actions into it.
3. [x] Keep the stage responsible for the full opening experience.
4. [x] Move the current top CTA intent inside the stage:
   - drifting
   - continue memory
   - open full tree

### Stage acceptance criteria

- there is only one opening focal point
- users can understand what the family archive is about without leaving the first section
- no separate CTA strip is needed underneath

---

## Phase 3 - Build `AtriumContextStrip`

**Status: Completed**

### Tasks

1. [x] Create `AtriumContextStrip.tsx`.
2. [x] Replace the current boxed summary band with lighter narrative context.
3. [x] Use human language rather than stewardship language.

### Context-strip acceptance criteria

- the strip communicates scale and historical range
- it does not read like analytics
- it is visually subordinate to the stage

---

## Phase 4 - Build `AtriumMemoryTrail`

**Status: Completed**

### Tasks

1. [x] Create `AtriumMemoryTrail.tsx`.
2. [x] Replace `Resurfacing now` and `Voices in the archive`.
3. [x] Build one guided trail from the featured memory outward.
4. [x] If era filtering remains, move it inside this section as a secondary control.

### Trail acceptance criteria

- memory exploration feels guided, not bucketed
- voice content appears where relevant, not in a separate mandatory lane
- the trail feels tied to the opening memory

---

## Phase 5 - Build `AtriumFamilyPresence`

**Status: Completed**

### Tasks

1. [x] Create `AtriumFamilyPresence.tsx`.
2. [x] Replace the current people-directory framing.
3. [x] Reuse layout/relationship truth where helpful, but change the presentation goal from "preview tool" to "show family presence".
4. [x] Keep the full constellation link, but demote it to a handoff, not the purpose of the section.

### Family-presence acceptance criteria

- the user can feel the shape of the family around the opening memory
- the section does not look like a utility visualization
- portrait/identity cues feel stronger than diagram cues

---

## Phase 6 - Data Contract Cleanup

**Status: Completed**

### Tasks

1. [x] Review whether current client-side derivation is still acceptable.
2. [x] Extend `GET /api/trees/:treeId/home` to return atrium-oriented fields.
3. [x] Move featured-memory and related-trail selection server-side.

### Acceptance criteria

- the atrium is not held together by ad hoc client slicing of generic arrays
- homepage logic is predictable and reproducible

---

## Phase 7 - Polish Only After Structure Is Correct

**Status: In progress**

Allowed polish after the structural rewrite:

- [x] transitions
- [x] spacing
- [x] hover/focus states (ongoing refinement)
- [x] skeletons
- [x] responsive tuning
- [ ] AtriumFamilyPresence wired into home page (built but not yet rendered — tracked in ATRIUM-AND-DISCOVERY-IMPROVEMENT-PLAN.md §1F as a "Ship Now" item)
- [x] Today banner redesigned as "anteroom notice" with upcoming-day window
- [x] Memory trail redesigned with depth-based sections (opening/branch/widening)
- [x] Section thresholds (gilt-rule dividers) between major atrium sections
- [x] Person attribution changed from bubble pills to name-plate style
- [x] "Across generations" section uses compact horizontal card grid
- [x] Branch drift mode added to DriftChooserSheet

Forbidden polish before structural rewrite:

- continuing to animate the wrong section order
- refining rails that should be removed
- improving dashboard-style cards that should not remain

---

## Design Constraints For Follow-On Agents

These constraints exist to stop lower-context agents from going off-plan.

### Do not:

- add more top-level sections
- add more dashboard metrics
- add notification or task language to the homepage
- keep voice as its own main lane
- put era browsing ahead of the main story experience
- make the family section a simple portrait directory
- solve the problem with more polish on the current composition

### Do:

- reduce top-level complexity
- strengthen one opening story moment
- make branch context clearer
- make exploration feel guided
- make family presence feel lived-in rather than administrative

---

## File-Level Change Map

## Must change

- `apps/web/src/app/trees/[treeId]/atrium/page.tsx`

## Likely add

- `apps/web/src/components/home/AtriumStage.tsx`
- `apps/web/src/components/home/AtriumContextStrip.tsx`
- `apps/web/src/components/home/AtriumMemoryTrail.tsx`
- `apps/web/src/components/home/AtriumFamilyPresence.tsx`
- `apps/web/src/components/home/AtriumStartState.tsx`

## Likely rewrite heavily or stop using in atrium

- `apps/web/src/components/home/TreeHomeHero.tsx`
- `apps/web/src/components/home/HomeSummaryBand.tsx`
- `apps/web/src/components/home/EraRibbon.tsx`
- `apps/web/src/components/home/ConstellationPreview.tsx`
- `apps/web/src/components/home/MemoryLane.tsx`

## May need API updates

- `apps/api/src/routes/trees.ts`

---

## Acceptance Checklist

The atrium revision is complete only when all of these are true.

- The top of the page is one coherent opening stage, not hero plus a separate CTA strip.
- Archive context is expressed in human terms, not dashboard metrics.
- Era browsing is demoted from a top-level section.
- The user is guided into a related memory path, not generic content rails.
- The family is presented as a living branch/presence, not primarily as a directory.
- The page has at most four primary sections below the sticky header.
- The page feels editorial and archival, not operational.

---

## Suggested Work Split For Multiple Agents

If handing this off in parallel, split by responsibility rather than by arbitrary file groups.

### Agent 1 - Atrium structure

Own:

- `apps/web/src/app/trees/[treeId]/atrium/page.tsx`
- top-level section order
- removal of obsolete sections

### Agent 2 - Opening stage

Own:

- `AtriumStage`
- hero replacement
- opening action hierarchy

### Agent 3 - Memory exploration

Own:

- `AtriumMemoryTrail`
- replacement of lane logic
- era control demotion if still needed

### Agent 4 - Family presence

Own:

- `AtriumFamilyPresence`
- branch/family preview treatment
- constellation-preview reuse only if it serves the new purpose

### Agent 5 - API contract cleanup

Own:

- `apps/api/src/routes/trees.ts`
- homepage payload changes
- server-side curation logic if needed

Do not have multiple agents editing the same atrium route file at once unless one agent is strictly integrating others' finished components.

---

## Final Instruction

If an implementation still looks like:

- hero
- CTA row
- stats
- filters
- preview
- rails
- people grid

then the plan has **not** been followed, even if the styling is better.

The objective is a different page shape, not a prettier version of the current one.

---

## Continuation

Remaining work after Phase 7 — including AtriumFamilyPresence wiring, anniversary/birthday expansion, guided drift modes, life chapters, and visual immersion improvements — is tracked in `ATRIUM-AND-DISCOVERY-IMPROVEMENT-PLAN.md`. Use that document for all follow-on atrium work.
