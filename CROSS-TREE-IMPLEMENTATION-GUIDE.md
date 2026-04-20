# Cross-Tree Architecture: Implementation Guide

**Companion to:** `SPEC-AMENDMENT-CROSS-TREE.md`
**Purpose:** Step-by-step instructions for implementing the cross-tree data architecture across multiple development sessions.

> **Implementation Status (Updated):**
> All phases below have been **completed and deployed**. The legacy connection
> model (`tree_connections`, `cross_tree_person_links`, `tree_connection_status`)
> has been fully retired — dropped from the Drizzle schema and live database via
> migration `0008_retire_tree_connections.sql`. Code examples in this guide
> reflect the design-time intent; refer to the actual source files for the
> canonical, current implementation.

---

## Table of Contents

1. [Overview and Phasing](#1-overview-and-phasing)
2. [Phase 1: Schema Migration](#2-phase-1-schema-migration)
3. [Phase 2: API Layer Changes](#3-phase-2-api-layer-changes)
4. [Phase 3: Permission Engine](#4-phase-3-permission-engine)
5. [Phase 4: Frontend Changes](#5-phase-4-frontend-changes)
6. [Phase 5: Person Linking and Deduplication](#6-phase-5-person-linking-and-deduplication)
7. [Phase 6: Storage Attribution and Billing](#7-phase-6-storage-attribution-and-billing)
8. [Phase 7: Testing Strategy](#8-phase-7-testing-strategy)
9. [Phase 8: Data Migration Script](#9-phase-8-data-migration-script)
10. [Appendix: Entity Relationship Diagram](#10-appendix-entity-relationship-diagram)

---

## 1. Overview and Phasing

### Implementation Order

The work is ordered to be **incrementally deployable**. Each phase produces a working system. No phase requires all subsequent phases to function.

| Phase | What | Sessions (est.) | Dependency |
|-------|------|-----------------|------------|
| 1 | Schema migration | 2–3 | None |
| 2 | API layer changes | 3–4 | Phase 1 |
| 3 | Permission engine | 2–3 | Phase 2 |
| 4 | Frontend changes | 3–5 | Phase 2 |
| 5 | Person linking / dedup | 2–3 | Phase 3 |
| 6 | Storage attribution / billing | 1–2 | Phase 2 |
| 7 | Testing (ongoing) | Throughout | — |
| 8 | Data migration script | 1–2 | Phase 1 |

### Critical Path

```
Phase 1 (Schema) → Phase 2 (API) → Phase 3 (Permissions)
                                  → Phase 4 (Frontend)
                                  → Phase 6 (Billing)
Phase 3 → Phase 5 (Linking/Dedup)
Phase 1 → Phase 8 (Migration Script)
```

---

## 2. Phase 1: Schema Migration

### 2.1 New Tables

Add these tables to `packages/database/src/schema.ts`:

#### `treePersonScope`

```typescript
export const treePersonScope = pgTable(
  "tree_person_scope",
  {
    treeId: uuid("tree_id")
      .notNull()
      .references(() => trees.id, { onDelete: "cascade" }),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    displayNameOverride: varchar("display_name_override", { length: 200 }),
    visibilityDefault: varchar("visibility_default", { length: 32 })
      .default("all_members")
      .notNull(),
    addedByUserId: text("added_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    addedAt: timestamp("added_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.treeId, table.personId] }),
    index("tree_person_scope_person_idx").on(table.personId),
    index("tree_person_scope_tree_idx").on(table.treeId),
  ],
);
```

#### `treeRelationshipVisibility`

```typescript
export const treeRelationshipVisibility = pgTable(
  "tree_relationship_visibility",
  {
    treeId: uuid("tree_id")
      .notNull()
      .references(() => trees.id, { onDelete: "cascade" }),
    relationshipId: uuid("relationship_id")
      .notNull()
      .references(() => relationships.id, { onDelete: "cascade" }),
    isVisible: boolean("is_visible").default(true).notNull(),
    notes: text("notes"),
  },
  (table) => [
    primaryKey({ columns: [table.treeId, table.relationshipId] }),
    index("tree_rel_vis_relationship_idx").on(table.relationshipId),
  ],
);
```

#### `memoryPersonTags`

```typescript
export const memoryPersonTags = pgTable(
  "memory_person_tags",
  {
    memoryId: uuid("memory_id")
      .notNull()
      .references(() => memories.id, { onDelete: "cascade" }),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.memoryId, table.personId] }),
    index("memory_person_tags_person_idx").on(table.personId),
  ],
);
```

#### `memoryTreeVisibility`

```typescript
export const memoryTreeVisibility = pgTable(
  "memory_tree_visibility",
  {
    memoryId: uuid("memory_id")
      .notNull()
      .references(() => memories.id, { onDelete: "cascade" }),
    treeId: uuid("tree_id")
      .notNull()
      .references(() => trees.id, { onDelete: "cascade" }),
    visibilityOverride: varchar("visibility_override", { length: 32 }).notNull(),
    unlockDate: timestamp("unlock_date", { withTimezone: true }),
  },
  (table) => [
    primaryKey({ columns: [table.memoryId, table.treeId] }),
    index("memory_tree_vis_tree_idx").on(table.treeId),
  ],
);
```

### 2.2 Altered Tables

#### `people` — add `homeTreeId`, keep `treeId` temporarily

During migration, both columns exist. The plan:

1. **Add `home_tree_id`** as a nullable column.
2. **Backfill** `home_tree_id` from the existing `tree_id` for all rows.
3. **Create `tree_person_scope` rows** from existing `(tree_id, person_id)` pairs.
4. After all API queries are migrated: **drop `tree_id`** from `people`.

```typescript
// Step 1: Add the column
homeTreeId: uuid("home_tree_id").references(() => trees.id, {
  onDelete: "set null",
}),
```

#### `relationships` — add `createdInTreeId`, keep `treeId` temporarily

Same approach: add, backfill, migrate queries, drop.

```typescript
createdInTreeId: uuid("created_in_tree_id").references(() => trees.id, {
  onDelete: "set null",
}),
```

#### `memories` — rename `treeId` to `contributingTreeId`

```typescript
contributingTreeId: uuid("contributing_tree_id")
  .notNull()
  .references(() => trees.id, { onDelete: "restrict" }),
// Note: changed from CASCADE to RESTRICT — deleting a tree should not
// delete memories that may be visible in other trees.
```

#### `media` — rename `treeId` to `contributingTreeId`

Same approach as memories.

### 2.3 Removed Tables

After migration is complete and verified:

```typescript
// DELETE these table definitions:
// - treeConnections
// - crossTreePersonLinks
// And their relation definitions:
// - treeConnectionsRelations
// - crossTreePersonLinksRelations
```

Also remove from `treesRelations`:
- `treeConnectionsAsA`
- `treeConnectionsAsB`
- `treeConnectionsAsInitiator`

And from `peopleRelations`:
- `crossTreeLinksAsA`
- `crossTreeLinksAsB`

### 2.4 New Relations

```typescript
export const treePersonScopeRelations = relations(treePersonScope, ({ one }) => ({
  tree: one(trees, { fields: [treePersonScope.treeId], references: [trees.id] }),
  person: one(people, { fields: [treePersonScope.personId], references: [people.id] }),
  addedBy: one(users, { fields: [treePersonScope.addedByUserId], references: [users.id] }),
}));

export const treeRelationshipVisibilityRelations = relations(
  treeRelationshipVisibility,
  ({ one }) => ({
    tree: one(trees, {
      fields: [treeRelationshipVisibility.treeId],
      references: [trees.id],
    }),
    relationship: one(relationships, {
      fields: [treeRelationshipVisibility.relationshipId],
      references: [relationships.id],
    }),
  }),
);

export const memoryPersonTagsRelations = relations(memoryPersonTags, ({ one }) => ({
  memory: one(memories, { fields: [memoryPersonTags.memoryId], references: [memories.id] }),
  person: one(people, { fields: [memoryPersonTags.personId], references: [people.id] }),
}));

export const memoryTreeVisibilityRelations = relations(memoryTreeVisibility, ({ one }) => ({
  memory: one(memories, { fields: [memoryTreeVisibility.memoryId], references: [memories.id] }),
  tree: one(trees, { fields: [memoryTreeVisibility.treeId], references: [trees.id] }),
}));
```

Add to existing relations:

```typescript
// In treesRelations, add:
personScope: many(treePersonScope),
relationshipVisibility: many(treeRelationshipVisibility),
memoryVisibility: many(memoryTreeVisibility),

// In peopleRelations, add:
treeScopes: many(treePersonScope),
memoryTags: many(memoryPersonTags),

// In relationshipsRelations, add:
treeVisibility: many(treeRelationshipVisibility),

// In memoriesRelations, add:
personTags: many(memoryPersonTags),
treeVisibility: many(memoryTreeVisibility),
```

### 2.5 Drizzle Migration Checklist

```bash
# After making schema changes:
cd packages/database
pnpm drizzle-kit generate  # generates SQL migration file
pnpm drizzle-kit push       # applies to dev database (or run migration)

# Inspect the generated SQL to verify:
# 1. New tables are created
# 2. New columns are added (nullable or with defaults)
# 3. No data-destructive operations in this step
```

### 2.6 Unique Constraint Changes

**Current:** `relationships` has a unique constraint on `(tree_id, type, from_person_id, to_person_id)` (or the normalized version).

**New:** The unique constraint becomes `(type, normalized_person_a_id, normalized_person_b_id)` — globally unique.

**Migration concern:** If two trees independently created the same relationship (e.g., both have Ethan→Karsen as spouses), the migration must detect and merge these before applying the new constraint. The migration script (Phase 8) handles this.

---

## 3. Phase 2: API Layer Changes

### 3.1 Identifying Affected Queries

Every API query that filters by `tree_id` on `people`, `relationships`, or `memories` needs to be migrated to join through `tree_person_scope`.

**Find them:**
```bash
# In the API app, find all references to people.treeId or similar
grep -rn "people\.treeId\|\.treeId.*people\|WHERE.*tree_id.*people" apps/api/src/
grep -rn "relationships\.treeId\|\.treeId.*relationships" apps/api/src/
grep -rn "memories\.treeId\|\.treeId.*memories" apps/api/src/
```

### 3.2 Query Migration Pattern

**Before (tree-scoped):**
```typescript
const treePeople = await db
  .select()
  .from(people)
  .where(eq(people.treeId, treeId));
```

**After (scope-joined):**
```typescript
const treePeople = await db
  .select({ person: people, scope: treePersonScope })
  .from(treePersonScope)
  .innerJoin(people, eq(treePersonScope.personId, people.id))
  .where(eq(treePersonScope.treeId, treeId));
```

**After (with display name override):**
```typescript
const treePeople = await db
  .select({
    ...getTableColumns(people),
    displayName: sql`COALESCE(${treePersonScope.displayNameOverride}, ${people.displayName})`,
  })
  .from(treePersonScope)
  .innerJoin(people, eq(treePersonScope.personId, people.id))
  .where(eq(treePersonScope.treeId, treeId));
```

### 3.3 Relationship Queries

**Before:**
```typescript
const treeRelationships = await db
  .select()
  .from(relationships)
  .where(eq(relationships.treeId, treeId));
```

**After:**
```typescript
// Get relationships where BOTH people are in the tree's scope
// and the relationship is visible in this tree
const treeRelationships = await db
  .select()
  .from(relationships)
  .innerJoin(
    treePersonScope.as("scope_from"),
    and(
      eq(relationships.fromPersonId, sql`"scope_from"."person_id"`),
      eq(sql`"scope_from"."tree_id"`, treeId),
    ),
  )
  .innerJoin(
    treePersonScope.as("scope_to"),
    and(
      eq(relationships.toPersonId, sql`"scope_to"."person_id"`),
      eq(sql`"scope_to"."tree_id"`, treeId),
    ),
  )
  .leftJoin(
    treeRelationshipVisibility,
    and(
      eq(treeRelationshipVisibility.treeId, treeId),
      eq(treeRelationshipVisibility.relationshipId, relationships.id),
    ),
  )
  .where(
    or(
      isNull(treeRelationshipVisibility.isVisible),
      eq(treeRelationshipVisibility.isVisible, true),
    ),
  );
```

Consider wrapping this in a helper function:

```typescript
// packages/database/src/queries/tree-scoped.ts
export function getTreeRelationships(db: DB, treeId: string) { ... }
export function getTreePeople(db: DB, treeId: string) { ... }
export function getTreeMemories(db: DB, treeId: string) { ... }
```

### 3.4 New API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/trees/:treeId/scope/people` | Add a person to a tree's scope |
| `DELETE` | `/api/trees/:treeId/scope/people/:personId` | Remove a person from a tree's scope |
| `GET` | `/api/trees/:treeId/scope/people` | List people in a tree's scope |
| `PATCH` | `/api/trees/:treeId/scope/people/:personId` | Update display name override, visibility default |
| `GET` | `/api/people/:personId/trees` | List trees a person appears in |
| `POST` | `/api/people/:personId/link` | Request to link a duplicate person record |
| `POST` | `/api/people/:personId/merge` | Execute a person merge (steward action) |
| `PATCH` | `/api/trees/:treeId/relationships/:relId/visibility` | Toggle relationship visibility |
| `POST` | `/api/memories/:memoryId/tags` | Add/remove person tags on a memory |
| `PATCH` | `/api/memories/:memoryId/tree-visibility/:treeId` | Set memory visibility override for a tree |

### 3.5 Person Creation Flow (Modified)

**Before:** `POST /api/trees/:treeId/people` creates a person with `tree_id = treeId`.

**After:**

```typescript
// POST /api/trees/:treeId/people
async function createPerson(treeId: string, data: CreatePersonInput) {
  return await db.transaction(async (tx) => {
    // 1. Create global person record
    const [person] = await tx
      .insert(people)
      .values({
        ...data,
        homeTreeId: treeId,
      })
      .returning();

    // 2. Add to tree's scope
    await tx
      .insert(treePersonScope)
      .values({
        treeId,
        personId: person.id,
        addedByUserId: currentUser.id,
      });

    return person;
  });
}
```

### 3.6 Person Deletion Flow (Modified)

**Before:** `DELETE /api/trees/:treeId/people/:personId` deletes the person record.

**After:**

```typescript
async function removePerson(treeId: string, personId: string) {
  // Check: is this person in other trees' scopes?
  const otherScopes = await db
    .select()
    .from(treePersonScope)
    .where(
      and(
        eq(treePersonScope.personId, personId),
        ne(treePersonScope.treeId, treeId),
      ),
    );

  if (otherScopes.length > 0) {
    // Person exists elsewhere — just remove from this tree's scope
    await db
      .delete(treePersonScope)
      .where(
        and(
          eq(treePersonScope.treeId, treeId),
          eq(treePersonScope.personId, personId),
        ),
      );
  } else {
    // Person only exists in this tree — offer full deletion
    // Requires steward confirmation via a two-step process
    await db.transaction(async (tx) => {
      await tx.delete(treePersonScope).where(
        and(
          eq(treePersonScope.treeId, treeId),
          eq(treePersonScope.personId, personId),
        ),
      );
      await tx.delete(people).where(eq(people.id, personId));
    });
  }
}
```

### 3.7 Relationship Creation Flow (Modified)

```typescript
async function createRelationship(treeId: string, data: CreateRelationshipInput) {
  return await db.transaction(async (tx) => {
    // 1. Verify both people are in this tree's scope
    const bothInScope = await tx
      .select()
      .from(treePersonScope)
      .where(
        and(
          eq(treePersonScope.treeId, treeId),
          inArray(treePersonScope.personId, [data.fromPersonId, data.toPersonId]),
        ),
      );

    if (bothInScope.length !== 2) {
      throw new Error("Both people must be in this tree's scope");
    }

    // 2. Check if the relationship already exists globally
    const existing = await tx
      .select()
      .from(relationships)
      .where(
        and(
          eq(relationships.type, data.type),
          eq(relationships.normalizedPersonAId, normalizeA(data)),
          eq(relationships.normalizedPersonBId, normalizeB(data)),
        ),
      );

    if (existing.length > 0) {
      // Relationship already exists globally (created by another tree).
      // Just ensure it's visible in this tree.
      await tx.insert(treeRelationshipVisibility).values({
        treeId,
        relationshipId: existing[0].id,
        isVisible: true,
      }).onConflictDoNothing();
      return existing[0];
    }

    // 3. Create global relationship
    const [rel] = await tx
      .insert(relationships)
      .values({
        ...data,
        createdInTreeId: treeId,
      })
      .returning();

    return rel;
  });
}
```

---

## 4. Phase 3: Permission Engine

### 4.1 Architecture

Create a centralized permission resolver at `packages/database/src/permissions/`:

```
packages/database/src/permissions/
├── index.ts              # Main exports
├── resolve-memory.ts     # Memory visibility resolution
├── resolve-person.ts     # Person edit permissions
├── resolve-relationship.ts # Relationship visibility
└── types.ts              # Permission types
```

### 4.2 Memory Visibility Resolution

```typescript
// packages/database/src/permissions/resolve-memory.ts

export type VisibilityLevel =
  | "all_members"
  | "family_circle"
  | "named_circle"
  | "hidden";

interface MemoryVisibilityContext {
  memoryId: string;
  treeId: string;  // The tree context the viewer is in
  viewerUserId: string;
}

export async function resolveMemoryVisibility(
  db: DB,
  ctx: MemoryVisibilityContext,
): Promise<VisibilityLevel> {
  // 1. Subject sovereignty check
  //    If any tagged person has hidden this memory globally, it's hidden.
  const subjectOverride = await checkSubjectSovereignty(db, ctx.memoryId);
  if (subjectOverride === "hidden") return "hidden";

  // 2. Per-tree explicit override
  const treeOverride = await db
    .select()
    .from(memoryTreeVisibility)
    .where(
      and(
        eq(memoryTreeVisibility.memoryId, ctx.memoryId),
        eq(memoryTreeVisibility.treeId, ctx.treeId),
      ),
    );

  if (treeOverride.length > 0) {
    // Check unlock_date
    if (treeOverride[0].unlockDate && treeOverride[0].unlockDate > new Date()) {
      return "hidden"; // time-locked
    }
    return treeOverride[0].visibilityOverride as VisibilityLevel;
  }

  // 3. Person-level tree default
  const memory = await db
    .select()
    .from(memories)
    .where(eq(memories.id, ctx.memoryId))
    .limit(1);

  const personScope = await db
    .select()
    .from(treePersonScope)
    .where(
      and(
        eq(treePersonScope.treeId, ctx.treeId),
        eq(treePersonScope.personId, memory[0].primaryPersonId),
      ),
    );

  if (personScope.length > 0) {
    return personScope[0].visibilityDefault as VisibilityLevel;
  }

  // 4. Tree-level default
  return "all_members";
}
```

### 4.3 Person Edit Permissions

```typescript
// packages/database/src/permissions/resolve-person.ts

export async function canEditPerson(
  db: DB,
  userId: string,
  personId: string,
): Promise<{ allowed: boolean; reason: string }> {
  const person = await db
    .select()
    .from(people)
    .where(eq(people.id, personId))
    .limit(1);

  if (!person.length) return { allowed: false, reason: "Person not found" };

  // 1. Subject is sovereign
  if (person[0].linkedUserId === userId) {
    return { allowed: true, reason: "Subject sovereignty" };
  }

  // 2. Home tree steward
  if (person[0].homeTreeId) {
    const membership = await db
      .select()
      .from(treeMemberships)
      .where(
        and(
          eq(treeMemberships.treeId, person[0].homeTreeId),
          eq(treeMemberships.userId, userId),
          inArray(treeMemberships.role, ["founder", "steward"]),
        ),
      );
    if (membership.length > 0) {
      return { allowed: true, reason: "Home tree steward" };
    }
  }

  // 3. Any tree steward where person is in scope
  const stewardScopes = await db
    .select()
    .from(treePersonScope)
    .innerJoin(
      treeMemberships,
      and(
        eq(treeMemberships.treeId, treePersonScope.treeId),
        eq(treeMemberships.userId, userId),
        inArray(treeMemberships.role, ["founder", "steward"]),
      ),
    )
    .where(eq(treePersonScope.personId, personId));

  if (stewardScopes.length > 0) {
    return { allowed: true, reason: "Steward of a tree containing this person" };
  }

  return { allowed: false, reason: "No edit permission" };
}
```

---

## 5. Phase 4: Frontend Changes

### 5.1 Tree Context Provider

The web app needs a global tree context. Most views operate "inside" a tree.

```typescript
// apps/web/src/contexts/TreeContext.tsx
interface TreeContextValue {
  currentTreeId: string | null;
  setCurrentTreeId: (id: string) => void;
  // Convenience: person's other trees
  personTreeMemberships: TreeMembership[];
}
```

### 5.2 Constellation View Changes

**File:** `apps/web/src/components/tree/treeLayout.ts`

The layout algorithm currently receives people and relationships from a single tree. After migration, it receives the same data (scoped by the tree's scope), so the **layout algorithm itself requires minimal changes**. The change is in how data is fetched and passed to it.

**Changes needed:**
1. The data-fetching layer (likely a React hook or server action) switches from `WHERE tree_id = ?` to the scope-joined query.
2. In-law contextual nodes: add a new node type `"external"` for people not in the tree's scope but related to someone who is. These render with a faded style and are not editable.

```typescript
// In the data-fetching hook:
interface TreeViewData {
  people: Person[];           // People in this tree's scope
  relationships: Relationship[]; // Relationships between scoped people
  contextualPeople?: Person[];   // Optional: in-law parents/siblings
  contextualRelationships?: Relationship[]; // Their relationships
}
```

### 5.3 In-Law Toggle

A UI toggle on spouse nodes that are from outside the tree:

```
[Karsen ♡ Ethan]
    └─ 🔽 Show Karsen's family
```

Clicking fetches Karsen's parents and siblings from the global graph (regardless of tree scope), renders them as contextual/faded nodes.

### 5.4 Person Card: Multi-Tree Indicator

When viewing a person's detail card, show which trees they appear in:

```
Ethan Ward
  📍 Ward Family Tree (home)
  📍 Karsen's Family Tree
  📍 Ward Extended Reunion Tree
```

Each is a link that switches tree context.

### 5.5 Tree Picker (Atrium)

Already specified in the SPEC. Now it becomes more important because cross-tree navigation is a primary flow. Ensure the tree picker:
- Shows all trees the current user has membership in
- Shows person count and recent activity for each
- Allows creating a new tree

### 5.6 Person Search (Cross-Tree)

When adding a person to a tree, offer search across the global graph:

```
Add Person to Ward Family Tree
┌─────────────────────────────────────┐
│ 🔍 Search: "Karsen"                │
│                                     │
│ Found in other trees:               │
│  • Karsen Ward — Karsen's Family    │
│    [Add to this tree's scope]       │
│                                     │
│ Or create new:                      │
│  [Create "Karsen" as a new person]  │
└─────────────────────────────────────┘
```

This prevents accidental duplicates and encourages linking.

---

## 6. Phase 5: Person Linking and Deduplication

### 6.1 Duplicate Detection

Run periodically (background job) and on-demand when a steward creates a person.

**Signals (ranked by strength):**
1. **Linked account email match** — two person records have the same `linked_user_id`. This should never happen in the new model (person is global), but catches pre-migration duplicates.
2. **Name + birth date match** — high confidence if both match.
3. **Name + relationship graph overlap** — if Person A in Tree 1 has a spouse named X and Person B in Tree 2 has a spouse named X, and A.name ≈ B.name, likely duplicate.
4. **Name similarity alone** — low confidence; suggest but don't push.

### 6.2 Merge Flow

**UI Flow:**
1. Steward sees suggestion: "Karsen Ward in Ward Family Tree may be the same person as Karsen Ward in Karsen's Family Tree."
2. Steward clicks "Request Merge."
3. If the other tree is different: the other tree's steward receives a notification and must approve.
4. If same steward manages both: immediate approval option.
5. On approval: merge dialog shows side-by-side comparison of the two records. Steward picks the surviving values for each field.

**Backend Flow:**
```typescript
async function mergePersonRecords(
  survivorId: string,
  mergedAwayId: string,
  fieldResolutions: Record<string, "survivor" | "merged">,
) {
  await db.transaction(async (tx) => {
    // 1. Update survivor record with chosen field values
    const survivor = await tx.select().from(people).where(eq(people.id, survivorId));
    const merged = await tx.select().from(people).where(eq(people.id, mergedAwayId));

    const updates: Partial<Person> = {};
    for (const [field, choice] of Object.entries(fieldResolutions)) {
      updates[field] = choice === "survivor" ? survivor[0][field] : merged[0][field];
    }
    await tx.update(people).set(updates).where(eq(people.id, survivorId));

    // 2. Reassign TreePersonScope rows
    await tx
      .update(treePersonScope)
      .set({ personId: survivorId })
      .where(eq(treePersonScope.personId, mergedAwayId));
    // Handle conflicts (both IDs in same tree) — delete the merged-away one
    // (The survivor row already exists)

    // 3. Reassign Relationships
    await tx
      .update(relationships)
      .set({ fromPersonId: survivorId })
      .where(eq(relationships.fromPersonId, mergedAwayId));
    await tx
      .update(relationships)
      .set({ toPersonId: survivorId })
      .where(eq(relationships.toPersonId, mergedAwayId));
    // Deduplicate relationships that now point to the same pair

    // 4. Reassign MemoryPersonTags
    await tx
      .update(memoryPersonTags)
      .set({ personId: survivorId })
      .where(eq(memoryPersonTags.personId, mergedAwayId));

    // 5. Reassign Memories (primary_person_id)
    await tx
      .update(memories)
      .set({ primaryPersonId: survivorId })
      .where(eq(memories.primaryPersonId, mergedAwayId));

    // 6. Log the merge for audit
    await tx.insert(auditLog).values({
      action: "person_merge",
      survivorId,
      mergedAwayId,
      fieldResolutions: JSON.stringify(fieldResolutions),
      performedByUserId: currentUser.id,
    });

    // 7. Delete the merged-away person record
    await tx.delete(people).where(eq(people.id, mergedAwayId));
  });
}
```

### 6.3 Audit Table

```typescript
export const personMergeAudit = pgTable("person_merge_audit", {
  id: uuid("id").defaultRandom().primaryKey(),
  survivorPersonId: uuid("survivor_person_id").notNull(),
  mergedAwayPersonId: uuid("merged_away_person_id").notNull(),
  fieldResolutions: jsonb("field_resolutions"),
  performedByUserId: text("performed_by_user_id")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
```

---

## 7. Phase 6: Storage Attribution and Billing

### 7.1 Storage Tracking

Every `media` record has a `contributing_tree_id`. To calculate a tree's storage usage:

```sql
SELECT
  m.contributing_tree_id AS tree_id,
  SUM(m.size_bytes) AS total_bytes,
  COUNT(*) AS file_count
FROM media m
WHERE m.contributing_tree_id = $1
GROUP BY m.contributing_tree_id;
```

### 7.2 Scope Count Tracking

```sql
SELECT COUNT(*) AS people_in_scope
FROM tree_person_scope
WHERE tree_id = $1;
```

### 7.3 Contributor Seat Count

```sql
SELECT COUNT(*) AS contributor_seats
FROM tree_memberships
WHERE tree_id = $1
AND role IN ('founder', 'steward', 'contributor');
```

### 7.4 Tier Enforcement

Create a middleware/utility that checks usage against tier limits:

```typescript
interface TierLimits {
  storageBytesMax: number;
  peopleScopeMax: number;       // -1 for unlimited
  contributorSeatsMax: number;  // -1 for unlimited
}

const TIERS: Record<string, TierLimits> = {
  seedling: {
    storageBytesMax: 1_073_741_824, // 1 GB
    peopleScopeMax: 25,
    contributorSeatsMax: 2,
  },
  hearth: {
    storageBytesMax: 53_687_091_200, // 50 GB
    peopleScopeMax: 200,
    contributorSeatsMax: 15,
  },
  archive: {
    storageBytesMax: 536_870_912_000, // 500 GB
    peopleScopeMax: -1,
    contributorSeatsMax: -1,
  },
};

export async function checkTreeCanAdd(
  db: DB,
  treeId: string,
  resource: "person" | "media" | "contributor",
  additionalBytes?: number,
): Promise<{ allowed: boolean; reason?: string }> {
  const tree = await getTree(db, treeId);
  const limits = TIERS[tree.tier];

  switch (resource) {
    case "person": {
      const count = await getScopeCount(db, treeId);
      if (limits.peopleScopeMax !== -1 && count >= limits.peopleScopeMax) {
        return { allowed: false, reason: `People limit reached (${limits.peopleScopeMax})` };
      }
      return { allowed: true };
    }
    case "media": {
      const usage = await getStorageUsage(db, treeId);
      if (usage + (additionalBytes ?? 0) > limits.storageBytesMax) {
        return { allowed: false, reason: "Storage limit reached" };
      }
      return { allowed: true };
    }
    case "contributor": {
      const seats = await getContributorCount(db, treeId);
      if (limits.contributorSeatsMax !== -1 && seats >= limits.contributorSeatsMax) {
        return { allowed: false, reason: `Contributor seat limit reached (${limits.contributorSeatsMax})` };
      }
      return { allowed: true };
    }
  }
}
```

### 7.5 Subscription Table Addition

Add `tier` and `subscription_status` columns to the `trees` table:

```typescript
tier: varchar("tier", { length: 32 }).default("seedling").notNull(),
subscriptionStatus: varchar("subscription_status", { length: 32 })
  .default("active")
  .notNull(),
subscriptionExpiresAt: timestamp("subscription_expires_at", { withTimezone: true }),
```

---

## 8. Phase 7: Testing Strategy

### 8.1 Unit Tests

**Permission engine tests** (highest priority):

```typescript
// packages/database/src/permissions/__tests__/resolve-memory.test.ts
describe("resolveMemoryVisibility", () => {
  it("returns hidden when subject has hidden the memory globally");
  it("returns tree override when explicit row exists");
  it("respects unlock_date on time-locked memories");
  it("falls back to person scope visibility default");
  it("falls back to tree-level default when no scope row exists");
  it("most restrictive wins across all levels");
});

describe("canEditPerson", () => {
  it("allows subject to edit their own record");
  it("allows home tree steward to edit");
  it("allows any tree steward where person is in scope");
  it("denies contributor role");
  it("denies viewer role");
  it("denies user with no relationship to person");
});
```

**Query helper tests:**

```typescript
describe("getTreePeople", () => {
  it("returns only people in the tree's scope");
  it("applies display name override");
  it("does not return people removed from scope");
});

describe("getTreeRelationships", () => {
  it("returns relationships where both people are in scope");
  it("excludes relationships hidden via visibility table");
  it("includes relationships with no visibility row (default visible)");
});
```

### 8.2 Integration Tests

```typescript
describe("Cross-tree scenarios", () => {
  it("person created in Tree A and added to Tree B scope is visible in both");
  it("memory tagged with person visible in both trees");
  it("memory hidden in Tree B via visibility override is not visible in Tree B");
  it("removing person from Tree A scope does not delete the person");
  it("deleting person from last remaining tree scope deletes the person");
  it("merge resolves duplicate person records correctly");
  it("relationship between two global people is created once, visible in relevant trees");
});
```

### 8.3 Layout Tests

The existing layout test suite (`treeLayout.test.ts`, 19 tests) should continue to pass with no changes, since the layout algorithm receives pre-scoped data. Add one test:

```typescript
describe("external/contextual nodes", () => {
  it("positions contextual (in-law) nodes with reduced spacing and faded style flag");
});
```

---

## 9. Phase 8: Data Migration Script

### 9.1 Overview

A one-time migration script that transforms existing tree-scoped data into global data with scope entries.

**File:** `packages/database/src/migrations/cross-tree-migration.ts`

### 9.2 Script Steps

```typescript
export async function migrateToCrossTreeModel(db: DB) {
  await db.transaction(async (tx) => {
    console.log("Step 1: Create tree_person_scope rows from existing people");
    await tx.execute(sql`
      INSERT INTO tree_person_scope (tree_id, person_id, added_at)
      SELECT tree_id, id, created_at
      FROM people
      WHERE tree_id IS NOT NULL
      ON CONFLICT DO NOTHING
    `);

    console.log("Step 2: Set home_tree_id from existing tree_id");
    await tx.execute(sql`
      UPDATE people
      SET home_tree_id = tree_id
      WHERE tree_id IS NOT NULL AND home_tree_id IS NULL
    `);

    console.log("Step 3: Set contributing_tree_id on memories");
    await tx.execute(sql`
      UPDATE memories
      SET contributing_tree_id = tree_id
      WHERE tree_id IS NOT NULL AND contributing_tree_id IS NULL
    `);

    console.log("Step 4: Set contributing_tree_id on media");
    await tx.execute(sql`
      UPDATE media
      SET contributing_tree_id = tree_id
      WHERE tree_id IS NOT NULL AND contributing_tree_id IS NULL
    `);

    console.log("Step 5: Set created_in_tree_id on relationships");
    await tx.execute(sql`
      UPDATE relationships
      SET created_in_tree_id = tree_id
      WHERE tree_id IS NOT NULL AND created_in_tree_id IS NULL
    `);

    console.log("Step 6: Create MemoryPersonTag rows from primary_person_id");
    await tx.execute(sql`
      INSERT INTO memory_person_tags (memory_id, person_id)
      SELECT id, primary_person_id
      FROM memories
      ON CONFLICT DO NOTHING
    `);

    console.log("Step 7: Migrate cross_tree_person_links to merged person records");
    // For each cross_tree_person_link:
    //   - If person_a and person_b have the same name/birth date,
    //     they're likely the same person. Mark for manual review.
    //   - Generate a merge report rather than auto-merging.
    const links = await tx.select().from(crossTreePersonLinks);
    if (links.length > 0) {
      console.log(`Found ${links.length} cross-tree person links. Generating merge report...`);
      // Write report to stdout or a migration_report table
      for (const link of links) {
        const personA = await tx.select().from(people).where(eq(people.id, link.personAId));
        const personB = await tx.select().from(people).where(eq(people.id, link.personBId));
        console.log(
          `MERGE CANDIDATE: "${personA[0]?.displayName}" (${link.personAId}) ↔ ` +
          `"${personB[0]?.displayName}" (${link.personBId})`,
        );
      }
    }

    console.log("Step 8: Verify integrity");
    const orphanedPeople = await tx.execute(sql`
      SELECT p.id, p.display_name
      FROM people p
      LEFT JOIN tree_person_scope tps ON tps.person_id = p.id
      WHERE tps.person_id IS NULL
    `);
    if (orphanedPeople.rows.length > 0) {
      console.warn(`WARNING: ${orphanedPeople.rows.length} people have no tree scope.`);
    }

    console.log("Migration complete. Review merge candidates above.");
    console.log("After verification, drop tree_id columns and old tables in a follow-up migration.");
  });
}
```

### 9.3 Post-Migration Cleanup

After verifying the migration:

```sql
-- Drop old columns (run as a separate migration AFTER verification)
ALTER TABLE people DROP COLUMN tree_id;
ALTER TABLE relationships DROP COLUMN tree_id;
ALTER TABLE memories DROP COLUMN tree_id;
ALTER TABLE media DROP COLUMN tree_id;

-- Drop old tables
DROP TABLE cross_tree_person_links;
DROP TABLE tree_connections;

-- Update unique constraints
ALTER TABLE relationships
  DROP CONSTRAINT IF EXISTS relationships_tree_type_from_to_unique,
  ADD CONSTRAINT relationships_type_normalized_unique
    UNIQUE (type, normalized_person_a_id, normalized_person_b_id);
```

---

## 10. Appendix: Entity Relationship Diagram

```
┌──────────────┐       ┌──────────────────────┐       ┌──────────────┐
│    users     │       │   tree_memberships   │       │    trees     │
│              │◄──────│ user_id   tree_id    │──────►│              │
│  id          │       │ role                 │       │  id          │
│  name        │       └──────────────────────┘       │  name        │
│  email       │                                      │  tier        │
└──────┬───────┘                                      │  sub_status  │
       │ linked_user_id                               └──────┬───────┘
       │                                                     │
       ▼                                                     │
┌──────────────┐       ┌──────────────────────┐              │
│    people    │◄──────│  tree_person_scope   │──────────────┘
│              │       │                      │
│  id          │       │ tree_id              │
│  display_name│       │ person_id            │
│  home_tree_id│──────►│ display_name_override│
│  birth_date  │       │ visibility_default   │
│  ...         │       └──────────────────────┘
└──────┬───────┘
       │
       │ from_person_id / to_person_id
       ▼
┌──────────────────┐   ┌────────────────────────────┐
│  relationships   │◄──│ tree_relationship_visibility│
│                  │   │                            │
│  id              │   │ tree_id                    │
│  type            │   │ relationship_id            │
│  from_person_id  │   │ is_visible                 │
│  to_person_id    │   │ notes                      │
│  created_in_tree │   └────────────────────────────┘
└──────────────────┘

┌──────────────────┐   ┌──────────────────────┐   ┌───────────────────────┐
│    memories      │◄──│  memory_person_tags  │   │ memory_tree_visibility│
│                  │   │                      │   │                       │
│  id              │   │ memory_id            │   │ memory_id             │
│  primary_person  │   │ person_id            │   │ tree_id               │
│  contributing_   │   └──────────────────────┘   │ visibility_override   │
│    tree_id       │◄─────────────────────────────│ unlock_date           │
│  contributor_    │                              └───────────────────────┘
│    user_id       │
│  ...             │
└──────────────────┘
```

### Key Relationships

- **Person ↔ Tree**: Many-to-many via `tree_person_scope`
- **Relationship ↔ Tree**: Many-to-many via `tree_relationship_visibility` (visibility control only)
- **Memory ↔ Person**: Many-to-many via `memory_person_tags`
- **Memory ↔ Tree**: Many-to-many via `memory_tree_visibility` (visibility control only)
- **Memory → Tree**: One-to-one via `contributing_tree_id` (billing attribution)
- **Person → Tree**: One-to-one via `home_tree_id` (stewardship fallback)

---

## Checklist Summary

For each session, reference this checklist to track progress:

- [ ] **Schema: New tables** — `tree_person_scope`, `tree_relationship_visibility`, `memory_person_tags`, `memory_tree_visibility`, `person_merge_audit`
- [ ] **Schema: Altered tables** — `people` (+`home_tree_id`), `relationships` (+`created_in_tree_id`), `memories` (rename `tree_id`→`contributing_tree_id`), `media` (rename `tree_id`→`contributing_tree_id`), `trees` (+`tier`, +`subscription_status`, +`subscription_expires_at`)
- [ ] **Schema: Removed tables** — `tree_connections`, `cross_tree_person_links`
- [ ] **Schema: Relations** — New Drizzle relation definitions for all new tables
- [ ] **Schema: Unique constraints** — Relationship uniqueness updated to global
- [ ] **API: Query migration** — All `WHERE tree_id = ?` queries on people/relationships/memories migrated to scope joins
- [ ] **API: New endpoints** — Scope management, person linking, merge, visibility
- [ ] **API: Person creation** — Creates global record + scope entry
- [ ] **API: Person removal** — Removes from scope; only deletes if orphaned
- [ ] **API: Relationship creation** — Checks for existing global relationship
- [ ] **Permissions: Memory visibility** — Four-level resolution engine
- [ ] **Permissions: Person edit** — Subject > home steward > any steward
- [ ] **Frontend: Tree context** — Global tree context provider
- [ ] **Frontend: Data fetching** — Scope-based queries
- [ ] **Frontend: In-law toggle** — Contextual external node rendering
- [ ] **Frontend: Multi-tree indicator** — Person card shows all trees
- [ ] **Frontend: Person search** — Cross-tree search when adding people
- [ ] **Linking: Duplicate detection** — Background job + on-demand check
- [ ] **Linking: Merge flow** — UI + backend for steward-approved merge
- [ ] **Billing: Storage attribution** — contributing_tree_id tracking
- [ ] **Billing: Tier enforcement** — Middleware for scope/storage/seat limits
- [ ] **Billing: Subscription columns** — tier, status, expiry on trees table
- [ ] **Testing: Permission unit tests** — Memory visibility, person edit
- [ ] **Testing: Query helper tests** — Scoped people, relationships, memories
- [ ] **Testing: Integration tests** — Cross-tree scenarios
- [ ] **Migration: Data script** — One-time migration of existing data
- [ ] **Migration: Cleanup** — Drop old columns and tables
