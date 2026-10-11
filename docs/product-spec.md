# Product specification

## Purpose

Data Labeller is a general-purpose mobile app for collecting labelled video. A person can film themselves or someone else, activate one or more custom labels while recording, correct the annotations afterwards, and export both the video and annotation data.

The app targets iOS and Android. Initial device validation will be on iOS. V1 works locally, without a backend or account/authentication requirement.

## Agreed V1 workflow

### 1. Create a project and labels

- Create a project and define its custom labels.
- Keep the project's recordings and their annotations locally so they can be reviewed and exported.
- Use stable label identifiers so renaming or otherwise changing a label cannot silently corrupt historical annotations or export linkage. Decide the historical naming policy when label editing is implemented.
- Do not invent fixed project, label, duration, or storage caps. Any necessary limit must be justified and agreed before becoming product behavior.

### 2. Capture and toggle labels

- Capture video inside the app using the front or rear camera, selected before capture, supporting filming oneself or another person. Switching cameras during a recording is not required by the agreed V1 scope; defer that additional behavior unless it is explicitly chosen later.
- Show label buttons in a horizontally scrolling row at the bottom of the capture screen.
- Labels toggle independently on and off. More than one label may be active at once; intervals can overlap.
- Visually highlight each active label. Scrolling the labels must leave a separate fixed Stop control accessible.
- Associate toggle events and resulting intervals with the recorded media timeline.
- A period with no active label is unlabelled. It is not an implied negative example for every label.
- Stopping, interrupted capture, and recording failure must leave understandable states and preserve whatever data can safely be recovered. Exact interrupted-recording outcomes must be defined and tested during implementation.

### 3. Review and correct annotations

- Display the recorded video above a timeline with a separate track for each label.
- Support zooming the timeline and inspecting overlapping intervals.
- Adjust interval boundaries, edit or delete annotations, and Undo annotation edits.
- Keep review and playback aligned to the same media timeline used for capture and export.
- Define validation rules and Undo semantics before implementing them. Do not introduce arbitrary minimum segment lengths, snapping tolerances, or history limits as if they were already agreed.

### 4. Export video and annotations

- Export a single recording with its video and annotations.
- Export a project's recordings with their videos and annotations.
- Export is required for V1 and belongs in the initial end-to-end slice.
- The exact export schema and packaging are not yet agreed. A versioned JSON representation with CSV as an additional interoperable format is a recommendation to evaluate, not a committed format.
- Whatever format is selected must make video-to-annotation linkage and time units explicit, preserve overlapping labels and unlabelled gaps, and support validation without requiring the app.
- Failed or cancelled export must not delete or corrupt the local source data. Define completeness and retry behavior before implementation.

## Local data safety and privacy

Projects, media, and annotations stay local in V1. Persistent storage must account for interrupted writes, app interruptions, low storage, and export failures. The implementation must distinguish temporary work from successfully saved data and offer appropriate recovery.

A recording is Saved only when both durable app-owned video and its committed metadata/annotations are available. Temporary camera output is not sufficient. Recording, finalization, saved, and recoverable-failure states must be distinguishable. Retry and relaunch reconciliation must be idempotent, preserve the last good record, and never silently discard recoverable data.

Use privacy-conscious structured diagnostics. No backend, remote telemetry service, cloud sync, or authentication is required to deliver V1. Any future external data sharing is a separate decision.

## Timing requirement and current verification limit

Annotations describe positions in the saved media, not merely elapsed JavaScript wall-clock time. Use a media clock or a measured mapping with documented assumptions. A JavaScript start-recording invocation is not evidence of the first frame's timestamp.

The timing spike must identify observable native/media events, recording start/stop behavior, available timestamps, playback alignment, and the uncertainties introduced by any mapping. No fixed tolerance or frame-accuracy promise has been agreed.

Real-device testing is deferred. Unit tests can validate the owned state machine and timing calculations but cannot establish actual camera/media behavior. Device acceptance will happen later on iOS first, then Android, against a documented criterion and exact app revision.

## Deferred scope

- V2: import and label an existing video.
- No V1 requirement for a backend, authentication, cloud storage, sync, or collaboration.
- Releases, store submission, signing setup, and paid services are not part of ordinary development jobs.

## Implementation direction

React Native with TypeScript and an Expo development build is the proposed starting point. Verify current SDK versions, recording/playback APIs, native build compatibility, and media-clock access before selecting dependencies. A required native adapter is preferable to pretending unsupported timing guarantees exist.

Use thin UI, focused domain modules, and narrow platform/storage/media adapters. Selective reuse of existing foundation code is allowed if it meets this project's rules; it does not determine architecture or remove the requirement to unit test owned behavior.

## Decisions still to settle

Record decisions in the relevant job or a short design note rather than silently filling these gaps. Implementation and independent review may settle ordinary, reversible technical details within the agreed scope. Material UX/scope changes, new commitments, and acceptance criteria need project-owner input; do not block routine technical decisions on unnecessary confirmation.

- Media-clock API or measured mapping, its units, precision, and later device acceptance criterion.
- Annotation boundary convention and behavior at recording stop or interruption.
- Validation for project/label names and label changes when recordings already exist.
- Exact meaning of annotation editing and Undo history/lifetime.
- Export schema, JSON/CSV choice, packaging, filenames, and destination interaction.
- Recording settings and audio behavior; any later request for switching cameras during a recording.
- Local storage technology, recovery states, and low-storage behavior.

These open choices do not authorize scope expansion. Resolve each when its implementation slice needs it.
