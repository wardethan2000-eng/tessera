# Feature Gap Implementation Plan

> Created: 2026-04-28
>
> Purpose: turn the current product review into implementation-ready product
> plans. This document complements `PRODUCT-ROADMAP.md`; the roadmap owns phase
> order and product scope, while this plan describes how to build the next major
> capability gaps.

## Guiding Principles

These plans should preserve Tessera's posture as a private family memory
archive, not push it toward a generic media manager or social app.

- Capture should be lighter than organization.
- Unfinished archives should still feel alive.
- Family members who never use a complex app should still be able to contribute.
- Visibility, subject sovereignty, export, and portability are product
  guarantees, not secondary settings.
- AI-assisted features should suggest, sort, and summarize, but the family
  should remain the final editor.

## Recommended Build Order

1. Batch import and curation workbench.
2. Broader linked media and connector model.
3. Guided prompt campaigns and prompt library.
4. Curated mini-archive exports.
5. Mobile-first capture surface.
6. Place journeys and discovery search.
7. Ambient TV, frame, and kiosk modes.
8. Hosting, BYO-storage, and migration productization.

This order focuses first on reducing setup friction, then on gathering more
memories, then on making the archive more useful in family moments.

## 1. Batch Import and Curation Workbench

### Product Goal

A steward should be able to drop a folder or ZIP of family material into Tessera,
walk away, and return to an organized review queue. The app should not require a
perfect person/date/place decision for every item before the archive becomes
useful.

### Current Foundation

- GEDCOM import exists for people and relationships.
- Memory upload, multi-file media attachments, Drive links, and voice recording
  exist in the memory composer.
- The curation page already has queues for missing date, place, and people.
- Person-page editorial ordering and featured memories already exist.

### User Experience

Add an "Import a collection" flow for founders and stewards:

1. User drags in a folder or ZIP, or chooses many files.
2. Tessera shows a preflight summary: file count, estimated storage, detected
   media types, and any unsupported files.
3. User chooses an import destination:
   - attach all to one person,
   - leave unassigned,
   - infer people later,
   - create as a named collection such as "Shoebox scan 2026".
4. User starts import and can leave the page.
5. Imported items appear in the curation workbench under "Needs person",
   "Needs date", "Needs place", "Possible duplicates", and "Low confidence".

The curation workbench should support:

- bulk select and bulk assign person/date/place,
- quick next-card keyboard flow,
- thumbnail grid and list modes,
- suggested person/date/place chips,
- "skip for now" that persists as a deferred state,
- duplicate/near-duplicate review,
- source collection filtering,
- progress by collection and by person,
- direct jump from a person page to unfinished memories for that person.

### Data Model

Add import batch tables:

- `import_batches`
  - `id`, `tree_id`, `created_by_user_id`
  - `source_kind`: `folder`, `zip`, `multi_file_upload`, `connector`
  - `label`
  - `status`: `queued`, `processing`, `needs_review`, `completed`, `failed`
  - `total_items`, `processed_items`, `failed_items`
  - `created_at`, `updated_at`

- `import_batch_items`
  - `id`, `batch_id`, `tree_id`
  - `memory_id`, nullable until memory creation succeeds
  - `media_id`, nullable for unsupported or failed items
  - `original_filename`, `relative_path`
  - `detected_mime_type`, `size_bytes`
  - `captured_at`, nullable
  - `metadata_json`
  - `status`: `queued`, `imported`, `duplicate_candidate`, `unsupported`,
    `failed`, `skipped`
  - `review_state`: `needs_people`, `needs_date`, `needs_place`,
    `needs_duplicate_review`, `done`

Add optional memory fields if they do not already exist:

- `source_batch_id`
- `source_filename`
- `capture_confidence_json`

Add indexes for `tree_id`, `batch_id`, `review_state`, and `status`.

### API

Add endpoints:

- `POST /api/trees/:treeId/import-batches`
  - creates a batch and returns upload instructions.
- `POST /api/trees/:treeId/import-batches/:batchId/items/presign`
  - presigns one or many media uploads.
- `POST /api/trees/:treeId/import-batches/:batchId/complete`
  - marks client uploads complete and starts processing.
- `GET /api/trees/:treeId/import-batches`
  - lists batches and progress.
- `GET /api/trees/:treeId/import-batches/:batchId`
  - returns item-level review state.
- `PATCH /api/trees/:treeId/import-batches/:batchId/items`
  - bulk review actions.
- `GET /api/trees/:treeId/curation/queue?batchId=...`
  - filters existing curation queue by source batch.

### Processing

Use a background worker so large imports do not block a request.

Processing steps:

1. Validate file type and size.
2. Store original media in MinIO.
3. Extract metadata:
   - image EXIF date, dimensions, camera model,
   - video duration, dimensions, creation date when available,
   - audio duration and MIME type,
   - document MIME type and page count when practical.
4. Compute checksum and perceptual hash for images.
5. Find exact duplicates by checksum.
6. Find near duplicates by perceptual hash.
7. Create a memory draft for valid items.
8. Assign review states based on missing metadata.

Start with server-side processing for uploaded objects. Add ZIP extraction only
after multi-file upload works, because ZIP extraction adds memory, timeout, and
security risks.

### UI Implementation

Add:

- `apps/web/src/app/trees/[treeId]/import/page.tsx`
- import entry points from settings, Atrium empty states, and curation.
- curation workbench enhancements in `apps/web/src/app/trees/[treeId]/curation/page.tsx`
- reusable `CurationCard`, `BulkActionBar`, `DuplicateReviewPanel`, and
  `ImportBatchProgress` components.

### Rollout

Milestone 1:

- multi-file import without ZIP,
- import batch records,
- basic metadata extraction,
- curation queue integration.

Milestone 2:

- ZIP import,
- duplicate grouping,
- bulk curation actions.

Milestone 3:

- person/date/place suggestions,
- collection-level progress,
- resumable import UX.

### Risks

- Large uploads can fail or leave partial state. Store item-level status and
  make retry idempotent.
- ZIP files can contain dangerous paths or huge decompressed payloads. Enforce
  file count, total uncompressed size, MIME validation, and path sanitization.
- Automatic metadata can be wrong. Mark all inferred values with confidence and
  make family review simple.

## 2. Linked Media and Connector Model

### Product Goal

Families should be able to start from media that already lives elsewhere without
needing to reupload everything. Tessera should clearly distinguish referenced
media from preserved media and offer preservation later.

### Current Foundation

The memory wizard supports uploads and a Drive link mode. The database currently
models linked media around a narrow provider enum.

### User Experience

The memory composer should expose "Add from" choices:

- upload file,
- paste link,
- Google Drive picker,
- Google Photos shared album,
- Dropbox link,
- iCloud shared link,
- YouTube/Vimeo,
- generic URL.

For every linked item, show:

- provider,
- whether Tessera has a durable copy,
- last checked status,
- open-original action,
- preserve-copy action when allowed,
- warning when the original link may expire or require permissions.

Do not make the user understand storage internals. Use language such as
"Referenced from Google Drive" and "Preserved in Tessera".

### Data Model

Replace or expand provider modeling:

- `linked_media_provider`: add `generic_url`, `google_photos`, `dropbox`,
  `icloud`, `youtube`, `vimeo`, `google_drive`.
- `memory_media` should support:
  - `linked_media_provider`
  - `linked_media_open_url`
  - `linked_media_preview_url`
  - `linked_media_label`
  - `linked_media_status`: `unchecked`, `available`, `permission_needed`,
    `unavailable`, `preserved`
  - `linked_media_metadata_json`
  - `preserved_media_id`, nullable
  - `last_checked_at`

If provider-specific credentials are added, store them per user, not per tree:

- `external_connections`
  - `id`, `user_id`, `provider`
  - encrypted access token fields
  - scopes
  - status
  - `created_at`, `updated_at`

### API

Add:

- `POST /api/trees/:treeId/linked-media/preview`
  - accepts URL, returns provider, normalized URL, preview metadata.
- `POST /api/trees/:treeId/linked-media/preserve`
  - copies a remote asset into Tessera storage when possible.
- `GET /api/me/external-connections`
- `POST /api/me/external-connections/:provider/start`
- `DELETE /api/me/external-connections/:id`

The first version can support link parsing without OAuth. OAuth pickers can
follow once the generic link model is stable.

### UI Implementation

Refactor `AddMemoryWizard` so attachment source is provider-agnostic:

- `AttachmentSourcePicker`
- `LinkedMediaPreview`
- `PreservationBadge`
- `ExternalConnectionPanel`

Memory detail pages should show linked media status and a "Preserve a copy"
action for stewards.

### Rollout

Milestone 1:

- generic URL model,
- provider detection,
- link preview,
- Drive support migrated into generic linked media.

Milestone 2:

- Dropbox, YouTube, Vimeo, iCloud shared links,
- linked media status checks.

Milestone 3:

- Google Drive picker,
- Google Photos shared album import,
- preserve-copy workflow.

### Risks

- Remote links disappear. Make status visible and encourage preservation.
- OAuth token storage raises security expectations. Encrypt tokens and scope
  permissions narrowly.
- Some providers disallow direct media fetches. Treat preview and open-original
  as valid linked states even when preservation is not available.

## 3. Guided Prompt Campaigns and Prompt Library

### Product Goal

Prompting should become a primary capture loop: a steward should be able to
start a thoughtful campaign in minutes, send it to relatives who do not use the
full app, and watch replies become organized memories.

### Current Foundation

Prompt campaign tables, campaign scheduling, email delivery, prompt reply links,
and elder capture tokens exist. The UI currently creates a campaign from a
manual list of questions.

### User Experience

Add a guided campaign builder:

1. Choose campaign type:
   - one relative over time,
   - memories about one person,
   - identify people in photos,
   - reunion/funeral/anniversary collection,
   - place-based memory drive,
   - childhood/work/service/holiday theme.
2. Choose subject and recipients.
3. Choose cadence and start date.
4. Choose from curated prompt sequences.
5. Preview first three messages.
6. Start campaign.

For active campaigns, show:

- next question,
- recipients,
- delivery status,
- reply count,
- unanswered recipients,
- recent replies,
- pause/resume,
- add follow-up questions,
- send a gentle reminder.

### Prompt Library

Add curated prompt library data:

- `prompt_library_questions`
  - `id`
  - `theme`: `warmup`, `childhood`, `family_home`, `work`, `service`,
    `courtship`, `holidays`, `food`, `migration`, `legacy`, `grief_safe`
  - `tier`: `warm_up`, `middle`, `deep`, `legacy`
  - `question_text`
  - `sensitivity`: `ordinary`, `careful`, `grief_safe`
  - `recommended_position`
  - `follow_up_tags`

- `prompt_campaign_templates`
  - `id`, `name`, `description`, `theme`, `default_cadence_days`

- `prompt_campaign_template_questions`
  - `template_id`, `library_question_id`, `position`

Seed with a small, hand-written library first. Do not generate prompts at
runtime until the product voice is stable.

### API

Add:

- `GET /api/prompt-library`
- `GET /api/prompt-campaign-templates`
- `POST /api/trees/:treeId/prompt-campaigns/from-template`
- `GET /api/trees/:treeId/prompt-campaigns/:id/activity`
- `POST /api/trees/:treeId/prompt-campaigns/:id/reminders`
- `POST /api/trees/:treeId/prompts/:promptId/follow-ups`

Extend campaign recipient records to track:

- last sent,
- last opened when available,
- replied count,
- reminder count,
- opted out or bounced status.

### Reply Flow

The lightweight reply page should remain voice-first. Improvements:

- support photo/document clarification requests,
- show the image being identified when applicable,
- allow "I do not know" and "ask someone else",
- save drafts across sessions,
- show transcription status after voice reply,
- let a recipient answer multiple pending prompts from the elder inbox.

### Rollout

Milestone 1:

- prompt library tables and seed data,
- template-based campaign creation,
- improved campaign status dashboard.

Milestone 2:

- reminders,
- recipient-level delivery/reply status,
- photo clarification campaigns.

Milestone 3:

- rule-based follow-up suggestions,
- AI-assisted follow-up drafts behind steward approval.

### Risks

- Prompting can feel noisy. Keep cadence explicit, reminders gentle, and opt-out
  respected.
- Sensitive prompts can land badly. Mark deep or grief-sensitive questions and
  make warm-up sequences the default.
- Email deliverability matters. Track bounce/failure states and avoid repeated
  sends to failing addresses.

## 4. Curated Mini-Archive Exports

### Product Goal

Families should be able to produce a meaningful slice of the archive for a
memorial, reunion, birthday, branch, couple, person, place, or event without
exporting the entire tree.

### Current Foundation

Full-tree ZIP export exists with data JSON, media files, and an offline HTML
viewer.

### User Experience

Add an "Export a collection" builder:

1. Choose scope:
   - person,
   - couple,
   - branch,
   - event,
   - place,
   - theme,
   - manual selection.
2. Review included people and memories.
3. Reorder sections.
4. Add intro text and optional dedication.
5. Choose output:
   - ZIP with offline HTML,
   - private share link,
   - kiosk package,
   - print-oriented HTML/PDF later.
6. Generate and download or publish.

The builder should start with system-generated drafts but always allow manual
curation.

### Data Model

Add:

- `archive_collections`
  - `id`, `tree_id`, `created_by_user_id`
  - `name`, `description`
  - `scope_kind`: `person`, `couple`, `branch`, `event`, `place`, `theme`,
    `manual`
  - `scope_json`
  - `intro_text`
  - `visibility`
  - `created_at`, `updated_at`

- `archive_collection_items`
  - `collection_id`
  - `item_kind`: `person`, `memory`, `place`, `relationship`
  - `item_id`
  - `sort_order`
  - `section_label`
  - `caption_override`

Extend `archive_exports` with:

- `collection_id`, nullable for full-tree exports
- `output_kind`: `full_zip`, `mini_zip`, `static_html`, `share_link`,
  `kiosk_package`
- `expires_at`, nullable for share links

### API

Add:

- `POST /api/trees/:treeId/collections/draft`
- `GET /api/trees/:treeId/collections`
- `POST /api/trees/:treeId/collections`
- `PATCH /api/trees/:treeId/collections/:collectionId`
- `POST /api/trees/:treeId/collections/:collectionId/export`
- `GET /api/trees/:treeId/exports/:exportId`

Keep the existing full-tree export endpoint for backwards compatibility.

### Export Renderer

Create a shared export renderer that accepts an export manifest:

- tree metadata,
- included people,
- included memories,
- included relationships,
- section order,
- media map,
- theme/output mode.

Use the same renderer for full-tree export, mini-export, kiosk package, and
future print-oriented formats.

### Rollout

Milestone 1:

- person mini-archive ZIP,
- branch mini-archive ZIP,
- manual memory selection,
- shared export renderer.

Milestone 2:

- event/place/theme collections,
- private share links,
- memorial package template.

Milestone 3:

- print-oriented HTML/PDF,
- book or booklet pipeline.

### Risks

- Exports can accidentally include private material. Every export must run
  through the same viewer permission and memory visibility rules as the app.
- Share links need expiry, revocation, and audit records.
- Large media bundles can be slow. Store export jobs and stream completed
  artifacts rather than generating everything synchronously.

## 5. Mobile-First Capture Surface

### Product Goal

Contribution should be easy from a phone in the moment: record a voice note,
share a photo, or answer a prompt without navigating the full archive.

### Current Foundation

The elder capture PWA and prompt reply pages already prove the low-friction
capture model.

### User Experience

Create a `/capture` route optimized for mobile:

- one-tap voice recording,
- camera/photo picker,
- share target intake for photos, videos, links, text, and audio,
- "save now, enrich later",
- optional person/date/place fields,
- recent people chips,
- draft persistence,
- offline queue when network is unavailable,
- upload progress and retry.

The first screen should be the capture tool, not a dashboard.

### PWA Share Target

Add a web app manifest share target:

- `action`: `/capture/share`
- accepts `title`, `text`, `url`, and files.

Implement:

- `apps/web/src/app/capture/page.tsx`
- `apps/web/src/app/capture/share/page.tsx`
- IndexedDB-backed draft/upload queue.

For iOS limitations, provide "Add to Home Screen" guidance similar to elder
mode and allow regular browser file selection as a fallback.

### API

Reuse media presign and memory creation endpoints where possible. Add a capture
draft endpoint only if offline sync needs server-side state:

- `POST /api/trees/:treeId/capture-drafts`
- `PATCH /api/trees/:treeId/capture-drafts/:id`
- `POST /api/trees/:treeId/capture-drafts/:id/publish`

### Rollout

Milestone 1:

- mobile capture route,
- voice/photo/text capture,
- save as incomplete memory,
- curation queue integration.

Milestone 2:

- PWA share target,
- offline local queue,
- retryable uploads.

Milestone 3:

- family-managed elder setup,
- push notification prompt answering if native wrappers are added.

### Risks

- Mobile uploads fail often. Design for retry and partial progress.
- Share target APIs vary by browser. Build a graceful fallback first.
- Too much metadata on mobile defeats the purpose. Keep enrichment optional.

## 6. Place Journeys

### Product Goal

Places should become a narrative surface, not only metadata. Families should be
able to see where people lived, moved, gathered, worked, worshiped, served, and
were remembered.

### Current Foundation

Places exist in the API and memories can carry place information. The roadmap
mentions a family map view, but the current `/map` route redirects to the tree
view, so the product surface still needs to be built or restored.

### User Experience

Add `/trees/:treeId/places` and a real `/trees/:treeId/map`:

- map with clustered memory/person/place pins,
- list view for accessibility and low-power devices,
- person journey timeline,
- place page for a home/city/cemetery/school/church,
- memories tied to the place,
- people connected to the place,
- "what happened here" narrative section,
- migration path view for one person or branch.

Place pages should support non-coordinate places. Many family places are
"Grandma's house" before they are latitude/longitude.

### Data Model

Extend places if needed:

- `place_kind`: `home`, `city`, `school`, `workplace`, `cemetery`, `church`,
  `military`, `event_venue`, `other`
- `display_label`
- `address_text`
- `lat`, `lng`
- `precision`: `exact`, `approximate`, `city`, `region`, `unknown`
- `time_span_text`
- `notes`

Add relationship tables:

- `person_places`
  - `person_id`, `place_id`, `relationship_kind`, `date_text`, `sort_order`
- `event_places` when event modeling exists.

### API

Add:

- `GET /api/trees/:treeId/map`
- `GET /api/trees/:treeId/places/:placeId`
- `PATCH /api/trees/:treeId/places/:placeId`
- `POST /api/trees/:treeId/people/:personId/places`
- `GET /api/trees/:treeId/people/:personId/journey`

### UI Implementation

Use progressive enhancement:

- static/list place journey first,
- map library second.

Map candidates:

- MapLibre GL for self-hostable maps,
- Leaflet for simpler pin-based maps.

Avoid requiring paid map APIs for self-host installs.

### Rollout

Milestone 1:

- place index,
- place detail page,
- memory/person/place associations.

Milestone 2:

- map view,
- person journey timeline,
- migration paths.

Milestone 3:

- place-based drift,
- place mini-archive export.

### Risks

- Exact addresses can be sensitive. Add place precision and visibility controls.
- Map providers can create external dependencies. Keep a list-first experience
  and choose self-host-friendly maps.

## 7. Discovery Search

### Product Goal

Search should help families rediscover the archive, not just find a string.
Users should be able to ask "show me every voice memory from the 1970s about
Chicago" or "everything Aunt Mary contributed about Dad".

### Current Foundation

The current search overlay searches loaded people and memories client-side. It
is useful for quick navigation but not enough for the whole archive.

### User Experience

Add a full discovery page and keep the quick overlay:

- quick overlay: fast navigation from anywhere,
- discovery page: full search, filters, sorting, saved views.

Filters:

- person,
- contributor,
- memory kind,
- year range,
- place,
- branch,
- has transcript,
- has media,
- needs curation,
- visibility/reach where appropriate for stewards.

Every result should explain why it matched:

- title match,
- transcript match,
- tagged person,
- place,
- date,
- contributor.

### Data Model

Use Postgres full-text search first:

- generated or maintained `search_vector` for memories,
- index person names and alternate names,
- include transcript text, body, title, date text, place labels, and captions.

If search grows beyond Postgres, introduce Meilisearch or Typesense later, but
do not add a second search service until local Postgres search is inadequate.

### API

Add:

- `GET /api/trees/:treeId/search`
  - query, filters, pagination, sort.
- `GET /api/trees/:treeId/search/facets`
  - counts for filters.
- `POST /api/trees/:treeId/saved-searches`
  - optional later.

### UI Implementation

Add:

- `apps/web/src/app/trees/[treeId]/search/page.tsx`
- filter rail or sheet,
- result snippets with highlighted matches,
- link results directly to memory detail pages when possible.

Update `SearchOverlay` to call the API when the loaded in-memory result set is
insufficient or when the user chooses "See all results".

### Rollout

Milestone 1:

- API-backed text search,
- result snippets,
- direct memory routing.

Milestone 2:

- filters and facets,
- transcript-aware ranking,
- contributor/place/year filters.

Milestone 3:

- saved discovery views,
- "least seen" and "recently enriched" discovery rails.

### Risks

- Private memories must not leak through search snippets. Search must apply the
  same visibility and reach rules as memory reads.
- Ranking can feel arbitrary. Start with simple, explainable ordering.

## 8. Visibility and Subject Sovereignty UX

### Product Goal

The graph-native memory model should be understandable to families. A person
should know why a memory appears on their page and living subjects should be
able to hide, correct, or contest memories about themselves.

### Current Foundation

The database and services already include memory person tags, reach rules,
visibility overrides, and suppressions. The main opportunity is product UX.

### User Experience

For each memory detail page, show:

- "Directly about" people,
- "Also mentions" people,
- "Visible because" explanation,
- source tree/context,
- contributor,
- subject controls for living linked subjects.

Subject actions:

- hide from my page,
- request correction,
- add my perspective,
- mark sensitive,
- ask steward to review.

Steward actions:

- review contested memories,
- resolve correction requests,
- change direct/contextual tagging,
- adjust reach rules.

### API

Add or expose:

- `GET /api/trees/:treeId/memories/:memoryId/visibility-explanation`
- `POST /api/trees/:treeId/memories/:memoryId/subject-actions`
- `GET /api/trees/:treeId/subject-review`
- `PATCH /api/trees/:treeId/subject-review/:reviewId`

### Rollout

Milestone 1:

- read-only visibility explanations,
- direct/contextual person labels.

Milestone 2:

- hide-from-my-page and add-perspective subject actions.

Milestone 3:

- correction workflow and steward review queue.

### Risks

- Controls can make a memorial archive feel adversarial. Use calm language and
  prefer reversible actions.
- Subject rights vary by family context. Keep founder/steward override rules
  explicit and auditable.

## 9. Ambient TV, Frame, and Kiosk Modes

### Product Goal

Tessera should live where families gather: televisions, smart frames, memorial
services, reunions, and living rooms.

### Current Foundation

Drift mode, Chromecast controls, and cast receiver files exist. The next step is
to make ambient surfaces productized modes rather than hidden technical
capabilities.

### User Experience

Add ambient modes:

- TV drift: large readable captions, slow pacing, remote-friendly controls.
- Smart frame: always-on quiet rotation with optional date/person captions.
- Kiosk: locked presentation for events with no admin controls.
- Memorial session: curated remembrance mode for one person or event.

Controls:

- choose person/branch/place/event,
- choose pace,
- include/exclude voice,
- include/exclude sensitive or private items,
- show/hide captions,
- QR code for guests to contribute.

### Data Model

Add:

- `ambient_sessions`
  - `id`, `tree_id`, `created_by_user_id`
  - `mode`: `tv`, `frame`, `kiosk`, `memorial`
  - `scope_json`
  - `settings_json`
  - `token_hash`
  - `expires_at`
  - `revoked_at`

### API

Add:

- `POST /api/trees/:treeId/ambient-sessions`
- `GET /api/ambient/:token`
- `POST /api/ambient/:token/ping`
- `DELETE /api/trees/:treeId/ambient-sessions/:sessionId`

Existing cast token work can inform this, but ambient sessions need their own
scope, lifetime, and revocation semantics.

### UI Implementation

Add:

- `/trees/:treeId/ambient`
- `/ambient/:token`
- TV/frame-specific layout components.

The display route should avoid authenticated admin chrome and should be stable
for long-running sessions.

### Rollout

Milestone 1:

- TV drift mode with session token,
- steward setup screen.

Milestone 2:

- kiosk mode,
- QR contribution link,
- memorial session template.

Milestone 3:

- smart frame pacing and overnight dimming,
- device management.

### Risks

- Display tokens can leak private material. Require scoped tokens, expiry,
  revocation, and visibility filtering.
- Long-running browser sessions can degrade. Keep the renderer simple and test
  memory usage.

## 10. Hosting, BYO-Storage, and Migration Productization

### Product Goal

Tessera's promise of permanence should be concrete. Families should understand
where their archive lives, how to export it, and how to migrate between hosted,
self-hosted, and BYO-storage modes.

### Current Foundation

Hosted mode, self-host docs, Docker Compose infrastructure, MinIO storage, and
full-tree export exist.

### User Experience

Add an "Archive ownership" settings section:

- current hosting mode,
- storage backend,
- media usage,
- export status,
- last backup/export,
- migration options,
- preservation health checks.

Modes:

- hosted storage,
- BYO S3-compatible bucket,
- self-hosted MinIO,
- external linked media with optional preservation.

### Data Model

Add:

- `tree_storage_configs`
  - `tree_id`
  - `mode`: `hosted`, `byo_s3`, `self_hosted`, `hybrid`
  - encrypted credential reference
  - bucket/region/endpoint metadata
  - status
  - last_checked_at

- `storage_migration_jobs`
  - `id`, `tree_id`
  - `from_config_id`, `to_config_id`
  - `status`
  - `total_objects`, `copied_objects`, `failed_objects`
  - `started_at`, `completed_at`
  - `error_summary`

### API

Add:

- `GET /api/trees/:treeId/storage`
- `PATCH /api/trees/:treeId/storage`
- `POST /api/trees/:treeId/storage/test`
- `POST /api/trees/:treeId/storage/migrations`
- `GET /api/trees/:treeId/storage/migrations/:jobId`

### Rollout

Milestone 1:

- read-only archive ownership page,
- storage usage and export health.

Milestone 2:

- BYO S3 configuration,
- storage health test,
- new uploads to selected backend.

Milestone 3:

- migration jobs,
- hosted-to-BYO and BYO-to-hosted copy,
- preservation audit.

### Risks

- Storage credentials are sensitive. Encrypt and isolate them.
- Migration jobs are long-running and failure-prone. Make jobs resumable and
  auditable.
- BYO-storage support complicates media URL generation. Centralize storage
  resolution behind one service.

## Minor UI Footnote: Utility Page Visibility

Some important workflows currently live in settings-like or secondary pages.
This is not a major product concern compared with capture, import, curation,
and export. Keep it as a light polish item:

- surface "needs attention" counts in the Atrium,
- give campaigns and curation clear entry points from relevant contexts,
- avoid burying export in settings once mini-archives exist.

Do not over-rotate on this before the underlying workflows are stronger.

## Cross-Cutting Engineering Work

### Permissions

Every new endpoint must apply tree membership, role, reach, and memory
visibility rules. Export, search, ambient display, and curation are especially
sensitive because they aggregate many records at once.

### Background Jobs

The app already uses workers for transcription and campaign scheduling. Extend
that pattern for:

- import processing,
- metadata extraction,
- duplicate detection,
- export generation,
- storage migration.

Long-running work should be idempotent, resumable, and visible in the UI.

### Audit Trail

Add audit records for:

- exports,
- share links,
- ambient sessions,
- subject sovereignty actions,
- storage migration,
- large imports,
- destructive or privacy-affecting curation actions.

### Testing

Prioritize tests around:

- permission filtering in search and exports,
- import retry/idempotency,
- linked media parser behavior,
- campaign scheduler behavior,
- export manifests,
- curation bulk actions,
- storage migration state transitions.

### Documentation

Update:

- `PRODUCT-ROADMAP.md` when phase completion changes,
- self-host docs when storage modes change,
- security docs when OAuth, share links, or ambient tokens are added,
- user-facing help copy for import, export, and elder capture.

## Success Metrics

Use product metrics that reflect preservation, not engagement:

- time from signup to first meaningful Atrium,
- number of memories captured by non-stewards,
- percentage of imported items with at least one person/date/place signal,
- prompt reply rate by recipient type,
- number of successful exports,
- number of archives with a recent backup/export,
- number of memories preserved from external links,
- reduction in unreviewed curation queue age.

Avoid optimizing for daily active use or notification-driven return loops.
