# Memory Sharing Plan

## Goal

Memories should belong to the family graph, not to a page. The product should avoid a "pages and posts" model where contributors have to decide the one correct page or manually tag every possibly relevant person.

The system should support:

- Explicit subject tagging when a memory is directly about specific people.
- Broader family or lineage sharing when a contributor wants a memory to surface across a branch without curating every subject by hand.
- Explainable surfacing so a memory can always answer "why am I seeing this here?"
- Permissions that respect direct subjects without giving every inferred relative a veto.

## Core Model

### 1. Direct Subjects

Direct subjects are the people explicitly tagged on a memory because the memory is:

- about them
- depicts them
- recorded for them

These are the people who should receive the strongest association with the memory. They are the closest equivalent to the old "upload to a person's page" model, but the memory is still a shared record rather than page-owned content.

For the first implementation slice, the existing `memory_person_tags` table becomes the direct-subject table in practice.

### 2. Reach Rules

Reach rules describe where else a memory should appear without requiring explicit tags for everyone. This lets the app share a memory across a family context while keeping direct subjects narrow and meaningful.

Initial reach modes:

- `immediate_family`
- `ancestors`
- `descendants`
- `whole_tree`

Examples:

- A wedding memory can directly tag the couple and share through both their immediate families.
- A scanned family Bible can directly tag one steward and share through an ancestor line.
- A reunion photo can share to the whole current tree without pretending it is directly about every person in it.

### 3. Anchor Person

The current `primaryPersonId` remains for now, but its role narrows:

- default chronology
- narrative anchor
- fallback visibility inheritance

It should no longer be treated as the sole owner of the memory.

## Surfacing Rules

When viewing a person, memories should be separated conceptually into:

- Directly about them
- Present through family context

That distinction should inform ranking and later UI treatment, even if the early API still returns a unified list.

Every contextual match should be explainable:

- tagged directly
- shared through immediate family
- shared through ancestors
- shared through descendants
- shared with the whole tree

## Permissions

### Tree Membership

Tree membership still gates baseline access. A person must be visible in a tree scope, or a reach rule must intentionally surface the memory into that tree.

### Subject Sovereignty

Subject sovereignty should attach to direct subjects, not to every inferred relative reached through lineage expansion.

That means:

- direct subjects can eventually hide or contest memories of themselves
- inferred relatives can view based on tree permissions, but they do not automatically gain subject-level override rights

### Tree-Level Visibility

Per-tree visibility overrides still apply after reach resolution.

The order should be:

1. Resolve whether the memory is relevant to the tree or person by direct tags and reach rules.
2. Apply tree-level visibility overrides.
3. Apply subject-sovereignty rules for direct subjects.

## Updated Plan

### Phase 1: Backend Foundation

1. Add stored reach rules to the schema.
2. Expand memory creation APIs to accept:
   - `taggedPersonIds`
   - `reach`
3. Resolve reach at read time so person views can surface contextual memories.
4. Keep the existing UI working while the backend contract expands.

### Phase 2: Composer Changes

Replace the current "upload to this person" mental model with:

- Who is this directly about?
- Where else should it appear?

The composer should support:

- tagging specific people
- sharing to immediate family
- sharing to an ancestor line
- sharing to a descendant line
- sharing to the whole current tree

### Phase 3: Person View Restructure

The person view should stop behaving like a mini social profile and instead behave like a chapter in a shared archive.

Memories should be presented as:

- direct memories
- contextual family memories

with quiet attribution for why they are present.

### Phase 4: Permissions Hardening

Add:

- subject-level hide/contest flows for direct subjects
- per-person suppression for "not relevant here"
- richer `family_circle` semantics derived from graph relationships rather than steward-only placeholder behavior

## This Implementation Slice

This repo change begins Phase 1:

- additive schema changes for memory reach rules
- create-path support for explicit direct-subject tags and reach rules
- read-time resolution so memories can surface across family contexts without page ownership

This is intentionally backend-first so later UI work can build against a stable model.
