# Account Identity Implementation Plan

**Status:** Planning
**Scope:** Technical plan for implementing account-linked identity across trees
without turning multiple trees into one combined canvas

This document turns the product rule from
[`MULTI-TREE-IDENTITY-AND-SCOPE-PLAN.md`](./MULTI-TREE-IDENTITY-AND-SCOPE-PLAN.md)
into a concrete engineering plan.

The guiding constraint is:

- one account should map to one canonical living-person record
- that person may appear in multiple trees through scope
- the trees remain separate visual canvases

## Target Invariant

For living users with accounts, the system should converge on this rule:

1. A `users.id` maps to at most one canonical `people.id`.
2. That canonical person may appear in many trees through `tree_person_scope`.
3. Joining a second tree should reuse that person record rather than create a
   second claimed self-record.
4. If historical duplicates already exist for the same account, they must be
   surfaced and resolved before we can safely enforce the invariant at the DB
   level.

## What Exists Today

Current code already has some of the needed pieces, but they do not yet form a
complete identity system.

### Working Pieces

- `people.linked_user_id` exists and is used as the current account-to-person
  link.
- `tree_person_scope` exists and can place one person into multiple trees.
- invitation acceptance can link a user to a person record.
- duplicate detection and merge flows already exist.

### Current Gaps

- there is no DB-level uniqueness guarantee on `people.linked_user_id`
- founder onboarding always creates a new self person for each new tree
- invitation acceptance detects duplicate identity but does not resolve it
- multiple routes still assume `people.tree_id` is the authoritative home of a
  person
- some UI paths derive "my person in this tree" by scanning tree people, not by
  consulting a dedicated identity service
- portrait/place/media access still has tree-local assumptions that become more
  visible once one person spans multiple trees

## Non-Goals

This implementation should **not** try to solve all cross-tree behavior at once.

Out of scope for this slice:

- automatic sideways expansion of one tree into another spouse branch
- automatic merging of deceased or unclaimed duplicate people based only on
  heuristics
- fully removing legacy `people.tree_id` or `relationships.tree_id`
- global dedup across every person in the system
- redesigning the full permission model beyond what account identity requires

## Required Product Behavior

### Founder Flow

If a signed-in user who already has a claimed person creates a new tree:

- the app should reuse the existing claimed person
- that person should be added to the new tree scope
- onboarding should not create another self person

### Invitation Flow

If a steward invites an existing living person by email and links that invite to
the correct person record:

- accepting the invite should attach the account to that linked person if it is
  still unclaimed
- if the account is already linked to that same person, acceptance should just
  add membership/scope as needed
- if the account is already linked to a different person, the system should
  surface a conflict state clearly and drive merge/review

### Tree Membership Without Linked Person

A user can still belong to a tree without being linked to a person in that tree.
That state is valid for:

- outside contributors
- viewers
- partially configured users

But the product should expose that state explicitly rather than silently acting
like the user has no identity problem to solve.

## Engineering Approach

Implement this in phases. Do not try to add a hard uniqueness constraint before
legacy duplicates are understood.

## Phase 1: Identity Service And API Contract

Create a dedicated backend layer for account identity.

### New Backend Concept

Add an account-identity service in `apps/api/src/lib/`, likely something like:

- `account-identity-service.ts`

Core responsibilities:

- find the canonical claimed person for a user
- find that person's presence in a specific tree
- add the canonical person to a tree scope
- detect claimed-person conflicts
- provide a single place for "who am I in this tree?" logic

### Suggested Core Functions

- `getClaimedPersonForUser(userId)`
- `getClaimedPeopleForUser(userId)`
- `getIdentityStatusForUser(userId)`
- `getUserPersonInTree(userId, treeId)`
- `ensureClaimedPersonInTree({ userId, treeId, addedByUserId })`
- `claimPersonForUser({ userId, personId, treeId })`
- `resolveClaimConflict(...)` or a helper that packages the conflict details

### Why This Phase Matters

Right now identity behavior is spread across:

- onboarding
- invitations
- person creation
- permission checks
- tree canvas bootstrapping

Without a central service, implementation will drift and duplicate bugs will
continue appearing in each flow.

## Phase 2: Data Audit And Migration Safety

Before enforcing any uniqueness rule, audit existing data.

### Required Audit

Write a one-off script under `packages/database/src/scripts/` or
`apps/api/src/lib/` tooling that reports:

- all `linked_user_id` values attached to more than one person
- trees containing those duplicates
- whether those duplicates are already in overlapping scopes
- whether those duplicates have conflicting claimed accounts
- whether those duplicates appear merge-safe or require manual review

### Required Output

The script should produce a clear review artifact:

- user id
- email
- linked person ids
- tree ids
- display names
- basic merge-risk flags

### DB Migration Goal

After duplicates are cleaned up, add a partial unique index on claimed identity:

- unique on `people.linked_user_id`
- only where `linked_user_id IS NOT NULL`

This is the only reliable way to make account identity a true invariant instead
of just a convention.

### Important Rollout Rule

Do **not** add the uniqueness migration first and hope production data fits it.
The audit and cleanup path must land first.

## Phase 3: Fix Founder Onboarding

Founder onboarding is currently the biggest guaranteed source of duplicate self
people.

### Current Problem

`/onboarding/person` always posts `linkToUser: true` and creates a new person.

### Required Change

When a founder reaches onboarding:

1. check whether the signed-in user already has a claimed person
2. if not, allow normal self-person creation
3. if yes, reuse that person and add it to the new tree scope
4. skip the "create yourself" step or convert it into a confirmation/edit step

### Implementation Options

Preferred:

- add an API route like `GET /api/me/identity`
- add an API route like `POST /api/trees/:treeId/identity/bootstrap`

Where bootstrap:

- verifies membership in the tree
- finds the signed-in user's claimed person
- adds that person to tree scope if needed
- returns the resulting person for onboarding continuation

### Files Likely Affected

- `apps/web/src/app/onboarding/page.tsx`
- `apps/web/src/app/onboarding/person/page.tsx`
- `apps/web/src/lib/onboarding-session.ts`
- `apps/api/src/routes/trees.ts`
- `apps/api/src/routes/people.ts`
- new identity service file

## Phase 4: Fix Invitation Acceptance

Invitation acceptance must become the main safe path for cross-tree identity.

### Current Problems

- it updates the invited person with a filter on both `person.id` and
  `person.tree_id`
- that breaks conceptually once the same person can be scoped into a tree whose
  legacy `tree_id` is elsewhere
- it only reports a duplicate conflict after accepting; it does not present a
  durable identity status model

### Required Changes

Accepting a linked-person invitation should do this:

1. verify the invitation and create membership
2. ensure the linked person is in the invited tree's scope
3. inspect the signed-in user's claimed identity state
4. handle one of four outcomes:

- `unclaimed user + unclaimed linked person`
  Claim succeeds.
- `user already linked to same person`
  No-op claim, just ensure scope/membership.
- `user linked to different person`
  Accept membership, keep both records visible as a conflict, return structured
  conflict payload.
- `linked person already claimed by different user`
  Reject claim and return a clear error.

### Required Backend Rule

Claiming a person must never silently overwrite another user's claim.

### Files Likely Affected

- `apps/api/src/routes/invitations.ts`
- new identity service file
- `apps/web/src/app/invitations/accept/page.tsx`

## Phase 5: Introduce Explicit Identity Status Endpoints

The frontend needs a stable identity contract instead of inferring identity from
tree people lists.

### Recommended New Endpoints

- `GET /api/me/identity`
  Returns the signed-in user's canonical person, duplicate/conflict status, and
  visible trees for that person.
- `GET /api/trees/:treeId/me`
  Returns the signed-in user's identity within one tree:
  - membership
  - claimed person in that tree, if any
  - whether the person is in scope
  - whether onboarding/bootstrap is needed
- optional: `POST /api/trees/:treeId/claim-person`
  Explicitly claim an unclaimed in-tree person for the current user.

### Why This Matters

Several UI surfaces currently do:

- fetch all people in the tree
- find the first one whose `linkedUserId === session.user.id`

That is brittle and not a real identity model.

### Files Likely Affected

- `apps/api/src/routes/people.ts`
- `apps/api/src/routes/trees.ts`
- `apps/web/src/app/page.tsx`
- `apps/web/src/app/dashboard/page.tsx`
- `apps/web/src/app/trees/[treeId]/page.tsx`
- possibly `apps/web/src/app/trees/[treeId]/atrium/page.tsx`

## Phase 6: Tighten Person Creation Semantics

Person creation needs better rules once account identity is authoritative.

### Required Rule

`linkToUser: true` should no longer blindly create a new person row.

Instead:

- if the user has no claimed person, create one and claim it
- if the user already has a claimed person, either:
  - reuse it and add scope to this tree, or
  - reject with a clear error if this path should not be used here

### Recommended Change

Treat "create me" as a special identity action, not as generic person creation
with a boolean flag.

That likely means:

- keep general `POST /api/trees/:treeId/people` for ordinary people
- add a dedicated self bootstrap/claim endpoint for signed-in users

### Why

The current generic `linkToUser` flag is too easy to misuse from future UI code.

## Phase 7: Permission And Access Fixes

Once one claimed person spans multiple trees, some currently hidden assumptions
become correctness bugs.

### 1. Portrait Media Access

Problem:

- a person record can point to `portrait_media_id`
- media access currently checks direct tree membership in `media.tree_id`, or a
  memory/tag-derived scope path
- a portrait media file may belong to a different tree than the current tree
  and may not be accessible through memory-based logic

Required options:

- either allow portrait access when the viewer can view the linked person in any
  tree that scopes that person
- or treat portraits as tree-scoped display choices instead of canonical person
  fields

For this implementation slice, the safer path is probably:

- keep canonical `portraitMediaId`
- update media access checks to permit access when the requesting user can view
  the person record that references that portrait

### 2. Place References

Problem:

- people currently reference `birthPlaceId` and `deathPlaceId`
- places remain tree-local
- a shared person may reference a place created in another tree

Immediate plan:

- allow read-time usage of existing place refs as-is
- do not attempt to globally deduplicate places in this slice
- document that editing place refs in another tree may require future product
  rules

### 3. Map And Tree-Scoped Read Paths

Problem:

- some routes still query `people.tree_id = treeId` directly
- that will omit shared scoped people

Required review:

- map route
- any export route
- any search/list route
- any place/memory/person read path still anchored to legacy `tree_id`

These routes do not all need to be fully fixed before first identity rollout,
but they must at least be audited and classified as:

- blocker
- safe to defer
- known limitation

## Phase 8: UI Surfaces For Conflict And Reuse

Identity only works if users and stewards understand what the system is doing.

### Required UI States

#### Founder creating another tree

Show:

- "You already exist in another tree"
- "We’ll reuse your person record here"

#### Invite acceptance conflict

Show:

- "This account is already linked to another person record"
- the existing tree/person
- the newly linked tree/person
- a clear next step: steward merge required

#### Person page / settings

Show:

- which trees this person appears in
- whether this person is the signed-in user's claimed identity
- whether there is a duplicate conflict requiring merge

### Likely Files

- `apps/web/src/app/invitations/accept/page.tsx`
- `apps/web/src/app/onboarding/person/page.tsx`
- `apps/web/src/app/trees/[treeId]/people/[personId]/page.tsx`
- `apps/web/src/app/trees/[treeId]/settings/page.tsx`

## Phase 9: Merge Workflow Hardening For Claimed Duplicates

The merge service already exists, but account identity makes some flows much
more common and much more important.

### Required Additions

- explicit test cases for merging duplicates that share the same
  `linkedUserId`
- explicit test cases for rejecting merges between two different claimed users
- merge-copy behavior for invitations pointing at the merged-away person
- merge behavior for `tree_person_scope` and relationship visibility is already
  important and should be re-verified under claimed-person scenarios

### Likely Files

- `apps/api/src/lib/cross-tree-merge-service.ts`
- `apps/api/src/lib/cross-tree-merge-service.test.ts`

## Phase 10: Capacity And Billing Checks

Identity reuse changes people-count semantics.

### Required Rule

Adding an already-existing claimed person to another tree should consume one
scope slot in that tree, not zero. That already mostly matches current
`tree_person_scope` counting, but must be preserved intentionally.

### Review Items

- `checkTreeCanAdd(treeId, "person")`
- onboarding bootstrap path
- invitation acceptance path
- any future auto-scope path

## Schema And Migration Work

### Migration 1: Data Audit Support

Optional but useful:

- add an index for `people.linked_user_id` if not already sufficient for audit
  and lookup

### Migration 2: Unique Claimed Identity

After cleanup:

- add partial unique index on `people(linked_user_id)` where not null

### Migration 3: Optional Identity Events Table

Not required for first implementation, but consider later if debugging becomes
hard:

- `person_identity_events`
  - user_id
  - person_id
  - tree_id
  - event_type (`claimed`, `claim_conflict`, `merged`, `scope_added`)
  - created_at

This is useful for operations, but not necessary to begin.

## API And Code Areas To Change

### Backend

- `apps/api/src/lib/account-identity-service.ts` (new)
- `apps/api/src/routes/invitations.ts`
- `apps/api/src/routes/people.ts`
- `apps/api/src/routes/trees.ts`
- `apps/api/src/lib/cross-tree-write-service.ts`
- `apps/api/src/lib/cross-tree-read-service.ts`
- `apps/api/src/lib/cross-tree-permission-service.ts`
- `apps/api/src/routes/media.ts`
- `apps/api/src/routes/import.ts` review only for this slice

### Frontend

- `apps/web/src/app/page.tsx`
- `apps/web/src/app/onboarding/page.tsx`
- `apps/web/src/app/onboarding/person/page.tsx`
- `apps/web/src/app/invitations/accept/page.tsx`
- `apps/web/src/app/dashboard/page.tsx`
- `apps/web/src/app/trees/[treeId]/page.tsx`
- `apps/web/src/app/trees/[treeId]/people/[personId]/page.tsx`
- `apps/web/src/lib/onboarding-session.ts`

### Database / Scripts

- `packages/database/src/schema.ts`
- `drizzle/*` new migration(s)
- `packages/database/src/scripts/*` audit or cleanup helpers

## Test Plan

### Unit Tests

Add backend tests for:

- claiming first person for a user
- reusing claimed person in a second tree
- conflict when user already linked to another person
- conflict when person already claimed by different user
- founder bootstrap for existing claimed user
- invitation acceptance with each identity outcome

### Integration Tests

Add route-level tests for:

- `POST /api/trees/:treeId/identity/bootstrap`
- `GET /api/me/identity`
- invitation acceptance conflict payload
- onboarding reuse flow

### Regression Tests

Re-run or extend tests around:

- merge behavior
- relationship creation after merged claimed people
- tree canvas current-user selection
- permission checks for subject sovereignty
- media access for portraits across trees

## Major Risks And Failure Modes

### 1. Duplicate Claimed People Already Exist

Risk:

- adding a unique index will fail
- UI may pick the wrong current-user person in tree queries

Mitigation:

- audit first
- build cleanup report
- only enforce uniqueness after resolution

### 2. Invitation Acceptance Writes To Wrong Legacy Tree Assumption

Risk:

- a valid shared person cannot be claimed because `people.tree_id` does not
  match the invited tree

Mitigation:

- stop using `people.tree_id = invitation.tree_id` as an identity check
- use `tree_person_scope` plus person id instead

### 3. Portrait Access Breaks For Shared Person

Risk:

- person page renders portrait URL but media route denies access

Mitigation:

- update media authorization before or alongside rollout

### 4. Founder Creates Silent Duplicate Anyway

Risk:

- onboarding path bypasses the new identity logic

Mitigation:

- move founder self-person creation behind dedicated identity bootstrap route

### 5. Tree-Scoped Queries Miss Shared People

Risk:

- user appears as a member of a tree but not on map/canvas/auxiliary views

Mitigation:

- audit all routes still keyed directly on `people.tree_id`
- fix blockers before rollout

### 6. Merge Conflicts Become User-Facing Dead Ends

Risk:

- users accept an invite and are told there is a conflict but have no path
  forward

Mitigation:

- include structured conflict payload
- add steward-visible merge entry point
- expose duplicate candidates prominently on person page

## Recommended Implementation Order

1. Add the identity service and `GET /api/me/identity`.
2. Add audit tooling for duplicate claimed users.
3. Fix founder onboarding to reuse claimed person.
4. Fix invitation acceptance to use identity service and return conflict states.
5. Add explicit tree bootstrap/claim endpoints.
6. Update frontend identity-dependent surfaces.
7. Fix portrait/media access for shared claimed people.
8. Expand tests.
9. Clean existing duplicate claimed users.
10. Add DB uniqueness constraint on `linked_user_id`.

## Recommended First Slice

If implementation needs to be broken into the smallest safe first PR, do this:

### Slice A

- add identity service
- add `GET /api/me/identity`
- add founder bootstrap route
- update onboarding to reuse existing claimed person
- add tests

This delivers the highest-value behavior change immediately:

- one user stops creating a fresh self person every time they found a new tree

### Slice B

- refactor invitation acceptance around the identity service
- add conflict UI

### Slice C

- audit + cleanup tooling
- partial unique index on `linked_user_id`

## Open Questions To Resolve Before Coding

These are not blockers to planning, but they should be decided before
implementation begins:

1. Should a founder who already has a claimed person be allowed to edit their
   canonical name during new-tree onboarding, or should onboarding become a pure
   reuse flow?
2. Do we want an explicit "claim this person as me" action on person pages for
   trees where the user is already a member but not yet linked?
3. Should portrait selection remain canonical on the global person, or should
   portrait become tree-local display state in a later slice?
4. Do we want to auto-merge duplicates with the same `linked_user_id` when the
   merge is trivially safe, or keep all merges steward-driven?

My recommendation:

- keep canonical person edits separate from reuse bootstrap
- do not auto-claim arbitrary in-tree people without explicit user action
- keep portrait canonical for now, but patch access control
- keep merges steward-driven, even for same-account duplicates
