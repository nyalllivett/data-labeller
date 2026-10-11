# Data Labeller: project rules

These rules apply to every job in this repository, including planning, documentation, implementation, fixes, and review. They are the project reference, not optional guidance.

## Start every job here

1. Read this file, `docs/product-spec.md`, `docs/delivery-plan.md`, and any instructions relevant to the files being changed. Read the existing code and run instructions before designing a change.
2. Record the exact starting commit SHA, the numbered working branch, the job's scope, and the applicable requirements. Do not work from an unspecified or assumed revision.
3. Keep the task small enough to review. Raise conflicting requirements or product choices that have not been agreed; do not quietly invent requirements.
4. Preserve unrelated files and work. Do not copy another project's conventions when they conflict with these rules.

## Branches, commits, review, and merging

- All work must be committed on a numbered branch, independently reviewed, then merged. Never commit directly to the default branch.
- Use the next unused four-digit number with a short description: `0001-project-rules`, `0002-app-scaffold`, and so on. Check existing branches and history before choosing a number.
- Commit messages must be a single line in the format `NNNN: concise summary`, using the branch's number. Do not add AI co-author trailers.
- Open pull requests as drafts until review and the applicable checks are complete. Keep branch history and changes understandable and reversible.
- Review must inspect the exact proposed commit and check compliance with this file, the agreed product scope, the delivery plan, and the job's acceptance criteria. The builder must not be the only reviewer.
- Review findings must be resolved or explicitly recorded as an agreed deferral before merge. A later push invalidates an earlier review of the affected code; review and checks must match the final revision.
- Do not merge without the authorized review and merge decision. A successful push or a draft PR is not a completed merge.
- An empty-repository bootstrap that cannot follow this workflow must be reported before any exception is made. Never silently write the initial work to the default branch.

## Unit test everything we own

- Every owned logic path and component behavior must have meaningful unit tests: normal use, boundaries, invalid inputs, edge cases, failures, repeated actions, and interrupted or asynchronous flows where applicable.
- Test domain rules, state transitions, validation, persistence coordination, clock mapping, edit/Undo behavior, export serialization, recovery, and UI behavior. Native dependencies should be isolated behind adapters and represented by controlled test doubles in the unit suite.
- Unit tests must exercise behavior and assertions that can catch defects. Snapshots or coverage percentages alone do not establish correctness. Do not use skipped tests or superficial assertions to claim coverage.
- Add tests with each behavior change and regression tests with each bug fix. Keep tests deterministic; inject clocks and other nondeterministic inputs where useful.
- Generated code and third-party internals are not our owned logic, but our configuration, adapters, and use of them still need appropriate checks and behavioral unit tests.
- Run the full applicable unit suite, type checks, and lint against the final commit. Report exact commands and outcomes. If a check cannot run, report it as not run with the actual blocker; do not imply it passed.
- Do not add integration tests for now. Unit tests of component behavior and adapter coordination are still required. Revisit integration testing only when the project owner changes this direction.
- Documentation-only jobs have no application behavior to unit test. They must check scope consistency, links, instructions, and the diff, and explicitly state that application checks are not applicable.

## Maintainable design

- Use the simplest correct design. This app does not need speculative hardening: safeguards must address a credible user action, device/storage failure, or saved-data risk. Do not add defensive layers for extremely unlikely sequences, generalized recovery machinery, or abstractions without a concrete need.
- Implementation and review must justify safeguards by their realistic trigger and impact. If a check duplicates a reliable platform guarantee or complexity has no credible benefit, simplify it safely with focused regression coverage. Correctness, recoverable failures and saved-data protection still matter; integration tests remain out of scope.
- Use clean, scalable, small, focused modules with clear responsibilities. Avoid massive classes, catch-all services, oversized components, and tightly coupled state.
- Keep UI thin, domain behavior pure and testable where possible, and platform/media/storage concerns behind narrow adapters. Add abstractions when they solve a real boundary or repeated need, not in anticipation of every possible future feature.
- Apply SOLID principles where they make the design clearer. Reuse code when the shared responsibility is genuine; do not create artificial generality or duplicate known rules.
- Prefer explicit types, readable names, straightforward control flow, and minimal dependencies. Document important decisions and invariants near the relevant code or in a short design note.
- Existing foundation code is optional input for selective reuse. It must not dictate the app's architecture or dependencies, and any foundation convention of having no tests does not apply here.

## Errors, recovery, data safety, and observability

- Handle errors explicitly. Do not swallow exceptions or hide a failed operation behind a success state. Distinguish user cancellation, recoverable failure, and unrecoverable failure.
- Preserve recoverable video and annotation data across failed writes, low storage, interruptions, and failed exports. Design and unit test recovery paths; do not claim durability before it is implemented and checked.
- Report a recording as Saved only after its video is in durable app-owned storage and its metadata/annotations are committed. A temporary camera/cache URI alone is not a saved recording. Make retries and relaunch reconciliation idempotent and preserve the last good committed record.
- Surface useful, understandable errors and safe next steps. Ensure retries and repeated actions do not silently duplicate or corrupt data.
- Observability is essential: use structured, privacy-conscious diagnostics for important operations, state transitions, timings, and failures. Make failures diagnosable without recording media content or sensitive user data.
- Do not log raw video, label/project names, credentials, or unnecessary personal data. Do not add remote analytics, crash-upload services, or other external data sharing as an incidental dependency.

## Media timing and device validation

- Annotation times must refer to the recorded media timeline. Use an actual media clock when available, or a measured, justified mapping whose assumptions and limits are documented.
- Never assume that the JavaScript recording call is the first recorded frame. Do not claim frame accuracy or choose a fixed tolerance without evidence and an agreed acceptance criterion.
- Define recording/finalization/save/recoverable-failure states and safe handling of active intervals when capture stops or is interrupted. Guard conflicting starts, stops, and navigation. Verify the chosen SDK's camera-switch behavior rather than assuming a running recording survives a front/rear change.
- Unit tests must cover the owned timing model and its failure cases. Mocked/native adapter tests do not prove camera behavior on a device.
- Real-device testing is deferred for now at the project owner's request. This does not block every development branch merge if unit, type, lint, and review requirements are met.
- Track device verification separately as an acceptance/release gate. Validate on iOS first, then Android. Record device/OS, exact app commit, observations, and limits when that validation happens. Until then, native camera timing, interruption handling, storage behavior, and end-to-end capture/export remain unverified on devices.

## Scope and authority

- V1 is a local-only iOS and Android app. No backend or authentication is required. Follow `docs/product-spec.md`; existing-video import is V2.
- React Native with TypeScript and an Expo development build is the proposed implementation direction. Verify current SDK/native capabilities and compatibility before locking versions or claiming that they support the required media timing.
- Architecture and independent review use GPT-6 Astra; building uses GPT-6.1 Sol, as requested by the project owner.
- Do not introduce paid tooling, access signing credentials, publish releases, or deploy as part of ordinary jobs. Obtain the specific authorization needed for those actions.

## Completion report for every job

Provide the scope delivered, changed files, starting SHA, exact final commit SHA, branch and PR link if available, checks run with outcomes, unresolved review findings, and anything not verified. Separate unit/type/lint results from native/device results. Update the relevant delivery-plan status and decision records without marking unfinished or unverified work complete.
