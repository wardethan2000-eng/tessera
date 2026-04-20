# SPEC Amendment: Cross-Tree Data Architecture

**Amends:** Parts III, IV, VI, IX (Monetization), XII
**Status:** Implemented
**Date:** 2026-04-19

---

## Preamble

This amendment replaces the tree-scoped data model with a global person graph and tree-scoped views. The original SPEC treats Person, Relationship, Memory, and Media as belonging to a single tree. This creates an intractable problem: every marriage bridges two families, and any child exists in both. Under the original model, shared people are duplicated across trees, memories are siloed, and data drifts out of sync.

The amendment's central insight: **People are not tree-scoped. Trees are people-scoped.** A tree is a named, persisted lens into a shared graph of people, relationships, and memories — not a container that owns them.

This aligns with the SPEC's own first principles:
- "The subject is sovereign" — sovereignty attaches to the *person*, not to a tree.
- "One account, multiple trees" — the person transcends any single tree.
- "Trees can be merged" — only coherent if they reference a shared substrate.

---

## 1. Amended Concepts

### 1.1 The Global Person Graph

Every person who has ever lived in any family represented on the platform exists as **one record**, globally. A person is not created "inside" a tree; they are created in the global graph and then included in one or more trees' scopes.

Every relationship between two people exists as **one record**, globally. A marriage between Ethan and Karsen is a single edge in the graph, not a duplicated record in each spouse's family tree.

Every memory exists as **one record**, globally. A wedding photo tagged with Ethan and Karsen is accessible from any tree that includes either person in its scope.

### 1.2 Trees as Scoped Views

A tree defines:
- **Which people** are in its scope (via `TreePersonScope`)
- **Which relationships** to display (via `TreeRelationshipVisibility`)
- **What visibility rules** govern content for its members (via per-tree permissions)
- **Who can participate** as accounts with roles (via `TreeMembership`, unchanged)

A tree does NOT own person records, relationship records, or memories.

### 1.3 The Home Tree

Each person has a **home tree** — the tree where they were first created or where they are most deeply rooted. The home tree's stewards serve as default managers of that person's canonical record (name, dates, portrait). Other trees can override display preferences locally but cannot alter the canonical data.

If the person has a linked account, they are sovereign over their own record regardless of home tree.

### 1.4 Storage Attribution

Media files are attributed to a **contributing tree** for billing purposes. When Karsen uploads a photo while using the Karsen Family Tree, storage counts against that tree's quota. The Ward Family Tree can view the memory (because a tagged person is in their scope) but pays nothing for it.

---

## 2. Amended Data Model

### 2.1 Entities That Lose `tree_id` (Become Global)

#### `Person` (amended)
```
- id
- display_name, also_known_as
- essence_line
- birth_date_text, death_date_text
- birth_place, death_place, birth_place_id, death_place_id
- is_living
- portrait_media_id
- gender_identity, pronouns
- linked_user_id — nullable; populated when the subject claims the node
- home_tree_id — the tree that created this person (for stewardship fallback)
- created_at, updated_at
```

**Removed:** `tree_id` (was `NOT NULL` foreign key to `trees`)

**Added:** `home_tree_id` (nullable foreign key to `trees`, `SET NULL` on delete)

**Impact:** The `people` table no longer cascades on tree deletion. A person persists as long as any tree includes them.

#### `Relationship` (amended)
```
- id
- from_person_id, to_person_id
- type, spouse_status
- normalized_person_a_id, normalized_person_b_id
- start_date_text, end_date_text
- sort_order
- created_in_tree_id — which tree originally created this relationship
- created_at
```

**Removed:** `tree_id` (was `NOT NULL` foreign key to `trees`)

**Added:** `created_in_tree_id` (nullable, for provenance tracking)

**Impact:** Unique constraint changes from `(tree_id, type, from_person_id, to_person_id)` to `(type, normalized_person_a_id, normalized_person_b_id)`. A relationship between two people can exist only once globally, regardless of how many trees include both people.

#### `Memory` (amended)
```
- id
- primary_person_id
- contributor_user_id
- contributing_tree_id — the tree context in which this was uploaded (for storage billing)
- media_id, prompt_id
- kind, title, body
- date_of_event_text
- place_id, place_label_override
- transcript_text, transcript_language, transcript_status, transcript_error, transcript_updated_at
- created_at, updated_at
```

**Removed:** `tree_id` (was `NOT NULL` foreign key to `trees`)

**Added:** `contributing_tree_id` (NOT NULL — every memory is uploaded in the context of a tree, for billing)

#### `Media` (amended)
```
- id
- contributing_tree_id — for storage billing attribution
- uploaded_by_user_id
- storage_provider, object_key, original_filename
- mime_type, size_bytes, checksum
- created_at
```

**Removed:** `tree_id`

**Added:** `contributing_tree_id`

### 2.2 New Entities

#### `TreePersonScope`
The join table that defines which people appear in which trees.

```
- tree_id (FK → trees, NOT NULL, CASCADE on delete)
- person_id (FK → people, NOT NULL, CASCADE on delete)
- PRIMARY KEY (tree_id, person_id)
- display_name_override — nullable; tree-local nickname/display preference
- visibility_default — default visibility for this person's content within this tree
  (all_members / family_circle / named_circle)
- added_by_user_id (FK → users, SET NULL on delete)
- added_at
```

**Key behavior:** Deleting a tree cascades to `TreePersonScope`, removing all scope entries — but the person records themselves persist.

#### `TreeRelationshipVisibility`
Controls whether a globally-defined relationship is shown in a given tree.

```
- tree_id (FK → trees, NOT NULL, CASCADE on delete)
- relationship_id (FK → relationships, NOT NULL, CASCADE on delete)
- PRIMARY KEY (tree_id, relationship_id)
- is_visible (boolean, default true)
- notes — tree-local steward annotation (e.g., "estranged since 1987")
```

**Default behavior:** When a person is added to a tree's scope, all their relationships to other people already in the tree's scope are automatically made visible. Stewards can hide specific relationships.

#### `MemoryPersonTag`
Replaces the old `co_subjects` array with a proper join table.

```
- memory_id (FK → memories, NOT NULL, CASCADE on delete)
- person_id (FK → people, NOT NULL, CASCADE on delete)
- PRIMARY KEY (memory_id, person_id)
```

**Visibility rule:** A memory is potentially visible in any tree whose scope includes any person in its tag set. Per-tree visibility restrictions (via `MemoryTreeVisibility`) can further limit this.

#### `MemoryTreeVisibility`
Per-tree visibility overrides for memories.

```
- memory_id (FK → memories, NOT NULL, CASCADE on delete)
- tree_id (FK → trees, NOT NULL, CASCADE on delete)
- PRIMARY KEY (memory_id, tree_id)
- visibility_override — (all_members / family_circle / named_circle / hidden)
- unlock_date — nullable; for time-locked memories
```

**Absence semantics:** If no row exists for a (memory, tree) pair, the memory inherits the visibility default from the `TreePersonScope` of its primary person in that tree. An explicit row of `hidden` suppresses the memory in that tree entirely.

### 2.3 Entities That Remain Tree-Scoped

These entities are inherently tree-local and retain their `tree_id`:

- **`Tree`** — unchanged
- **`TreeMembership`** — unchanged (account roles are per-tree)
- **`Invitation`** — unchanged (invitations are to a specific tree)
- **`Prompt`** — retains `tree_id` (prompts are sent in the context of a tree)
- **`PromptReplyLink`** — retains `tree_id`
- **`ArchiveExport`** — retains `tree_id`
- **`TranscriptionJob`** — retains `tree_id` (billing context)
- **`Place`** — retains `tree_id` (places are often tree-local; cross-tree place dedup is a future enhancement)

### 2.4 Removed Entities

- **`treeConnections`** — replaced by `TreePersonScope` (trees share people directly; no bilateral connection handshake needed)
- **`crossTreePersonLinks`** — replaced by global person records (there's nothing to link when the person exists once)

---

## 3. Amended Account Model (Part III)

### 3.1 Accounts Are Free, Forever

No individual pays to have an account. Accounts exist to authenticate users, link them to their person records, and grant them roles in trees. A person who participates in five trees has one account, pays nothing for that account, and each tree's subscription covers the tree's costs.

### 3.2 Multi-Tree Participation (refined)

The existing SPEC says "a single account can participate in multiple trees." This amendment makes the mechanism explicit:

1. **The account is linked to exactly one Person record** (their own) via `Person.linked_user_id`.
2. **That Person record can appear in many trees** via `TreePersonScope`.
3. **The account holds a role in each tree** via `TreeMembership` (founder/steward/contributor/viewer).
4. **The home atrium** aggregates activity across all trees the account participates in.

### 3.3 How a Person Enters Multiple Trees

**Scenario: Ethan (Ward tree) marries Karsen (Karsen's family tree)**

1. The Ward tree already contains Ethan's person record. Ethan has an account linked to it.
2. Karsen's family creates their tree, adds Karsen, then wants to add "Karsen's husband."
3. Option A (invitation): They invite Ethan by email. Ethan accepts, which adds his existing person record to the Karsen Family Tree's scope (creates a `TreePersonScope` row) and gives him a `TreeMembership` role.
4. Option B (steward add): A steward searches by name or linked-account email. System finds the existing Ethan person record and offers to add it to the tree's scope. Ethan is notified and can decline.
5. Result: one Person record for Ethan, `TreePersonScope` rows in both trees, `TreeMembership` rows granting him a role in each.

**Scenario: Adding a deceased relative who exists in another tree**

1. A steward in Tree B creates a new person record (e.g., Great-Grandmother Rose, no account).
2. Later, someone in Tree A realizes Rose is already in Tree B.
3. A steward initiates a "link" request: "This person in our tree appears to be the same as a person in another tree."
4. Stewards of both trees must approve the merge.
5. On approval, one person record is kept (the more complete one), the other's data is merged in, and both trees' `TreePersonScope` rows point to the surviving record.

---

## 4. Amended Permissions Architecture (Part VI)

### 4.1 Global Record Permissions

| Action | Who Can Do It |
|--------|--------------|
| Edit canonical Person record (name, dates, portrait) | The subject (if living + has account) > home tree steward > any tree steward where the person is in scope |
| Edit Relationship record | Either participant (if they have accounts) > steward of the tree that created the relationship |
| Delete a Person record | Only if person appears in exactly one tree's scope AND the steward of that tree requests it. Otherwise, remove from scope (does not delete globally). |
| Delete a Memory | The contributor, or a steward of the contributing tree. Other trees lose visibility but don't need to act. |

### 4.2 Per-Tree Visibility (replaces original Layer 2-3)

Visibility is resolved per-tree. The resolution order:

1. **Subject sovereignty:** If the tagged person has an account and has marked the memory as hidden on their node, it is hidden everywhere. Full stop.
2. **Memory-level tree override:** If a `MemoryTreeVisibility` row exists for this (memory, tree) pair, use its `visibility_override`.
3. **Person-level tree default:** Use the `visibility_default` from `TreePersonScope` for the memory's primary person in this tree.
4. **Tree-level default:** Use the tree's global default visibility setting.

Most restrictive wins at every level.

### 4.3 Cross-Tree Visibility Rule

A memory M is **potentially visible** in tree T if:
- Tree T's scope includes at least one person tagged in M (via `MemoryPersonTag`)
- AND the memory is not explicitly hidden in tree T (via `MemoryTreeVisibility`)
- AND the subject sovereignty check passes

This means: when Karsen uploads a wedding photo tagged [Ethan, Karsen, Karsen's parents], the Ward tree can see it if Ethan is in the Ward tree's scope (he is). But if Karsen restricts that memory to "Karsen's Family Tree only" via `MemoryTreeVisibility`, the Ward tree won't see it.

---

## 5. Amended Monetization (Part IX)

### 5.1 Principle: Pay for Trees, Not Identities

Individual accounts are free. Trees have subscriptions. This eliminates:
- The "grandma needs an account to be in the tree" problem — she doesn't.
- The "who pays for the baby" problem — nobody; the baby is a person node.
- The "I'm in 3 trees" problem — your account is free; each tree's founder pays.
- The "dead ancestors" problem — they're person records, not billing entities.

### 5.2 What a Tree Subscription Covers

| Resource | What It Costs |
|----------|--------------|
| **Storage** | Media uploaded in the context of this tree (the `contributing_tree_id`). Primary cost driver. |
| **Person scope** | Number of person records in the tree's `TreePersonScope`. Generous caps per tier. |
| **Contributor seats** | Number of active accounts with contributor-or-above roles in `TreeMembership`. |
| **AI features** | Transcription, OCR, future AI features — billed to the tree where the job was initiated. |

### 5.3 Tier Structure

| Tier | Price | Storage | People in Scope | Contributor Seats | Notes |
|------|-------|---------|----------------|-------------------|-------|
| **Seedling** | Free | 1 GB | 25 | 2 | Enough to start, feel the product. No time limit. |
| **Hearth** | $36/year | 50 GB | 200 | 15 | Most families. |
| **Archive** | $96/year | 500 GB | Unlimited | Unlimited | Families with deep media collections or many branches. |

### 5.4 Cross-Tree Economics

- The Ward family pays for the Ward tree. Karsen's family pays for the Karsen Family Tree.
- The overlap (Ethan, Karsen, their children) appears in both trees at no extra cost — it's the same person records viewed from two scopes.
- Storage is billed to the tree where the upload happened (`contributing_tree_id`). A memory visible in multiple trees only counts once, against the uploader's tree.
- If one tree's subscription lapses, its scope goes dormant, but the person records and memories persist. Other active trees that reference the same people continue to see all shared content.

### 5.5 Subscription Lifecycle

| State | Effect |
|-------|--------|
| **Active** | Full access. All features available. |
| **Grace period** (0–90 days past expiry) | Read-only for all members. No new uploads. Prompts paused. Clear messaging: "Your tree's subscription has lapsed." |
| **Dormant** (90+ days past expiry) | Tree frozen. Members cannot access the tree view. Person records referenced by OTHER active trees remain fully visible to those trees. Memories with `contributing_tree_id` of this tree remain tagged and visible to other trees. Data is preserved, never deleted. |
| **Reactivated** | Immediate full restoration. No data loss. |
| **Explicitly deleted by founder** | 30-day soft delete with recovery. After 30 days: tree and its `TreePersonScope` rows deleted. Person records that still appear in other trees' scopes are unaffected. Person records in no other tree's scope enter "guardian-less" state (preserved in cold storage, claimable if a new tree adds them). Memories attributed to this tree are preserved but lose their tree context. Media files enter a 1-year retention hold before permanent deletion. |

---

## 6. Amended Display Model

### 6.1 In-Law Rendering in the Constellation

When viewing a tree, in-law families (people in the global graph who are NOT in this tree's scope but are related to people who are) can appear as contextual nodes:

- **Default:** Spouses from outside the tree's scope appear as a single node with a subtle "external" indicator. Their family of origin is not shown.
- **Expanded (one click/toggle):** Shows the external spouse's parents and siblings as faded/secondary nodes. Not editable from this tree. A subtle link ("View in [Karsen's Family Tree]") allows navigation to the other tree, if the viewer has access.
- **Person-centered view:** Clicking any person shows all trees they appear in and all relationships, regardless of which tree the viewer entered from.

### 6.2 The Tree Picker and Cross-Tree Navigation

The atrium's tree picker (already specified) becomes more important. When a user views a person who exists in multiple trees, subtle navigation affordances allow drifting between tree contexts:

- "Ethan also appears in: Ward Family Tree, Karsen's Family Tree"
- Clicking switches tree context, re-rendering the constellation from the new tree's scope.

### 6.3 Sub-Family and Lineage Views

Sub-family views (e.g., "Ethan & Karsen's Family") are a natural fit for this model. A sub-family view is a temporary scope narrowing — it shows a subset of the tree's full scope centered on a specific person or couple, with parents as context. This can seamlessly include in-law parents from outside the tree's formal scope as contextual nodes.

---

## 7. Edge Cases

### 7.1 Duplicate Person Detection and Merging

**Problem:** Two trees independently create a person record for the same real human.

**Solution:** A merge flow, available to stewards of both trees:

1. System suggests potential duplicates based on: linked account email match (strongest signal), name + birth date similarity, relationship graph overlap.
2. Never auto-merge. Always require explicit steward confirmation from both sides.
3. On merge: one record survives (the more complete one, or steward's choice). The other's unique data (essence line, photos, memories) is absorbed. All `TreePersonScope`, `MemoryPersonTag`, and `Relationship` rows are updated to point to the surviving record. The merged-away ID is stored in an audit log for traceability.

### 7.2 Divorce

- The relationship record gets an `end_date_text` and `spouse_status: 'former'`.
- Both trees still contain both people in scope.
- Stewards can hide the relationship in their tree via `TreeRelationshipVisibility.is_visible = false`.
- Memories from the marriage era remain (they happened; the product respects history).
- New memories can be restricted per-tree via `MemoryTreeVisibility`.
- Children continue to appear in both trees seamlessly.

### 7.3 Privacy Across Trees

A person can restrict a memory's visibility to specific trees:
- At upload: "Share this memory with: [✓ Karsen's Family Tree] [✗ Ward Family Tree]"
- After upload: adjust via `MemoryTreeVisibility` settings.
- Subject override: a tagged person can hide a memory from their node in any or all trees, regardless of what the uploader chose.

### 7.4 Stewardship Conflicts

Two tree stewards want different biographical data for a shared person.

**Resolution hierarchy:**
1. The subject (living, linked account) is sovereign. Their edits to their own Person record are canonical.
2. If no linked account: the home tree's steward is the canonical editor.
3. Other trees use `TreePersonScope.display_name_override` for tree-local preferences (e.g., a nickname used in one family but not another).
4. Factual disputes surface as annotations, not competing records.

### 7.5 Children and COPPA

Unchanged from original SPEC. Children under 13 are person nodes without accounts, managed by their parents. The child appears in all relevant trees via `TreePersonScope`. When they turn 13 and claim their node, they inherit subject sovereignty in ALL trees where they appear — not just one.

### 7.6 Orphaned Person Records

A person record exists in no tree's scope (all trees removed it or went dormant/deleted).

- The person record is NOT deleted. It enters "guardian-less" state.
- If the person has a linked account, they retain access to their own data and can add themselves to a new tree.
- If no linked account: the record is preserved in cold storage. If any tree later adds this person to its scope, the record is restored.
- Permanent deletion only occurs via explicit GDPR/data-removal request from the linked account holder, with a clear warning about consequences.

### 7.7 Tree Scope Creep

Following every marriage link in the global graph would eventually connect most of the platform. Trees must have explicit, managed scopes.

- Stewards manually add people to the tree's scope. The system never auto-expands scope.
- The system MAY suggest additions: "Karsen married Ethan. Would you like to add Ethan to this tree?" Steward must confirm.
- A tree's "natural" scope is typically 3–5 generations of direct lineage plus spouses. Most trees contain 50–200 people.
- Tier caps on `TreePersonScope` rows provide a soft limit; upgrading expands the cap.

---

## 8. Migration Path (Relationship to Current Schema)

The existing schema has `tree_id` on `people`, `relationships`, `memories`, and `media`. It also has `treeConnections` and `crossTreePersonLinks` tables that attempt cross-tree linking via the duplication model.

### Phase 1 (Current — Single Tree per Account)

No migration needed. The current schema works for single-tree use. `tree_id` on Person effectively functions as the sole `TreePersonScope` row. Ship the MVP with this model.

### Phase 2 (Multi-Tree Introduction)

When multi-tree membership launches (SPEC Phase 4), perform the migration:

1. **Create new tables:** `tree_person_scope`, `tree_relationship_visibility`, `memory_person_tags`, `memory_tree_visibility`.
2. **Populate `tree_person_scope`:** For every existing person, create a row `(person.tree_id, person.id)`.
3. **Add `home_tree_id` to `people`:** Set to current `tree_id` for all existing records.
4. **Add `contributing_tree_id` to `memories` and `media`:** Set to current `tree_id`.
5. **Drop `tree_id` from `people`, `relationships`, `memories`, `media`** (after verifying all queries use the new join tables).
6. **Migrate `co_subjects`:** For each memory with a `co_subjects` array, create `MemoryPersonTag` rows.
7. **Drop `tree_connections` and `cross_tree_person_links`:** Replaced by the new model.
8. **Update unique constraints:** Relationship uniqueness moves from `(tree_id, type, from, to)` to `(type, normalized_a, normalized_b)`.

### Phase 3 (Duplicate Detection and Merging)

Build the merge flow after multi-tree is stable. This is the hardest engineering work and should not block the multi-tree launch. Initial cross-tree sharing can work via invitation (linking existing person records), with merge as a cleanup tool.

---

## 9. Amendments to Specific SPEC Sections

| SPEC Section | What Changes |
|-------------|-------------|
| Part III, "Account Model" | Add: accounts are free forever. Clarify multi-tree person resolution. |
| Part III, "Multiple Trees" | Replace vague "Trees can be merged" with the explicit scope + merge model. |
| Part IV, `Person` entity | Remove `tree_id`. Add `home_tree_id`. |
| Part IV, `Relationship` entity | Remove `tree_id`. Add `created_in_tree_id`. |
| Part IV, `Memory` entity | Remove `tree_id`. Add `contributing_tree_id`. Replace `co_subjects` array with `MemoryPersonTag` join table. |
| Part IV, `Media` entity | Remove `tree_id`. Add `contributing_tree_id`. |
| Part IV, new entities | Add `TreePersonScope`, `TreeRelationshipVisibility`, `MemoryPersonTag`, `MemoryTreeVisibility`. |
| Part VI, Permissions | Add global record permissions table. Add cross-tree visibility resolution rule. |
| Part IX, Monetization | Replace "$36/year per tree" with tiered model. Add storage attribution rules. Add subscription lifecycle. |
| Part XII, Phase 4 | Add multi-tree migration as an explicit milestone. |
