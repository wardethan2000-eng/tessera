# Curated Local Archives Implementation Plan

## Purpose

Curated Local Archives let a family turn a large, living Tessera archive into a
smaller, intentional memory object for a specific person, event, branch, place,
or theme. The source archive remains the durable system of record. The local
archive is a portable, finite, explorable artifact.

Use cases:

- funeral or memorial display,
- graduation table,
- milestone birthday,
- family reunion,
- branch history,
- couple anniversary,
- elder life story,
- recipe or object collection,
- local backup slice for one household.

This feature should strengthen Tessera's permanence promise: families can take a
meaningful part of the archive with them, open it without Tessera running, and
still experience it as an interactive memory space rather than a flat folder of
files.

## Product Positioning

Do not frame this as "export selected rows." Frame it as "make a collection."

The archive is the operating system. A curated local archive is a published
memory object.

The product language should stay close to:

- "Make a collection"
- "Prepare a local archive"
- "Review what will be included"
- "Open without Tessera"
- "For a memorial"
- "For a family gathering"
- "For safekeeping"

Avoid:

- "data dump"
- "content package"
- "filtered export"
- "download asset bundle"

## Local Runtime Decision

### V1 Recommendation: Browser-First Static Archive

The local archive should be a ZIP file containing a static website:

```text
eleanor-90th-birthday/
  index.html
  data/
    manifest.json
  media/
    <stable-media-id>.<ext>
  assets/
    viewer.css
    viewer.js
  README.txt
```

The user unzips it and opens `index.html` in a browser on Windows, macOS, or
Linux. No server, no install, no Electron app, no database.

This should be the default because:

- it is cross-platform,
- it has the lowest support burden,
- it is durable for decades,
- families already understand opening an HTML file,
- it can still be highly interactive,
- it avoids platform signing/notarization work,
- it avoids native app update and malware-warning problems,
- it works from a USB drive, local folder, external disk, or copied directory.

The viewer can be a real application despite running as static files. It can
support search, person pages, memory detail pages, graph navigation, drift mode,
audio/video playback, keyboard navigation, and deep links within the exported
archive.

### Browser Security Constraints

Local browser behavior matters:

- `index.html` loaded via `file://` can run inline JavaScript in modern browsers.
- Fetching `data/manifest.json` from `file://` may be blocked in some browsers.
- Therefore V1 should embed the manifest directly into `index.html` or
  `viewer.js` rather than requiring `fetch()`.
- Media files can be referenced by relative paths like `media/<filename>`.
- Advanced features requiring workers, IndexedDB imports, service workers, or
  local HTTP servers should be deferred.

### Optional V2: Launchable Local Server

For very large archives or richer search, ship optional launch scripts:

```text
open-mac.command
open-windows.bat
open-linux.sh
```

These would start a tiny local HTTP server and open the browser. This improves
compatibility with browser APIs but creates support burden.

Do not make this required for V1.

### Optional V3: Desktop Wrapper

An Electron/Tauri desktop viewer could be considered later if there is strong
evidence users need:

- double-click app launch,
- encrypted local archives,
- huge media catalogs,
- full-text search indexing,
- offline annotations,
- kiosk hardening,
- local archive updates/sync.

This should not be the first implementation. A static browser archive better
matches the permanence and portability promise.

## User Experience

### Entry Points

Add entry points in:

- tree settings: "Local archives",
- person page: "Make a local archive for this person",
- curation workspace: "Make a collection",
- drift chooser: "Prepare a memorial/session package",
- search results: "Add to collection",
- memory detail page: "Add to collection".

### Collection Builder Flow

1. Choose collection type.
2. Tessera drafts an included set.
3. User reviews people, memories, relationships, places, and media.
4. User removes sensitive or irrelevant items.
5. User reorders sections.
6. User adds intro, dedication, section notes, and optional captions.
7. User chooses local viewing mode.
8. Tessera validates permissions and missing media.
9. User generates ZIP.
10. User downloads and opens locally.

### Collection Types

Initial types:

- person,
- couple,
- branch,
- manual memory selection.

Later types:

- event,
- place,
- theme,
- recipe/object set,
- time period,
- prompt campaign result.

### Viewing Modes

Each collection has a default mode, but the local viewer can expose multiple
modes if the package includes enough data.

#### Chapter Mode

Person-centered long-scroll pages.

Best for:

- "A life of Eleanor"
- family branch packet,
- biography-style viewing.

Interactions:

- click memory cards,
- click related people,
- view source/date/place,
- open media gallery,
- read transcript,
- jump to relationship context.

#### Drift Mode

Auto-advancing cinematic sequence.

Best for:

- TV at memorials,
- reunions,
- birthday displays,
- ambient lobby/table screens.

Interactions:

- play/pause,
- next/previous,
- click or press Enter to open current memory detail,
- show/hide captions,
- filter by person or section,
- restart from beginning.

#### Gallery Mode

Grid or wall of photos, documents, and memory cards.

Best for:

- event browsing,
- tablet/laptop on a table,
- family members casually exploring.

Interactions:

- filter by person,
- filter by decade/kind,
- click into memory detail,
- click person chips,
- search.

#### Storybook Mode

Ordered sections with editorial text.

Best for:

- graduation,
- memorial sequence,
- curated life story,
- "from childhood to today."

Interactions:

- next section,
- memory detail expansion,
- related memories,
- person context panels.

#### Kiosk Mode

Constrained, event-safe mode.

Best for:

- public display at a venue,
- funeral home,
- reception table.

Behavior:

- large controls,
- no edit language,
- no private metadata,
- no broken empty states,
- optional auto-return to drift after inactivity,
- optional QR code or note saying who prepared it.

## Interactivity Model

The local archive should be explorable, not just viewable.

### Memory Detail

Clicking a memory opens a detail view with:

- title,
- body/story,
- media carousel,
- audio/video player when applicable,
- transcript,
- date text,
- place label/map text if exported,
- primary person,
- tagged people,
- contributor display name when safe,
- related memories,
- section/caption notes from the collection,
- "why this is here" context.

### Person Context

Clicking a person opens:

- portrait,
- name and life dates,
- essence line,
- included memories,
- relationships included in this collection,
- related places if included,
- drift just for this person.

### Relationship Context

Clicking a relationship should show:

- relationship type,
- people connected,
- memories where both appear,
- branch/family context if included.

### Memory Graph Context

Each memory can expose:

- people in this memory,
- other memories involving the same people,
- memories from the same approximate date,
- memories from the same place,
- previous/next item in curated order.

### Search

V1 search can be client-side over the embedded manifest:

- person names,
- memory titles,
- memory body,
- transcript text,
- place labels,
- dates,
- captions.

For very large archives, search can be simple substring/fuzzy matching. Avoid
requiring a local index server in V1.

### Deep Links

Use hash routes:

```text
index.html#/home
index.html#/people/<personId>
index.html#/memories/<memoryId>
index.html#/drift
index.html#/sections/<sectionId>
```

Hash routing works reliably in static local files and allows browser back/forward
navigation without a server.

## Data Model

### New Tables

#### `archive_collections`

Fields:

- `id`
- `tree_id`
- `created_by_user_id`
- `name`
- `description`
- `scope_kind`: `person`, `couple`, `branch`, `event`, `place`, `theme`,
  `manual`
- `scope_json`
- `intro_text`
- `dedication_text`
- `default_view_mode`: `chapter`, `drift`, `gallery`, `storybook`, `kiosk`
- `visibility`: `private`, `tree_members`, `stewards`
- `created_at`
- `updated_at`

#### `archive_collection_sections`

Fields:

- `id`
- `collection_id`
- `title`
- `body`
- `section_kind`: `intro`, `chapter`, `gallery`, `timeline`, `drift`,
  `people`, `custom`
- `sort_order`
- `settings_json`

#### `archive_collection_items`

Fields:

- `id`
- `collection_id`
- `section_id`
- `item_kind`: `person`, `memory`, `place`, `relationship`
- `item_id`
- `sort_order`
- `caption_override`
- `include_context`: boolean
- `created_at`

#### Extend `archive_exports`

Add:

- `collection_id`
- `output_kind`: `full_zip`, `mini_zip`, `static_html`, `kiosk_package`,
  `share_link`
- `manifest_version`
- `manifest_json`
- `expires_at`
- `error_message`

### Why Store Manifest JSON?

Store the generated manifest used for the export because it gives:

- auditability,
- reproducibility,
- debugging,
- a clear record of what was included,
- future ability to regenerate the same package.

Do not rely on current database state to explain an old export.

## Export Manifest

All export types should be generated from one manifest shape. The renderer should
not query the database directly.

```ts
type ArchiveExportManifest = {
  version: 1;
  exportedAt: string;
  generatedBy: {
    userId: string;
    displayName: string | null;
  };
  tree: {
    id: string;
    name: string;
  };
  collection: {
    id: string | null;
    name: string;
    description: string | null;
    introText: string | null;
    dedicationText: string | null;
    defaultViewMode: "chapter" | "drift" | "gallery" | "storybook" | "kiosk";
    scopeKind: string;
  };
  people: ExportPerson[];
  memories: ExportMemory[];
  relationships: ExportRelationship[];
  places: ExportPlace[];
  sections: ExportSection[];
  media: ExportMedia[];
  permissions: {
    viewerUserId: string;
    generatedFromRole: string;
    visibilityResolvedAt: string;
  };
};
```

### Export Person

```ts
type ExportPerson = {
  id: string;
  displayName: string;
  canonicalDisplayName?: string;
  alsoKnownAs: string[];
  birthDateText: string | null;
  deathDateText: string | null;
  essenceLine: string | null;
  portraitMediaId: string | null;
  relationshipIds: string[];
  memoryIds: string[];
};
```

### Export Memory

```ts
type ExportMemory = {
  id: string;
  primaryPersonId: string;
  title: string;
  kind: "story" | "photo" | "voice" | "document" | "other";
  body: string | null;
  dateOfEventText: string | null;
  placeId: string | null;
  placeLabel: string | null;
  transcriptText: string | null;
  mediaIds: string[];
  taggedPersonIds: string[];
  perspectiveIds: string[];
  relatedMemoryIds: string[];
  contributorName: string | null;
  sectionIds: string[];
  captionOverride: string | null;
};
```

### Export Media

```ts
type ExportMedia = {
  id: string;
  originalObjectKey: string;
  localPath: string;
  mimeType: string;
  sizeBytes: number;
  checksum: string | null;
  role: "portrait" | "memory" | "perspective" | "attachment";
};
```

Use stable local media names based on media IDs, not object-key basenames:

```text
media/0c2e5c7a-....jpg
media/f9a91220-....mp3
```

This avoids filename collisions.

## API Design

### Collection Drafting

`POST /api/trees/:treeId/archive-collections/draft`

Body:

```json
{
  "scopeKind": "person",
  "scope": {
    "personId": "..."
  },
  "defaultViewMode": "chapter"
}
```

Returns a proposed collection:

```json
{
  "name": "Eleanor Martin",
  "people": [],
  "memories": [],
  "relationships": [],
  "sections": [],
  "warnings": []
}
```

### Collection CRUD

- `GET /api/trees/:treeId/archive-collections`
- `POST /api/trees/:treeId/archive-collections`
- `GET /api/trees/:treeId/archive-collections/:collectionId`
- `PATCH /api/trees/:treeId/archive-collections/:collectionId`
- `DELETE /api/trees/:treeId/archive-collections/:collectionId`

### Item Management

- `POST /api/trees/:treeId/archive-collections/:collectionId/items`
- `PATCH /api/trees/:treeId/archive-collections/:collectionId/items/:itemId`
- `DELETE /api/trees/:treeId/archive-collections/:collectionId/items/:itemId`
- `POST /api/trees/:treeId/archive-collections/:collectionId/reorder`

### Preview Manifest

`GET /api/trees/:treeId/archive-collections/:collectionId/manifest-preview`

Returns the manifest without packaging media. Useful for showing exactly what
will be included.

### Export

`POST /api/trees/:treeId/archive-collections/:collectionId/export`

Body:

```json
{
  "outputKind": "mini_zip",
  "includeOriginalMedia": true,
  "viewerMode": "kiosk"
}
```

Returns:

```json
{
  "exportId": "...",
  "status": "queued"
}
```

### Export Status

- `GET /api/trees/:treeId/archive-exports/:exportId`
- `GET /api/trees/:treeId/archive-exports/:exportId/download`

For small V1 exports, synchronous streaming is acceptable. For production, use a
job record and store the ZIP in object storage.

## Permission and Privacy Rules

This is the highest-risk part of the feature.

### Rules

- Every export must run through the same memory visibility logic as normal app
  reads.
- Collection items are requests, not guarantees. If an item is no longer visible
  to the exporting user, exclude it at manifest time.
- Hidden and locked memories must never be exported.
- `family_circle` and `named_circle` must be resolved for the specific exporting
  user.
- Suppressed memories should respect the target surface when exporting a person
  page.
- Relationship visibility rules must be applied.
- Living subject controls should be respected before export.
- Hosted share links need expiry, revocation, and audit logs.
- Local ZIPs cannot be revoked. The UI must say this plainly before download.

### Export Warning Copy

Before download:

> This archive will open without signing in. Anyone with the downloaded files can
> view what is included. Review it before sharing.

For local ZIPs:

> Local archives cannot be revoked after download.

### Audit Trail

Record:

- who generated it,
- when,
- tree ID,
- collection ID,
- output kind,
- number of people,
- number of memories,
- media size,
- resolved permission role,
- manifest version,
- manifest checksum.

## Offline Viewer Architecture

### V1 Build Strategy

Create a small standalone viewer bundle separate from the Next.js app:

```text
apps/api/src/lib/archive-export/
  manifest-builder.ts
  zip-writer.ts
  media-export.ts
  html-renderer.ts
  types.ts

apps/web/src/archive-viewer/
  index.ts
  styles.css
  components-or-dom-modules
```

The viewer should compile to static assets that the API can embed or copy into
the ZIP.

Avoid coupling the offline viewer to:

- Next.js routing,
- Better Auth,
- API calls,
- server components,
- remote media proxy URLs.

### Rendering Approach

Two viable options:

1. Plain TypeScript DOM renderer.
2. Small React static bundle.

Recommendation: start with a small React or Preact static bundle only if the
build pipeline is simple. Otherwise use a plain DOM renderer for reliability.

The current export route already generates inline HTML. V1 can improve that
incrementally by extracting a proper renderer and adding hash routing.

### Required Viewer Features

V1:

- home/intro screen,
- person list,
- person page,
- memory detail view,
- media gallery,
- audio/video playback,
- transcript display,
- related people chips,
- related memory chips,
- search,
- hash routing,
- drift mode,
- keyboard controls.

V1.5:

- section/storybook navigation,
- gallery wall,
- kiosk idle return,
- print stylesheet.

V2:

- local full-text index,
- optional local server,
- encrypted archive unlock,
- annotations that save locally,
- import local annotations back into Tessera.

## Export Package Format

### Minimum ZIP Contents

```text
index.html
README.txt
media/
  <mediaId>.<ext>
```

For maximum `file://` compatibility, embed:

- manifest JSON,
- CSS,
- JS.

### Expanded ZIP Contents

After V1 stabilizes:

```text
index.html
README.txt
data/
  manifest.json
assets/
  viewer.js
  viewer.css
media/
  <mediaId>.<ext>
```

Only switch to external manifest/assets if browser testing confirms reliable
local opening across target browsers.

### README.txt

Include plain instructions:

```text
Open index.html in a browser.

This local archive was prepared from Tessera on April 29, 2026.
It does not require an internet connection.
Anyone with this folder can view its contents.
Keep the media folder beside index.html.
```

## Implementation Phases

### Phase 1: Refactor Existing Full Export

Goal: make the existing export route maintainable without changing product
behavior.

Tasks:

- Extract `ArchiveExportManifest` types.
- Extract full-tree manifest builder.
- Extract ZIP writer.
- Extract offline viewer renderer.
- Replace media filenames with stable media-ID filenames.
- Include transcript text in export data.
- Include all memory media items, not only primary media.
- Add basic tests for manifest shape and media path mapping.

Files likely touched:

- `apps/api/src/routes/export.ts`
- `apps/api/src/lib/archive-export/types.ts`
- `apps/api/src/lib/archive-export/manifest-builder.ts`
- `apps/api/src/lib/archive-export/zip-writer.ts`
- `apps/api/src/lib/archive-export/html-renderer.ts`

### Phase 2: Person Mini-Archive

Goal: ship the first valuable curated archive.

Scope:

- one person,
- their direct memories,
- tagged memories where visible,
- immediate relationships,
- directly related people,
- portraits and memory media,
- chapter mode,
- memory detail pages,
- basic drift mode.

Tasks:

- Add `archive_collections` schema.
- Add `archive_collection_items` schema.
- Add collection draft endpoint for `scopeKind: "person"`.
- Add collection create endpoint.
- Add export endpoint for collection.
- Add simple UI entry from person page.
- Add review screen with included memories and people.
- Generate static ZIP.

Acceptance criteria:

- A steward can create a local archive for one person.
- The ZIP opens offline by double-clicking `index.html`.
- A viewer can click a memory and see body, media, transcript, tagged people,
  and related context.
- A viewer can click a related person and see that person's included context.
- Hidden/unviewable memories are excluded.
- Media filenames do not collide.

### Phase 3: Manual Collection Builder

Goal: support event-shaped collections.

Tasks:

- Add manual add/remove memories.
- Add sections.
- Add drag/reorder.
- Add caption overrides.
- Add intro/dedication text.
- Add default view mode selector.
- Add manifest preview.
- Add warnings for missing media and private visibility.

Acceptance criteria:

- A user can build "Dad's Memorial" from selected memories.
- The local viewer opens into storybook or kiosk mode.
- The collection can be revised and exported again.

### Phase 4: Branch and Couple Archives

Goal: make system-generated drafts more powerful.

Tasks:

- Draft couple collection from two people and shared memories.
- Draft branch collection from descendants/ancestors.
- Include relationship graph subset.
- Include branch drift.
- Add graph/context view in offline viewer.

### Phase 5: Event/Kiosk Polish

Goal: make this reliable for real ceremonies.

Tasks:

- Add kiosk mode.
- Add idle timer returning to drift.
- Add large-screen typography.
- Add QR/info screen.
- Add keyboard and remote-friendly controls.
- Add missing-media preflight.
- Add package size estimator.
- Add export progress UI.

### Phase 6: Share Links and Print

Goal: extend the same manifest system beyond local ZIPs.

Tasks:

- Add private hosted share links with expiry.
- Add revocation.
- Add audit log.
- Add print stylesheet.
- Add PDF generation later.

## Technical Risks

### Permission Leakage

Risk: exported archive includes memories the downloader should not have.

Mitigation:

- generate manifest only after permission filtering,
- test visibility levels,
- test locked memories,
- test relationship visibility,
- store manifest audit record.

### Local Browser Compatibility

Risk: browser blocks local data loading.

Mitigation:

- inline manifest/CSS/JS in V1,
- avoid service workers,
- use hash routing,
- test Chrome, Edge, Safari, Firefox.

### Large Media Packages

Risk: ZIP generation is slow or huge.

Mitigation:

- show size estimate,
- background jobs for larger packages,
- skip/flag missing media,
- later add media quality options.

### Broken Ceremony Package

Risk: user discovers missing files at the event.

Mitigation:

- preflight checklist,
- generated README,
- "test this archive" instruction,
- post-export open locally in browser where possible,
- warnings for unsupported media.

### Linked External Media

Risk: Google Drive or remote URLs do not work offline.

Mitigation:

- distinguish preserved media from linked media,
- warn when an item will not be available offline,
- offer "preserve a copy" before export,
- include link metadata only when media cannot be bundled.

## Testing Plan

### Unit Tests

- manifest builder filters memories by permissions,
- person draft includes correct immediate relationships,
- media path mapping is stable and collision-free,
- hidden/locked memories are excluded,
- missing media creates warning,
- section ordering is preserved.

### Integration Tests

- create person collection,
- export ZIP,
- inspect ZIP entries,
- verify `index.html` contains manifest,
- verify media files exist,
- verify no unviewable memory IDs appear in exported manifest.

### Manual Browser Matrix

Test unzipped archive by opening `index.html` in:

- Chrome on macOS,
- Safari on macOS,
- Edge on Windows,
- Chrome on Windows,
- Firefox on Linux.

Test:

- home loads,
- person navigation,
- memory detail,
- image display,
- audio playback,
- video playback,
- transcript display,
- search,
- drift mode,
- browser back/forward.

## Suggested First Milestone

Build the smallest complete version:

- person mini-archive only,
- static ZIP,
- embedded manifest,
- chapter mode,
- memory detail,
- related people,
- search,
- simple drift,
- permission-safe manifest generation.

This milestone is enough to validate the product idea with real family events
without committing to desktop apps, hosted share links, PDF generation, or a
large collection-builder surface.

