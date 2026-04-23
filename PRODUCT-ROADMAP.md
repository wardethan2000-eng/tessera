# Product Roadmap

> **Reviewed:** 2026-04-21  
> Items marked `[x]` are implemented or substantially complete. Items marked
> with a completion note are partially implemented. Items marked `[ ]` are not
> yet started.

This document is the long-term product reference for Tessera.

It is organized by phases rather than dates. The intent is to preserve product
order, rationale, and scope as the implementation evolves.

The product goal is not "a family archive website." The product goal is a
family memory operating system: a system that helps families gather memories,
curate them into meaningful experiences, preserve them safely, and surface them
where people actually live.

## Product Thesis

Tessera should win on four axes:

1. Setup must be dramatically easier than starting from a blank archive.
2. Memory capture must work for relatives who will never learn a complex app.
3. The viewing experience must feel curated, moving, and revisitable.
4. Families must trust that their archive can outlive any single hosting model.

## What Already Exists

These areas already exist in the repo and should be treated as foundations,
not future ideas:

- Account and tree membership flows
- Constellation-style family graph view
- Atrium landing experience
- Drift mode for passive / cinematic browsing
- Person pages with memories, relationships, prompts, and cross-tree concepts
- Voice upload and transcription pipeline
- Prompt inbox and lightweight prompt reply links
- Family map view
- Offline export of a whole tree
- Cross-tree architecture and memory reach groundwork

## Current Gaps

These are the highest-value gaps relative to the product thesis:

- Setup is still too manual and upload-first.
- There is no real import / connector / linked-media story yet.
- Prompt capture exists, but not yet as a full campaign engine.
- Curation is promising, but still mostly page-and-list based.
- Export exists for full trees, but not yet for curated sub-archives.
- There is no mobile-first capture surface.
- There is no ambient surface for TV, frame, or kiosk experiences.
- Hosted / BYO-storage / self-hosted modes are not yet productized.

## Cross-Tree Guardrails

The repo now has enough cross-tree groundwork that product boundaries need to
be explicit, not implied.

- Account-linked identity is the safest way to unify a living person across
  multiple trees.
- Duplicate people across trees may be suggested automatically, but they should
  not silently collapse without steward review or an already-confirmed account
  link.
- The main canvas should remain tree-shaped and vertical per tree, not a
  horizontally expanding super-graph of every adjacent family.
- Cross-tree overlap should surface as shared identity, shared memories,
  duplicate-resolution flows, and cross-tree navigation rather than automatic
  sideways branch expansion in the canvas.

See `MULTI-TREE-IDENTITY-AND-SCOPE-PLAN.md` for the planning-level rules and
`ACCOUNT-IDENTITY-IMPLEMENTATION-PLAN.md` for the concrete engineering plan.

## Phase Structure

The order below is intentional. Later phases depend on the earlier ones.

## Phase 1: Frictionless Start

Goal: a family should get meaningful value without reorganizing their entire
digital life first.

Why this phase comes first:

- The current product is stronger at preservation and experience than at setup.
- My Family Archive's practical strength is that it can begin from media that
  already exists elsewhere.
- If Tessera remains upload-first, it will feel heavier than it should.

Features to implement:

- [x] Linked media memories (partial — schema supports Google Drive and generic
  external URLs; deep OAuth integrations and Drive Picker not yet built)
  - Allow a memory to reference media that already lives elsewhere.
  - Initial targets can be share links or stable URLs rather than deep OAuth
    integrations.
  - Supported examples: Google Photos shared albums, Drive links, Dropbox links,
    YouTube, Vimeo, iCloud-shared links, and generic external URLs.
  - The UX should distinguish between "referenced media" and "preserved media"
    without making the user think about storage architecture.
  - TODO after Drive-link V1: add Google Drive Picker so users can choose Drive
    files directly instead of pasting share URLs, while keeping pasted links as
    a fallback path.

- [ ] Mobile share capture
  - Let users create memories directly from Android and iPhone share sheets.
  - Shared photos, videos, audio, links, and text should open a prefilled
    memory composer rather than a generic upload flow.
  - The flow should support "save now, enrich later" while still nudging users
    to add at least one memory signal such as person, event, place, or meaning.
  - This should make capture feel lightweight without turning Tessera into a
    generic camera roll backup product.

- [ ] Batch import from folder / ZIP
  - Let a user drag in a folder or archive of media and ingest many items at
    once.
  - Extract file metadata where possible: date taken, duration, filename,
    dimensions, MIME type.
  - Group likely duplicates and near-duplicates so users are not forced to
    clean their archive manually first.
  - Offer "import now, organize later" as a valid path.

- [x] Tree bootstrap import
  - Import people and relationships from GEDCOM or similar structured sources.
  - The first implementation does not need perfect genealogy fidelity.
  - The job of the importer is to avoid blank-slate onboarding and reduce the
    first hour of work.

- [x] Quick-start onboarding
  - Founders should be able to create a tree, define themselves, add one other
    person, add a few memories, and reach the Atrium quickly.
  - The first-use flow should bias toward "show me something alive" instead of
    "finish configuring everything."

- [x] Deferred curation flow
  - After import or linked-media creation, users should be able to leave items
    partially organized.
  - The system should support queues like "needs person tagging," "needs date,"
    and "needs place," rather than blocking ingestion.

Definition of done for this phase:

- [x] A new family can start from existing files or links (GEDCOM import + linked media).
- [ ] A user can create an archive without reuploading or re-curating everything up
  front (batch import still missing).
- [ ] The product becomes easier to start than the main competitor, not harder.

## Phase 2: Prompted Capture Engine

Goal: make memory gathering active, not passive.

Why this phase matters:

- This is the clearest wedge into a category My Family Archive does not own.
- Families do not just need storage; they need help extracting memories from
  living people before those memories are lost.

Features to implement:

- [ ] Prompt campaigns
  - Move beyond isolated prompts and allow campaigns such as:
    - one question a week for Grandma
    - everyone share a memory about Dad
    - identify the people in this box of old photos
  - Campaigns should define audience, cadence, and theme.

- [ ] Prompt library system
  - Build a curated prompt library with warm-up, middle, deep, and legacy tiers.
  - The system should recommend prompt sequences rather than random prompts.
  - Prompt copy should be treated as product design, not filler text.

- [x] One-tap reply flow (partial — prompt reply links exist and work, but the
  full lightweight elder reply page experience is not yet the canonical flow)
  - The current lightweight reply flow should become the canonical experience
    for low-tech contributors.
  - The page should optimize for:
    - large prompt text
    - one main action
    - voice first
    - optional text fallback
    - no account requirement
    - minimal navigation and zero ambiguity

- [ ] Elder mode
  - An accessibility-first capture path for people who are not comfortable with
    complex interfaces.
  - Large tap targets, minimal copy, stable flow, persistent reminder surface.

- [ ] Follow-up suggestions
  - After someone answers, the system should propose good next questions.
  - Follow-up suggestions can be rule-based at first and AI-assisted later.

- [ ] Event and photo clarification requests
  - Let families request lightweight answers such as:
    - who is in this photo
    - where was this taken
    - around what year was this
    - who remembers this event

- [ ] Family-wide contribution drives
  - Support temporary collection efforts for funerals, anniversaries, reunions,
    birthdays, and family projects.

- [ ] Future delivery memories
  - Let parents or guardians create journal entries, voice notes, photos, and
    short videos intended for a child to access later in life.
  - Support unlock rules such as date, milestone, or steward approval rather
    than requiring child accounts in the first version.
  - Treat these as intentional legacy artifacts attached to a person in the
    family context, not as private chat or a generic messaging system.

Definition of done for this phase:

- [ ] A steward can actively gather memories from relatives who would never browse
  the full app.
- [ ] Prompting becomes a central loop of the product, not a side feature.

## Phase 3: Graph-Native Memory Model

Goal: make memories belong to people and family context, not to isolated pages.

Why this phase matters:

- The repo already contains the beginning of this model.
- This is a structural advantage over page-based archive systems.

Features to implement:

- [x] Full direct-subject tagging UX (partial — backend supports `memory_person_tags`
  and the composer allows tagging people, but the UX does not yet fully expose
  the "who is this directly about?" mental model as the primary flow)
  - Expose the current backend direction in the main composer.
  - Users should be able to say who a memory is directly about.

- [x] Reach rules in product UX (partial — `memory_reach_rules` and
  `memory-reach-service.ts` exist, but reach controls are not yet exposed in
  the main composer UI)
  - Surface immediate-family, ancestor, descendant, and whole-tree sharing in
    an understandable way.
  - Users should not need to understand internal graph terminology.

- [ ] Explainable surfacing
  - Every contextual memory should be able to answer:
    - why am I seeing this
    - who is this directly about
    - what tree or family context surfaced it

- [x] Subject sovereignty flows (partial — `memory_person_suppressions` table
  exists and the permission engine supports subject-level overrides, but the
  full hide/contest UI flow is not yet built)
  - Living subjects should be able to hide, contest, or correct memories about
    themselves.
  - These controls should be specific and careful, not destructive by default.

- [x] Cross-tree identity management (completed — account identity service,
  duplicate detection, merge flows, and cross-tree scope are all implemented)
  - Strengthen duplicate detection, merge review, and shared identity across
    trees.
  - Marriage, remarriage, blended families, and multiple family contexts should
    feel native to the model.

Definition of done for this phase:

- [ ] The memory model clearly exceeds a page-owned archive (backend does; UI
  needs composer and person-view changes to fully realize it).
- [ ] Users can understand both direct memory ownership and contextual visibility.

## Phase 4: Curated Viewing and Discovery

Goal: make Tessera feel like an experience people want to revisit, not just a
database they maintain.

Why this phase matters:

- Curation and emotional resonance are core to the product thesis.
- The existing Atrium, Drift, Map, and Constellation views are strong signals
  that should be deepened into a coherent system.

Features to implement:

- [x] Atrium intelligence (partial — featured memory rotation, resurfacing, era filtering,
  and anniversaries/birthdays all exist; upcoming-day window now expanded to 7 days;
  family presence section now wired into atrium)
  - Improve the atrium so it quietly surfaces:
    - recent contributions
    - unanswered prompts
    - anniversaries and birthdays
    - least-seen memories
    - relevant seasonal or historical moments

- [x] Guided drift modes (partial — `DriftMode` component exists and provides
  passive playback; branch, person, era, and remembrance drift modes are now
  available; place drift and event drift are not yet built)
  - Extend drift beyond random playback.
  - Possible modes:
    - one person
    - one decade
    - one branch of the family
    - one place
    - one event
    - remembrance mode after a death or anniversary

- [ ] Life chapters and exhibits
  - The system should assemble curated sections like:
    - childhood
    - courtship
    - family home
    - work and service
    - holidays and rituals
  - These can begin as system-generated drafts that users refine.

- [x] Multi-perspective event views (partial — `memory_perspectives` table
  exists and the memory page supports multiple contributions, but event-level
  grouping and multi-perspective assembly are not yet built)
  - A single event should be able to collect many memories from multiple people.
  - Example: a wedding, funeral, reunion, migration, or holiday.

- [x] Place journeys (partial — family map view exists with pinned places, but
  narrative place-based storytelling is not yet built)
  - Build on the map view to tell place-based stories:
    - where someone lived
    - migration paths
    - important family places
    - memories tied to one house or city

- [x] Discovery tools (partial — search overlay exists with person and memory
  search; filtered discovery by contributor, voice-only, or year range is not
  yet built)
  - Quietly support finding:
    - everything about this person
    - every memory mentioning this place
    - all voice memories
    - memories from this year range
    - memories contributed by this relative

Definition of done for this phase:

- [ ] The archive feels curated by default.
- [ ] Revisiting the archive becomes a meaningful act, not just administration.

## Phase 5: Portable Micro-Archives and Exhibits

Goal: let families export or publish curated slices of the archive for specific
moments and audiences.

Why this phase matters:

- A full-tree export is valuable, but many real-world use cases need smaller,
  purpose-built outputs.
- This is a natural differentiator for memorials, reunions, museums, and family
  storytelling.

Features to implement:

- [ ] Mini-archive export
  - Export a curated subset instead of only the full tree.
  - Target scopes:
    - one person
    - one couple
    - one event
    - one branch
    - one theme
    - one place

- [ ] Curated export builder
  - A guided flow for selecting memories, ordering them, writing intro text, and
    shaping the narrative.
  - The builder should support both manual curation and system-generated drafts.

- [x] Output targets (partial — full-tree ZIP export with static HTML viewer
  exists; curated subset exports and additional output formats are not yet built)
  - Downloadable ZIP
  - standalone HTML mini-site
  - private share link
  - kiosk / memorial display package
  - future print-ready or book-oriented format

- [ ] Memorial package mode
  - A special export / presentation mode for when someone has died.
  - This should support a dignified, stable presentation appropriate for:
    - funerals
    - celebrations of life
    - family remembrance pages

- [ ] Living museum mode
  - Support an exhibit-like output for organizations, family museums, community
    centers, or historical collections.
  - This can become either a live webpage or a kiosk-targeted package.

Definition of done for this phase:

- [ ] Users can spin out meaningful, curated outputs without exporting the entire
  archive.
- [ ] Tessera becomes useful not only as a repository, but as a publishing system
  for family memory.

## Phase 6: Mobile Capture Surface

Goal: make contribution as easy as tapping a notification and answering.

Why this phase comes after the one-tap web flow:

- The native mobile app should be built on a proven low-friction capture model,
  not invented separately.

Features to implement:

- [ ] Mobile app focused on capture first
  - The first mobile app should not try to replicate every admin feature.
  - Its primary jobs:
    - receive prompt notifications
    - answer prompts quickly
    - capture a memory immediately
    - upload photos / voice / short videos

- [ ] Notification-driven prompt answering
  - A notification should open directly into the answer flow where possible.
  - The screen should privilege one action: answer now.

- [ ] Capture in the moment
  - Let users quickly save a memory while it is happening, then refine it later.

- [ ] Family-managed low-tech setup
  - Allow a steward to help set up an elder's app or capture mode without
    requiring the elder to navigate account complexity alone.

Definition of done for this phase:

- [ ] Mobile meaningfully increases contribution volume from non-technical users.
- [ ] The app is capture-centric rather than a compromised clone of the web app.

## Phase 7: Ambient Surfaces

Goal: let the archive live in the home and in shared physical spaces.

Why this matters:

- A memory operating system should appear where remembrance naturally happens,
  not only inside a laptop browser.

Features to implement:

- [ ] TV app / TV mode
  - Support passive and semi-passive viewing on television platforms.
  - Initial focus should be on drift, memorial sessions, and curated exhibits.
  - Native TV apps can come later; a web-based TV mode may come first.

- [ ] Smart frame mode
  - A display-targeted mode for picture frames and always-on displays.
  - This should be more than a slideshow:
    - show names
    - show dates lightly
    - rotate by person, branch, era, event, or place
    - support remembrance or celebration modes

- [ ] Kiosk mode
  - A locked-down presentation mode for reunions, memorials, museums, and
    living-room displays.

Definition of done for this phase:

- [ ] The archive can be experienced passively and communally.
- [ ] Tessera begins to feel like infrastructure for remembrance, not just a web
  app.

## Phase 8: Trust, Hosting, and Ownership Modes

Goal: make deployment flexible without fragmenting the product.

Why this matters:

- Trust and portability are part of the value proposition.
- Different families will want different tradeoffs between convenience,
  ownership, privacy, and control.

Features to implement:

- [x] Hosted mode (completed — this is the current default deployment model)
  - You host the application and the default media storage.
  - This should remain the easiest option.

- [ ] BYO-storage mode
  - The app is hosted by you, but media lives in the customer's bucket or cloud
    storage.
  - This reduces migration friction and increases trust for some families.

- [x] Self-host package (completed — Docker Compose files and Proxmox VM
  deployment documentation exist in `infra/`)
  - A deployable package for private family installs on VPS, NAS, or home
    server environments.
  - This should be productized only after the hosted product is strong.

- [ ] Storage migration and preservation tools
  - Moving between hosted, BYO-storage, and self-hosted modes should be a
    supported lifecycle, not a manual crisis.

Definition of done for this phase:

- [ ] Families can choose their preferred trust model without leaving the product.
- [ ] Ownership becomes a concrete product promise rather than just product copy.

## Ongoing Product Rules

These rules should hold across all phases:

- Do not require full organization before showing value.
- Do not make manual page-building the main mental model.
- Do not let genealogy completeness outrank memory capture.
- Do not make low-tech relatives learn a complex interface.
- Do not treat export as optional.
- Do not add features that weaken the product's quiet, memorial posture.

## Idea Backlog

These are valid future ideas, but they should only advance when the relevant
phase foundations are in place:

- [ ] AI-assisted curation drafts for life exhibits
- [ ] AI-generated title / summary / metadata suggestions
- [ ] Phone-call capture for elders without smartphones
- [ ] Print-on-demand books and memorial booklets
- [ ] Public / semi-public museum installations
- [ ] School / local-history / oral-history institution use cases
- [ ] Household remembrance calendar and ritual surfaces

## How To Maintain This Document

When new product ideas arise:

- Add them to the appropriate phase if they clearly belong there.
- If they do not yet belong in an active phase, add them to the Idea Backlog.
- Mark completed items by changing `[ ]` to `[x]`.
- Update feature descriptions when implementation changes the intended scope.
- Remove outdated framing if the product direction becomes clearer.
