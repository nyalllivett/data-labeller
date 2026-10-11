# Delivery plan

## How every job runs

Read `AGENTS.md`, this plan, and `product-spec.md` from the exact starting commit. Record the job's scope and acceptance criteria before changing files. Use the next unused numbered branch and single-line numbered commits. Keep changes independently reviewable, and review the exact final SHA before an authorized merge.

GPT-6 Astra owns architecture and independent review; GPT-6.1 Sol owns implementation. Review must check requirements, maintainability, errors/recovery, observability, unit tests, and any claimed verification. Later changes require refreshed checks and review where affected.

## Current status

- Project rules and V1 scope: established at `89974c5871b81c0ea673e9696f750afa8c352fd8`.
- Slice A: independently reviewed at `a6acb30c3c74aa5b43b1e5fa9f70839db95b97ad` and merged by the parent as `967b7e6856fb3759e9565a4c0b3501a145f4c2d0` ([PR #2](https://github.com/nyalllivett/data-labeller/pull/2)).
- Slice B: implemented on `0003-project-labels` for draft PR review; independent exact-commit review and authorized merge remain pending. See [slice B decisions and checks](slice-b.md). C–E remain unimplemented.
- Application scaffold: installed Expo 57/React Native 0.86/TypeScript toolchain, minimal app shell, deterministic unit/component suite, strict type checking and lint. Cloud verification outcomes are recorded below and in the README.
- Native SDK/timing feasibility: official docs and installed camera/playback public/native sources inspected. Both platform bundles and native project generation checked. Expo Camera exposes no first-frame/live recording clock through the inspected public API; native anchor/mapping feasibility remains open for C. Project metadata persistence/reconciliation is implemented in B with controlled unit tests; native durability is unverified. Media promotion/reconciliation remains proposed for C.
- Device testing: deferred at the project owner's request; iOS is the first later validation target.

## Planned slices

The first usable flow is: create project and labels, capture and toggle, review and correct, then export video and annotations. Deliver it through the following small branches rather than one large implementation. Branch numbers are allocated from actual repository history at job start.

### A. Scaffold and timing/architecture investigation

Implementation status: reviewed by GPT-6 Astra and merged by the parent in PR #2. Unit/type/lint and non-device verification are recorded in [slice-a.md](slice-a.md#verification). No native compilation or device acceptance is claimed.

- Verify current React Native/TypeScript/Expo development-build compatibility and native camera/playback APIs from official sources and the chosen environment.
- Identify the actual media-clock access or measured mapping needed for annotation times. Document evidence, assumptions, and unresolved native/device questions; do not make a frame-accuracy claim.
- Define small domain/UI/adapter boundaries and essential invariants without an abstraction explosion.
- Establish deterministic unit tests, component-behavior tests, type checking, lint, and reproducible commands. Add the verified commands to the README.
- Define the local persistence and recovery approach before capture depends on it.
- Verify the chosen SDK's output storage and camera-switch semantics. Treat temporary media promotion and metadata commit as a coordinated save; define idempotent reconciliation and preserve the last good record on failure.
- Acceptance: a reproducible scaffold and meaningful tests/checks; a reviewed architecture/timing decision with explicit verification limits. No device test is required for this development slice's merge.

### B. Project and label domain with local persistence

Implementation status: project/label rules and screens, SQLite staging/commit/reconciliation, fixed exception reporting and private storage preparation delivered on `0003-project-labels`; draft review pending. Tests/checks and native verification limits are in [slice-b.md](slice-b.md#verification). Historical recording names will be snapshotted by C alongside stable label IDs; B does not implement recording.

- Implement project creation and custom label management with thin screens and testable domain behavior.
- Decide validation and identifier/rename behavior required by this slice.
- Implement local persistence with clear save/failure states and a recovery design.
- Unit test all owned logic and component behavior, including invalid input, repeated actions, failed writes, and relevant interrupted operations.
- Acceptance: project/label behavior is covered by deterministic unit tests and passes type/lint checks, with reviewed persistence assumptions and remaining device limits recorded.

### C. Capture and independent label toggles

- Implement front/rear in-app capture through a narrow media adapter.
- Implement the bottom horizontal label row, active highlighting, and a separate fixed Stop control.
- Support independent overlapping label intervals and preserve unlabelled periods without treating them as negatives.
- Implement the agreed media-timeline mapping and recording state transitions; handle stop, denial, interruption, failure, and low-storage scenarios explicitly.
- Safely finalize or recover active intervals at stop/interruption. Guard repeated or conflicting recording/navigation actions, and do not report Saved while media or metadata remains temporary/uncommitted.
- Unit test the owned state machine, timing model, adapter coordination, and all component behaviors with controlled native doubles. These tests do not prove the native camera contract on a device.
- Acceptance: reviewed capture behavior with all owned paths covered and unit/type/lint checks passing. Native behavior and timing remain marked unverified until later device acceptance.

### D. Review, interval edits, and Undo

- Show video above a zoomable per-label timeline.
- Implement inspection and interval-bound adjustment, editing, deletion, and Undo using agreed semantics.
- Keep playback, review, and annotations in a consistent time basis.
- Unit test boundary validation, overlaps, edits, repeated/failed actions, Undo, playback coordination, and component interactions.
- Acceptance: meaningful behavioral unit tests and type/lint checks pass; review records remaining playback/device limitations.

### E. Recording and project export

- Select and document the export schema and packaging through implementation and independent review before encoding it. Evaluate versioned JSON and optional CSV; ask the owner about material UX/scope changes or acceptance decisions.
- Export video plus annotations for one recording and for a project, preserving their linkage, time units, overlaps, and unlabelled gaps.
- Validate exported data and implement cancellation, failure, and retry behavior without endangering source data.
- Unit test all owned serializers, validators, export coordination, completeness/failure handling, and component behavior.
- Acceptance: the initial flow includes export; unit/type/lint checks pass and the precise unverified native/filesystem/share behavior is documented.

## Later device acceptance and release gates

Device testing is intentionally deferred and is not a blanket requirement before each development branch merge. Keep unverified platform behavior visible in job reports and do not confuse passing mocks with native evidence.

Before declaring the app accepted or ready for release:

1. Agree the relevant timing and behavior acceptance criteria. Do not invent fixed tolerances or duration/storage limits.
2. Validate the initial flow on an actual iOS device at an exact commit, recording device/OS and app/build details.
3. Check front/rear capture, overlapping toggles, media/playback alignment, timeline correction/Undo, local save/recovery, interruption and low-storage handling, and single/project export.
4. Measure timing against recorded media with a reproducible method. Document uncertainty and any unsupported guarantees.
5. Perform Android validation against the same agreed scope and record platform differences.
6. Resolve or explicitly agree remaining acceptance issues. Release/store/signing/deployment actions need their own authorization.

Manual device validation is separate from the unit suite. Do not add integration tests unless the project owner changes the current no-integration-tests direction.

## Evidence required in each report

- Starting SHA, working branch, exact final SHA, changed files, and PR link/status.
- Requirements delivered and decisions made, with any scope changes identified.
- Unit, type, and lint commands and their passed/failed/not-run outcomes.
- Independent review findings and resolution status for that exact revision.
- Native/device behavior actually checked, or a clear statement of what remains unverified.
- Data safety, error/recovery, and diagnostics covered; blockers and the smallest next step.

Documentation-only work reports consistency/link/diff checks instead of claiming application tests were run. Keep this plan current as slices are reviewed and merged.
