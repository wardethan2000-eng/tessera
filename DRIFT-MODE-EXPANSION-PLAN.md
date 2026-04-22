# Drift Mode Expansion Plan

> Drafted: 2026-04-22

## Purpose

This document captures the more cinematic memory ideas that surfaced while reviewing alternative atrium concepts.

Those ideas are strong, but most of them belong in **Drift Mode** or in memory-detail transitions, not in the atrium's top-level information architecture.

The atrium should borrow:

- larger, more atmospheric memory surfaces
- stronger editorial composition
- more immersive lead memories in the trail

The following ideas should instead be treated as the roadmap for Drift:

- full-screen memory takeover
- layered narrative context
- woven participant perspectives
- cinematic artifact sequencing
- scene-like memory transitions

## Product Decision

Drift Mode should evolve from a simple passive playback surface into a **curated memory cinema** for a family archive.

It should feel like:

- a slow film assembled from family memory
- entering one memory deeply before dissolving into the next
- moving through a branch, era, person, event, or remembrance path

It should not feel like:

- a random slideshow
- a media carousel
- a television screensaver with metadata

## Why This Lives In Drift, Not The Atrium

The atrium is the front room of the archive. It needs to orient the user:

- where they are
- whose branch is in focus
- which memory is opening the page
- where the archive can widen next

A full takeover memory stream works against that orientation if it becomes the whole homepage.

Drift, on the other hand, is exactly where the product can become more cinematic and immersive.

## Target Drift Experience

Drift should support a richer scene model for each memory.

Each scene can include:

- one dominant asset
- supporting text or transcript excerpt
- person attribution
- date / era cue
- branch / event cue
- one or more related perspectives
- optional surrounding artifacts

The system should not invent fake material. Every layer must come from real archive data or clearly system-derived structure.

## Expanded Drift Structure

### 1. Memory Scene

Each memory should occupy the screen like an editorial spread rather than a card.

Examples:

- a photograph held full-screen with subtle Ken Burns drift
- a story rendered as a large typeset page
- a voice memo paired with transcript fragments and waveform presence
- a document or recipe treated as an artifact with paper-like framing

### 2. Supporting Context Panel

Each drift scene should be able to reveal a quiet context layer:

- who the memory is about
- who contributed it
- what branch surfaced it
- why it is appearing now

This context should stay lightweight and never interrupt the visual center.

### 3. Perspective Weave

This is the closest productized version of the user's reference concept.

For memories that belong to an event or branch cluster, Drift should be able to interleave:

- a primary memory
- adjacent memory excerpts from nearby people
- short transcript fragments
- text contributions from other relatives
- related images or artifacts from the same context

This must come from real grouped archive data:

- event groupings
- participant tags
- branch focus ids
- multi-perspective memory collections

It must not be mocked or auto-fictionalized.

### 4. Artifact Sequences

After a primary scene, Drift can dissolve through supporting artifacts:

- another photo from the same day
- a scanned note
- a voice fragment from one participant
- a later reflection on the same moment

This creates the "editorial canvas" feeling without losing archival truth.

## Drift Modes To Add

The current implementation is close to random passive playback. It should expand into explicit guided modes.

### Branch Drift

Start from one person or memory and stay close to that branch before widening.

This is the most direct home for the atrium-adjacent cinematic ideas.

### Person Drift

Spend time with one person's archive:

- childhood
- adulthood
- family roles
- work
- voice
- artifacts

### Era Drift

Stay within one decade or historical period.

### Event Drift

Assemble a drift around one event:

- wedding
- reunion
- funeral
- migration
- holiday
- graduation

### Place Drift

Move through memories connected to one house, town, city, or route.

### Remembrance Drift

Quietly assembled drift sessions for:

- birthdays
- death anniversaries
- memorial gatherings
- family milestones

## Interaction Model

Drift should remain simple to enter and simple to leave.

Core controls:

- pause / autoplay
- advance
- step back
- open the current person
- open the current memory
- close drift

Optional later controls:

- switch drift mode
- pin this memory
- save this path as an exhibit

The controls should stay minimal and peripheral. The content remains central.

## Visual Direction

Drift can support more visual drama than the atrium, but it still needs restraint.

Preferred qualities:

- low-light, warm, archival atmosphere
- slow fades
- subtle motion
- large typography
- full-screen imagery with careful masking
- strong negative space
- quiet metadata

Avoid:

- flashy transitions
- loud overlays
- obvious carousel dots
- overbearing transport controls
- music-player chrome

## Data Requirements

To support the richer Drift vision, the backend and viewing model should eventually expose:

- grouped event memories
- memory perspectives tied to one event or artifact cluster
- explainable surfacing metadata
- branch-focused memory sequences
- related artifacts by date, participant, place, and contributor

The current model already has useful foundations:

- tagged people
- featured branch logic
- trail-building logic
- `memory_perspectives` groundwork

But Drift will need more direct scene-assembly support to fully realize this.

## Implementation Phases

### Phase A: Presentation Upgrade

Improve the existing full-screen Drift presentation:

- better treatment of photos, stories, and voices
- stronger typography
- calmer metadata
- improved transitions

### Phase B: Guided Mode Selection

Let Drift start from:

- current atrium memory
- current person
- current branch
- current decade

### Phase C: Contextual Scene Assembly

Add branch and event-aware sequencing instead of pure random shuffle.

### Phase D: Perspective Weaving

Allow one memory scene to open into nearby real contributions and related artifacts.

### Phase E: Curated Memorial Sessions

Support saved or generated remembrance sessions for anniversaries, birthdays, and family gatherings.

## Relationship To The Atrium

The atrium should continue to:

- begin from one memory
- orient the user within a branch
- offer nearby trails
- surface family presence

Drift should become the place where the archive becomes most cinematic.

That means the right product split is:

- **Atrium**: editorial entry and branch orientation
- **Drift**: immersive movement through memory

## Immediate Recommendation

In current implementation work:

1. make the atrium trail more cinematic and memory-led
2. do **not** turn the atrium into a full-screen overlapping memory stream
3. deepen Drift Mode separately using the ideas above

This preserves the plan-level role of the atrium while still capturing the strongest emotional ideas from the alternative concept.
