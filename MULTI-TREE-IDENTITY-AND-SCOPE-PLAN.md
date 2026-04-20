# Multi-Tree Identity And Scope Plan

**Status:** Planning constraint for upcoming cross-tree work
**Purpose:** Clarify how account identity, person overlap, and tree boundaries
should behave in product terms before more cross-tree UI is built.

This document narrows the current product direction.

The data model may continue moving toward shared people across trees, but the
product should not assume that every cross-tree overlap becomes one giant
combined canvas.

## Core Decisions

### 1. Account Identity Is The Primary Cross-Tree Anchor

For a living person with an account, the cleanest and safest path to cross-tree
unity is:

1. They are invited into Tree A as themselves and accept.
2. They are invited into Tree B as themselves and accept.
3. The system recognizes that both tree memberships point to the same account.
4. If needed, stewards merge duplicate person records so one person record can
   be used in both trees.

This means account identity is the strongest confirmation that two nodes really
represent the same living person.

### 2. Duplicate Detection Is Helpful, Not Final

The system may suggest that two people across trees are the same based on:

- linked account match
- same name
- overlapping dates
- other future heuristics

But duplicate detection should not silently merge two people unless identity is
already confirmed or a steward explicitly approves the merge.

### 3. Shared Person Does Not Mean Shared Canvas

A person can belong to multiple trees without those trees becoming one visual
tree.

Cross-tree overlap should be expressed through:

- shared identity
- shared person pages
- duplicate merge flows
- cross-tree navigation
- shared memory surfacing where permissions allow

It should not automatically cause one tree canvas to expand sideways into the
other tree's branch system.

## Canvas Boundary Rule

### 4. The Main Tree Canvas Stays Vertical

The primary family-tree canvas should remain tree-shaped.

Near-term rule:

- a tree expands through blood lineage or legal adoption
- spouses may appear because they are part of the family context
- a spouse's separate family-of-origin branch does not automatically unfold in
  this tree's canvas

Said differently: the canvas is for one tree's lineage scope, not for every
adjacent family that can be reached through marriage.

### 5. Horizontal Branches Stay Separate

If a maternal tree and a paternal tree both include the same child, that overlap
does **not** mean the maternal canvas should render the paternal branch, or vice
versa.

Instead:

- the shared child may appear in both trees
- the same parent may appear in both trees if the identity is unified
- the other branch remains in its own tree context
- the UI may link out to that other tree, but should not inline-expand it into
  the current canvas

## Scope Definition

### 6. What Belongs In A Tree

If a tree starts from a lineage such as "Mom's side" beginning at her
great-grandparents, then everyone shown in that tree should be one of:

- a blood relative in that lineage
- a legally adopted relative in that lineage
- the spouse of someone in that lineage

This keeps a tree legible and preserves the meaning of "this side of the
family."

### 7. What Does Not Belong By Default

The following should not automatically appear in the current tree canvas just
because they are reachable through a spouse:

- the spouse's parents
- the spouse's siblings
- the spouse's grandparents
- the spouse's cousins
- the spouse's broader family-of-origin branch

Those people may exist elsewhere in the system, and may belong to another tree,
but they should remain outside the current tree's main visual scope unless a
future product decision explicitly introduces a secondary preview mode.

## Example Scenarios

### 8. Shared Child Across Maternal And Paternal Trees

If a child is independently added to both Mom's family tree and Dad's family
tree:

- there may initially be two person records
- if the child later accepts invitations with the same account in both trees,
  the system has a strong identity signal
- stewards can merge the two person records into one shared person

After that merge:

- the child may belong to both trees
- the child can have cross-tree identity continuity
- the maternal tree still renders only the maternal-lineage tree scope
- the paternal tree still renders only the paternal-lineage tree scope

### 9. Dad Appears In Both Trees

If Dad belongs in both trees:

- if both trees already point to the same person record, he is the same person
  in system terms
- if they point to different records, he remains duplicated until merged
- even after merge, Dad's separate branch should not cause either tree to
  expand into a combined super-tree

## Product Implications

### 10. Best Near-Term UX

Near-term cross-tree UX should focus on:

- reliable account-linked identity
- steward merge flows for duplicates
- clear "this person also appears in these trees" surfaces
- links from a person page into other visible trees
- memory and profile sharing across trees where permissions allow

It should **not** prioritize:

- rendering multiple full trees simultaneously on one canvas
- automatic sideways graph growth through spouses
- turning the family canvas into a generic social-network graph

### 11. Why This Constraint Matters

This constraint keeps the product:

- legible
- emotionally understandable
- technically simpler to reason about
- compatible with tree-specific stewardship and permissions

The product can still support one person participating in multiple trees. It
just should not confuse "shared identity" with "one infinitely expanding tree."

## Implementation Guidance

### 12. Planning Rule For Future Work

When making future cross-tree decisions, prefer this order:

1. Confirm identity through account linkage where possible.
2. Let stewards merge duplicates when needed.
3. Share person presence across trees via scope.
4. Surface cross-tree context on person pages and navigation.
5. Keep the main canvas scoped to one tree's lineage boundary.

If a future feature proposal would make the main canvas horizontally expand into
adjacent spouse branches, it should be treated as a new product decision, not as
an automatic consequence of the current cross-tree model.

For the concrete implementation plan behind the account-linked identity rule,
see [`ACCOUNT-IDENTITY-IMPLEMENTATION-PLAN.md`](./ACCOUNT-IDENTITY-IMPLEMENTATION-PLAN.md).
