# Delivery plan

## How every job runs

Read `AGENTS.md`, this plan, and `product-spec.md` from the exact starting commit. Record the job's scope and acceptance criteria before changing files. Use the next unused numbered branch and single-line numbered commits. Keep changes independently reviewable, and review the exact final SHA before an authorized merge.

GPT-6 Astra owns architecture and independent review; GPT-6.1 Sol owns implementation. Review must check requirements, maintainability, errors/recovery, observability, unit tests, and any claimed verification. Later changes require refreshed checks and review where affected.

Keep safeguards proportional: use the simplest correct design for credible user actions, device/storage failures and saved-data protection. Reviewers must explain the realistic trigger and impact that justify a safeguard. Avoid speculative hardening, defensive layers for extremely unlikely sequences and abstraction inflation. Simplify unjustified complexity safely with focused regression tests; unit tests remain mandatory and integration tests remain excluded.

## Current status

- Project rules and V1 scope: established at `89974c5871b81c0ea673e9696f750afa8c352fd8`.
- Slice A: independently reviewed at `a6acb30c3c74aa5b43b1e5fa9f70839db95b97ad` and merged by the parent as `967b7e6856fb3759e9565a4c0b3501a145f4c2d0` ([PR #2](https://github.com/nyalllivett/data-labeller/pull/2)).
- Slice B: independently approved at `e984d51d19a7aaa22f655725a604961006333867` and parent-merged as `dabff1cb98467d2f6c39c8992f23e2f708c42057` in [PR #3](https://github.com/nyalllivett/data-labeller/pull/3), with documented native execution limits. See [slice B decisions and checks](slice-b.md).
- Slice C: independently approved at `98fa9fb55f22d8713d3f1fb828a5cbad109a19fa` and parent-merged as `4af3e4f16a82ac176f158dd192c188ec79ff7978` in [PR #4](https://github.com/nyalllivett/data-labeller/pull/4). [Capture decisions and checks](slice-c.md) retain native execution/device limits.
- Slice D: review/editing/Undo implementation and cloud checks complete on `0005-review-editor` from that exact C merge, in draft [PR #5](https://github.com/nyalllivett/data-labeller/pull/5). Independent exact-SHA review and parent merge remain pending; [decisions/checks/native limits](slice-d.md). E remains unimplemented.
- Application scaffold: installed Expo 57/React Native 0.86/TypeScript toolchain, minimal app shell, deterministic unit/component suite, strict type checking and lint. Cloud verification outcomes are recorded below and in the README.
- Native SDK/timing feasibility: official docs and installed camera/playback sources inspected. C adds a small pinned native route for reported media-duration samples, without a JS start offset; physical-tap lag remains unquantified and acceptance unverified. Both platform bundles, generation and source-build/autolinking selection are checked. Project metadata and coordinated recording/media save/recovery are implemented with controlled units; actual native durability is unverified.
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

Implementation status: independently reviewed and parent-merged in PR #3, including multi-request discard recovery and native policy unit sources/targets. Native unit targets have not executed in this cloud; review approved with those documented limits. Tests/checks are in [slice-b.md](slice-b.md#verification). Historical recording names are snapshotted by C alongside stable label IDs; B itself does not implement recording.

- Implement project creation and custom label management with thin screens and testable domain behavior.
- Decide validation and identifier/rename behavior required by this slice.
- Implement local persistence with clear save/failure states and a recovery design.
- Unit test all owned logic and component behavior, including invalid input, repeated actions, failed writes, and relevant interrupted operations.
- Acceptance: project/label behavior is covered by deterministic unit tests and passes type/lint checks, with reviewed persistence assumptions and remaining device limits recorded.

### C. Capture and independent label toggles

Implementation status: capture/independent toggles, fixed Stop, snapshots, known persistent staging and local media/metadata save/recovery are implemented on `0004-capture-labels`. Independently approved at `98fa9fb55f22d8713d3f1fb828a5cbad109a19fa` and parent-merged as `4af3e4f16a82ac176f158dd192c188ec79ff7978` in PR #4. JavaScript checks and both bundles/config/autolinking pass. Reported native media-duration samples are provisional, with unquantified tap lag and no elapsed-JS extrapolation. Native unit sources exist but have not executed. Details and limits are in [slice-c.md](slice-c.md).

- Implement front/rear in-app capture through a narrow media adapter.
- Implement the bottom horizontal label row, active highlighting, and a separate fixed Stop control.
- Support independent overlapping label intervals and preserve unlabelled periods without treating them as negatives.
- Implement the agreed media-timeline mapping and recording state transitions; handle stop, denial, interruption, failure, and low-storage scenarios explicitly.
- Safely finalize or recover active intervals at stop/interruption. Guard repeated or conflicting recording/navigation actions, and do not report Saved while media or metadata remains temporary/uncommitted.
- Unit test the owned state machine, timing model, adapter coordination, and all component behaviors with controlled native doubles. These tests do not prove the native camera contract on a device.
- Acceptance: reviewed capture behavior with all owned paths covered and unit/type/lint checks passing. Native behavior and timing remain marked unverified until later device acceptance.

### D. Review, interval edits, and Undo

Implementation and cloud verification complete on `0005-review-editor`, draft PR #5, pending independent re-review/parent merge. Saved-recording selection, video above a common-scale zoomable per-label timeline, interval-bound/label edits, deletion and explicit Save/session Undo are implemented. Original capture evidence/untimed failures remain immutable. The independent review's fractional playback-endpoint finding is fixed with focused regressions; exact reported milliseconds survive Apply without a text round trip, while manual boundary input clears that numeric intent. All 33 unit suites / 290 tests, strict types, lint, fresh install, both bundles and config/autolinking pass. Doctor's two remote checks fail; native/device execution remains unverified. [Slice D decisions](slice-d.md) record the model, finding/fix, failure/retry semantics and verification limits.

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
- Safeguards justified by credible failures and their impact, including any safe simplifications made to keep the design proportionate.

Documentation-only work reports consistency/link/diff checks instead of claiming application tests were run. Keep this plan current as slices are reviewed and merged.
