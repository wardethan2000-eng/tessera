# Product Brainstorm — 2026-04-22

This is a snapshot of where Tessera stands relative to its own roadmap, where
the highest-leverage gaps are, and a list of fresh ideas not yet captured in
`PRODUCT-ROADMAP.md`. Use this as a working document; promote items into the
roadmap as they mature.

## Pattern across the existing roadmap

Tessera has shipped a lot of foundations, but the **Definition of Done** boxes
for almost every phase are still unchecked. The recurring theme: the backend
exists, but the UI hasn't yet exposed it as the *primary* user mental model.
Most leverage right now comes from finishing the user-facing surface of work
that's already structurally there.

## Highest-leverage half-built items

These would dramatically change how the app feels with comparatively little
work:

1. **Reach rules in the composer (Phase 3).** `memory-reach-service` and
   `memory_reach_rules` exist but contributors can't say "this memory is for
   descendants only" or "whole tree" while creating it. One form away from
   real.
2. **Direct-subject tagging as the primary composer model (Phase 3).** Drift's
   misattribution was fixed by *reading* `primaryPersonId`, but the composer
   doesn't ask "who is this directly about?" as the first move. The single
   change that would make Drift, Atrium, and person-pages feel coherent.
3. **Anniversaries / birthdays in Atrium (Phase 4).** Atrium already does
   featured rotation and resurfacing. Adding "today is Henry's birthday —
   three memories of him" is a one-day feature with huge emotional weight.
4. **Guided Drift modes (Phase 4).** Drift infrastructure is now substantial.
   Natural next: "Drift one person" / "Drift the 80s" / "Drift Brent's branch"
   / **Remembrance mode**. Filtered queries against the existing `/drift`
   endpoint plus a chooser sheet.
5. **Mini-archive export (Phase 5).** Full-tree ZIP exists; the highest-emotion
   variant is *one person* or *one event*, especially after a death. Reuses
   the existing exporter with a scope filter.

## Biggest unstarted phases worth opening soon

6. **Prompt campaigns + library (Phase 2).** This is the wedge into territory
   other archive products don't own. "One question a week to Grandma" with a
   curated, tiered prompt library is *the* growth/retention loop. Prompt reply
   links exist — campaigns are a scheduler + audience picker on top.
7. **Elder mode / one-tap reply page as canonical (Phase 2).** The reply page
   exists but isn't the loud, intentional surface it should be. Big text,
   voice-first, no auth, single CTA.
8. **Mobile share-sheet capture (Phase 1/6).** Even before a real native app,
   an iOS/Android share-target PWA that opens a prefilled composer would make
   capture 10× easier.
9. **Batch import from folder/ZIP (Phase 1).** Currently the only way to bring
   content in is one-by-one or via GEDCOM (no media). A drag-a-folder importer
   with EXIF date-taken extraction unblocks every "I have 4,000 photos in
   iCloud" user.
10. **TV / smart-frame mode (Phase 7).** Drift is already 90% of a smart-frame
    app. A `/drift?frame=1` route that hides chrome, autoplays, and survives
    idle is a tiny lift with a huge "wow" moment for showing the product to
    relatives.

## Ideas not yet on the roadmap

- **Per-person timeline / lifeline view.** Constellation shows relationships;
  there is no surface that lays a single person's memories along their actual
  lifespan with era markers. The natural answer to "tell me about Grandpa."
- **Relationship-aware memory prompts during reflection.** "You tagged Henry
  here. Is anyone else? Click their face." Lightweight tagging during
  reflection rather than during capture.
- **Memory collaboration — "I was there too."** When viewing a memory, a
  one-tap "I remember this — here's my version" that creates a linked
  perspective. Multi-perspective is half-built; this would activate it
  socially.
- **AI-assisted enrichment suggestions.** Face / place / date inference offered
  as drafts (subject still approves). Drops activation energy for batch imports
  especially.
- **Gentle nudges / digest emails.** "5 new memories this month, 2 prompts
  unanswered, Grandma's birthday is Tuesday." Without a notification surface
  the app is too easy to forget.
- **Provenance and trust trails.** Who added this, who edited it, when.
  Quietly important for living-archive credibility, especially as more people
  contribute.
- **Cross-tree "I appear in 3 trees" view for a logged-in person.** The
  identity infra exists; show the user *their own* presence across families.
  Powerful onboarding hook.
- **Health-of-archive dashboard for stewards.** Coverage by generation,
  untagged media count, prompts pending. Turns stewardship into a tractable
  game instead of an open-ended chore.
- **Exportable "letter to my future self/child" capsules.** Pair Future-Delivery
  Memories (Phase 2) with a beautiful presentation surface (sealed envelope
  → opens on date) to make them iconic.
- **Drift backdrop refinement.** A dropdown of preset backdrops now exists for
  testing; once a default is chosen, retire the rest or expose only as a
  preference setting.

## Recommended next moves (in order)

1. **Anniversaries/birthdays in Atrium + guided Drift modes.** Finish what
   we're already deep in. Both are days, not weeks. Drift goes from "neat" to
   "I leave it on."
2. **Direct-subject tagging + reach rules in the composer.** Closes Phase 3's
   Definition of Done and makes Drift, Atrium, and exports more accurate
   without further code in those features.
3. **Prompt campaigns.** The only feature on this list that meaningfully
   changes *how often new content enters the system*. Without it, the product
   stays demo-shaped.

## How to use this file

When an item is started, link to its plan or PR from here. When an item ships,
mark it `[x]` and migrate the language into `PRODUCT-ROADMAP.md`. Add new ideas
to the appropriate section as they arise.
