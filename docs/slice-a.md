# Slice A: scaffold and architecture decision

## Job baseline and scope

Starting checkout and fetched `master`: `89974c5871b81c0ea673e9696f750afa8c352fd8`.
Branch: `0002-app-scaffold`, allocated after checking local/remote branches, tags and commit history. The checkout was clean; no checkout `.agents/skills` were present. Read `AGENTS.md`, `README.md`, `docs/product-spec.md` and `docs/delivery-plan.md` at that exact revision.

Deliver only slice A: a reproducible React Native/TypeScript/Expo development-build scaffold, deterministic unit/component tests, types, lint, non-device bundle/config checks, and architecture/timing/durability evidence. No integration tests, devices, signing, paid services, deployment or release. Foundation is unavailable and optional; no foundation code is needed.

Acceptance requires passing owned behavioral unit tests, type checking and lint; successful dependency installation and applicable non-device bundle checks; explicit native verification limits; and independent review of the final commit before any authorized merge. The parent arranges that review. This job opens a draft PR and does not merge.

## Dependency and build decision

Evidence checked on 2026-10-11:

- Expo's [SDK 57 reference](https://docs.expo.dev/versions/v57.0.0/) targets React Native 0.86 and React 19.2.3. The publisher's `expo-template-blank-typescript@57.0.29` tarball specifies Expo `~57.0.27`, React Native `0.86.3`, React `19.2.3` and TypeScript `~6.0.3`. npm's `expo` `latest` tag resolved to `57.0.27`; `next` resolved to `58.0.7`. Choose the stable SDK 57 line rather than the next tag.
- Actual environment: Linux, Node `24.19.0`, npm `11.9.0`. The installed React Native package permits Node `^20.19.4 || ^22.13.0 || ^24.3.0 || >=25.0.0`. `.nvmrc`, engines and `packageManager` record the tested toolchain; `package-lock.json` fixes the resolved dependency graph for `npm ci`.
- The installed `expo/bundledNativeModules.json` specifies camera `~57.0.6`, video `~57.0.5`, development client `~57.0.19`, safe-area context `~5.7.0`, Jest Expo `~57.0.5` and ESLint Expo `~57.0.2`. These packages installed successfully. See the lockfile for all exact transitive versions.
- Jest `29.7.0` matches Jest Expo's 29.x transformer/environment dependencies; `@types/jest@29.5.14` matches the runner. [Expo's unit testing guide](https://docs.expo.dev/develop/unit-testing/) documents the native preset and React Native Testing Library. RNTL `14.1.0` uses the separate `test-renderer@1.0.0` peer, per [Callstack's current instructions](https://oss.callstack.com/react-native-testing-library/docs/start/quick-start). Tests await its asynchronous render and interaction APIs. No direct deprecated `react-test-renderer` dependency was added; Jest Expo itself includes it transitively.
- ESLint `9.39.5` is the compatible maintenance line selected by Expo CLI. npm warns that it is deprecated; the installed React ESLint plugin's peer range excludes ESLint 10. Do not force a newer incompatible major with peer-dependency overrides. Revisit when Expo's lint stack supports it. Other npm deprecation messages concern transitive tooling; installation and checks still pass.

Use Continuous Native Generation: app configuration and lockfile are tracked; generated `ios/` and `android/` directories are ignored. Local [Expo development builds](https://docs.expo.dev/guides/local-app-development/) use `expo-dev-client` and local Metro. No EAS account/project, cloud build, paid API, signing credential, publishing or release configuration is added.

The SDK reference lists iOS 16.4+, Xcode 26.4+, Android 7+, and Android compile/target SDK 36. The generated Podfile also defaults to iOS 16.4. These are upstream technical prerequisites, not device acceptance. Generation does not compile native code or prove native linking/runtime compatibility.

Camera and video are installed to establish the proposed native dependency/plugin baseline, but are not mounted or invoked. No camera or microphone permission is requested by the app shell. Microphone declarations are disabled for this scaffold; slice C must settle audio behavior and update permissions before capture. Android backup and legacy external-storage permissions are disabled. App data storage, iOS backup exclusion, codecs, quality and orientation during capture remain future decisions. Disabling barcode configuration does not guarantee barcode code is absent from upstream prebuilt modules.

## Architecture decision

GPT-6 Astra provided architecture advice for slice A against the recorded baseline. This decision adopts it; independent review of the final commit is still pending. Keep the app as a plain registered root component with no router, state-management framework, dependency container or copied foundation.

Implemented modules:

- `App.tsx` composes safe-area support, a status bar, the render boundary and welcome screen. `index.ts` registers that root with Expo.
- `src/shell/WelcomeScreen.tsx` describes the local workspace and clearly states that project creation and recording are coming later. Scrolling supports small screens and enlarged text; native visual/accessibility acceptance is deferred.
- `src/shell/AppErrorBoundary.tsx` catches descendant render/lifecycle failures, shows a safe message and remounts the failed subtree on explicit retry. Repeated failure leaves Retry available. It does not catch asynchronous operations, event-handler failures, native crashes or failure of its own fallback. Before adding mutable project/capture state, slices B/C must restore state from durable drafts and guard navigation; render retry is not a storage-recovery mechanism.
- `src/diagnostics/diagnostics.ts` sends fixed event codes, schema version and scope to an injected sink, defaulting to local console output. It receives no error object, message, stack, URI or user text. Sink failure returns `false` and cannot prevent the recovery UI. No diagnostic uploader is configured. Development React/native tooling can still report exceptions separately; future operations must normalize errors before any app-owned diagnostic call.

Proposed boundaries, to be added only when consumed by their slice:

| Boundary | Narrow responsibility |
| --- | --- |
| Domain modules (B–E) | Pure validation, stable IDs, interval rules, transitions, edits/Undo and export serialization |
| Capture adapter (C) | Permissions, preview readiness, front/rear selection before capture, stop/result/error outcomes, temporary output and explicit native timing evidence |
| Recording coordinator (C) | Serialize capture commands, journal draft progress, finalize intervals, coordinate media promotion and metadata commit |
| Metadata repository (B/C) | Local SQLite transactions, immutable committed revisions and pending-operation journal |
| Media file adapter (C) | Inspect/copy/promote/enumerate app-owned files; distinguish cache, staging and committed media |
| Playback adapter (D) | Load/status/error, native media position/duration, seek outcome and explicit unit conversion |
| Export adapter (E) | Local package/destination/cancellation/failure while retaining source data |

Prefer injected functions or small objects. Do not implement empty ports or full state machines in A. Later diagnostics should use fixed operation/state/error codes, opaque correlation IDs and measured timing fields only where useful, without names, paths or media payloads. Sink retention and richer local diagnostic access can be decided with those operations.

## Native camera and playback evidence

The [Camera reference](https://docs.expo.dev/versions/v57.0.0/sdk/camera/) and the actually installed sources establish the following API contract, not observed device behavior:

| Observation | Evidence / consequence |
| --- | --- |
| Preview readiness carries no timestamp | `expo-camera/src/Camera.types.ts`, `onCameraReady?: () => void`: readiness describes preview, not recording's first frame |
| Recording result is asynchronous and may be absent | `expo-camera/src/CameraView.tsx`, `recordAsync`: forwards through an optional camera ref; output arrives after finalization. Handle absent output and rejection explicitly |
| Output is temporary | Camera docs and native code generate cache paths; a returned URI is not Saved |
| Flip stops recording | Camera docs and `CameraView.tsx` explicitly state this. V1 selects front/rear before recording; prohibit changes while active |
| Stop is a request | `stopRecording()` returns no finalized media timestamp or completion result; await the outstanding record result |
| No documented live recording clock | Inspected public types expose neither a first-frame timestamp nor a recording-media position callback. Android's native Start event only updates an internal recording flag; it does not bridge a clock anchor to JS |

Immutable upstream sources corresponding to installed npm package `gitHead` values:

- Camera `57.0.6`: [JS recording methods](https://github.com/expo/expo/blob/ad1efa3fa5802156660198ba5d787f91014d8df3/packages/expo-camera/src/CameraView.tsx), [public camera types](https://github.com/expo/expo/blob/ad1efa3fa5802156660198ba5d787f91014d8df3/packages/expo-camera/src/Camera.types.ts), [iOS recording delegate](https://github.com/expo/expo/blob/ad1efa3fa5802156660198ba5d787f91014d8df3/packages/expo-camera/ios/Current/CameraVideoRecording.swift), [Android recording events](https://github.com/expo/expo/blob/ad1efa3fa5802156660198ba5d787f91014d8df3/packages/expo-camera/android/src/main/java/expo/modules/camera/ExpoCameraView.kt).
- iOS source generates a cache `.mov` path, calls `AVCaptureMovieFileOutput.startRecording`, and resolves a URI in `didFinishRecordingTo`; it does not bridge a first-frame anchor. It guards an already active recording without providing a new recording outcome, so the owned coordinator must reject conflicting commands rather than relying on native behavior. Despite the documentation mentioning an iOS codec result, the inspected success branch only resolves `uri`; do not depend on that optional metadata.
- Android source generates a cache `.mp4` path. `VideoRecordEvent.Start` changes an internal flag; `Finalize` resolves a URI for normal completion, configured limits and source inactivity, while other outcomes reject. A resolved URI alone does not identify why capture ended or prove a complete intended recording. Inspect finalized assets and interruption state before committing.
- Video `57.0.5`: [player types](https://github.com/expo/expo/blob/9349d1457178dd9cccb8bdd3aed47473c49134e1/packages/expo-video/src/VideoPlayer.types.ts), [event payloads](https://github.com/expo/expo/blob/9349d1457178dd9cccb8bdd3aed47473c49134e1/packages/expo-video/src/VideoPlayerEvents.types.ts), and [Video reference](https://docs.expo.dev/versions/v57.0.0/sdk/video/). `currentTime` and `duration` are seconds. Setting `currentTime` requests a seek; `seekTolerance` affects native seeking. `timeUpdateEventInterval` defaults to zero, disabling events. Event cadence is a UI setting, not an accuracy guarantee. Livestream timestamps are unrelated to local camera recording. No playback adapter or seeking claim is implemented in A.

## Timing decision and feasibility gap

Choose one explicit media time basis across annotations, playback and export when C implements it; milliseconds are a proposed domain unit, not an export-schema commitment. Convert native playback seconds at the adapter boundary without hiding precision or rounding choices.

**Do not use the JavaScript record request timestamp, `Date.now()`, preview-ready callback, native Start callback arrival, or recording-promise resolution as the first recorded frame.** None establishes that relationship in this SDK's public contract.

Expo Camera is a provisional capture candidate. Before C can claim correct live annotation timing, investigate a narrow native extension that exposes media presentation timestamps tied to the finalized asset and a monotonic clock anchor, or demonstrate a measured mapping with documented uncertainty. Re-evaluate the camera dependency if that evidence cannot be obtained. A development build allows a native extension, but none is implemented here.

For example, `mediaMs = anchorMediaMs + eventClockMs - anchorClockMs` is only valid if the clocks have the same rate and a continuous, validated relationship over that segment. A legitimate anchor must include recording identity, clock identity/epoch, source provenance, valid segment and uncertainty. Native start notifications alone are insufficient evidence for first-frame presentation time. Account for callback latency, offset/drift, encoding offsets, stop/interruption, pause and process restart. Unknown uncertainty stays unknown. Reject missing/mismatched/expired anchors and nonfinite/out-of-segment calculations; preserve unresolved toggle events rather than silently clamping them into plausible annotations. Restarting the process invalidates old monotonic-clock relationships.

No timing mapping helper is implemented in slice A because no anchor producer has been established. **The unit suite proves shell/retry/diagnostic behavior only. It does not test a capture mapping or establish any native timing accuracy.** When mapping exists, deterministic tests must cover its calculations and failure cases with controlled evidence; those tests will still not validate the physical anchor or native timing. An instrumented iOS-first device experiment must compare events to the saved media and playback, document its method/uncertainty, and use an owner-agreed acceptance criterion. No tolerance or frame-accuracy promise is selected here.

Future coordinator states: preparing, recording, finalizing, saving, saved, cancelled and recoverable failure. Serialize starts/stops/navigation, keep Stop accessible separately from the horizontal live label row, and disallow camera changes while active. Finalize active intervals only with defensible media-end evidence. Unknown end time leaves recoverable unresolved intervals; it must not use callback arrival time. Boundary conventions, interrupted-recording outcomes, audio and recording settings remain slice C decisions.

## Proposed local durability and reconciliation (B/C)

Use SQLite for local metadata/annotations and a journal, plus app-owned document storage for videos. These are proposed technologies, not implemented persistence. [FileSystem](https://docs.expo.dev/versions/v57.0.0/sdk/filesystem/) distinguishes purgeable `Paths.cache` from persistent `Paths.document`; its copy/move APIs do not create a transaction spanning SQLite. [SQLite](https://docs.expo.dev/versions/v57.0.0/sdk/sqlite/) documents `withExclusiveTransactionAsync`, with statements executed on the supplied transaction object. Serialize repository writes; an ordinary async transaction may include concurrent statements unexpectedly.

Use opaque recording/operation IDs, app-relative committed paths and revision identity. Do not use project/label names as storage identity or persist absolute sandbox roots as durable linkage. An app uninstall, user deletion, OS backup or hardware failure is outside ordinary in-app crash consistency; determine iOS backup exclusion before storing V1 user data, preserving the local-only intent.

The planned save protocol must coordinate two separate resources:

1. Transactionally create a pending operation/draft before capture. Journal recoverable annotation progress during capture; determine write/checkpoint semantics with B/C, without inventing a time/size cap.
2. Associate finalized temporary output with that operation as soon as its URI is available. Copy to a unique document staging location while retaining the source. Disk-space preflight is advisory; copying still needs extra space and may fail.
3. Verify identity and completeness of staged media before promoting to an immutable final path. Specify exact asset verification, rename behavior and interruption guarantees from the chosen native implementation; existence alone is insufficient. Neither an API return nor this document proves power-loss durability/fsync semantics.
4. In a SQLite transaction, commit the recording's media path, annotation revision and completed operation. Confirm durable media availability before displaying **Saved**. Leave any prior committed revision untouched on failure.
5. Cleanup redundant cache/staging artifacts only after commit, as retryable maintenance. Failure of cleanup does not roll back a valid recording; failed promotion/metadata commit remains recoverable and never reports Saved.

Reconciliation on relaunch/retry must be idempotent:

| Observed state | Recovery obligation |
| --- | --- |
| Pending draft, no known output | Show interruption/possible missing output; preserve draft/events. Search only where association is defensible |
| Cache or staging output, pending metadata | Verify and resume promotion with the same operation ID; retain sources on failure |
| Final media, pending metadata | Verify the operation/revision association, then finish the metadata transaction; do not duplicate recording rows |
| Committed metadata/media, redundant temporary files | Return the same saved revision; retry safe cleanup |
| Committed record with missing/corrupt media | Mark unavailable/recoverable, preserve metadata and last good revision; never silently present Saved |
| Unknown orphan or pre-existing destination | Preserve for inspection/recovery; verify identity/completeness instead of overwriting or deleting automatically |

There is a known gap if the process dies before Expo returns and journals its randomly generated cache URI: an orphan may survive but cannot necessarily be associated with the draft, and cache can be purged. Resolve whether a native adapter with a known output destination is needed in C. Do not promise complete recovery of that window. The same caution applies to partial/native-interrupted files.

B/C unit tests must inject failures and relaunch at every journal/copy/verify/promotion/commit/cleanup boundary, including ambiguous commit outcomes, repeated reconciliation, duplicate commands, low storage and last-good-revision preservation. Device tests must later verify actual filesystem, transaction, interruption and capture behavior. Export E reads committed sources and never deletes them on failure/cancellation.

## Verification

Cloud results for this implementation (Node `24.19.0`, npm `11.9.0`, Linux). Final revision/SHA and remote verification are supplied in the PR/job handoff. Commands use `npm_config_cache=/tmp/data-labeller-npm` because the home npm cache is not writable. Expo checks also use `EXPO_NO_TELEMETRY=1`; offline commands use `EXPO_OFFLINE=1 CI=1`.

| Status | Command / check | Outcome and limits |
| --- | --- | --- |
| Passed | `npm ci` | Fresh installation from the committed lockfile; 978 packages installed. No forced peer overrides |
| Passed | `npm run test` / `npm run test:coverage` | 4 unit suites, 13 tests, no skipped tests or snapshots. Root registration, welcome content, mounted boundary, render/lifecycle failure, remount, repeated retry, diagnostics and sink failure are asserted. Coverage includes all 5 owned runtime files; percentages alone are not the acceptance evidence |
| Passed | `npm run typecheck` | Application and test TypeScript checked with strict settings |
| Passed | `npm run lint` | No lint errors or warnings |
| Passed | `npm run check` | Runs full unit suite, types and lint together |
| Passed with offline limit | `npx expo install --check` | Dependencies match the installed SDK table; Expo warns that online validation is unavailable |
| Passed | `npm run bundle:check` | iOS and Android Metro exports produce Hermes `.hbc` bundles and metadata locally; no publishing or native compilation |
| Passed | `npm run prebuild -- --platform all` | Generated both native projects with no install/compile/signing/device. Inspected iOS camera text, absent microphone text and disabled playback background modes; Android camera permission, backup disabled and manifest removals for microphone/legacy storage |
| Passed | `npx expo config --type introspect --json` | Both platform config/plugin expansions completed locally |
| Passed | `git diff --check`, diff/source/document inspection | Whitespace, scope, commands, relative documentation links and exclusions checked; product spec and project rules preserved |
| Failed: network checks | `EXPO_NO_TELEMETRY=1 CI=1 npx --yes expo-doctor@1.20.4` | 19/21 checks passed. Config schema fetch failed with `EAI_AGAIN exp.host`; React Native Directory metadata returned an unexpected response. This is not a full Doctor pass and those online checks remain unverified |
| Not run | Native compilation / Pods / Gradle / local client launch | Native toolchain/runtime validation is deferred; this Linux cloud job did not build a binary |
| Not run | Device/emulator acceptance | Explicitly deferred; iOS first later, then Android. Timing, interruptions, persistence, playback/capture/export and visual/accessibility behavior remain unverified |
| Not run | Integration suite | Excluded by project/user direction; no integration tests added |
| Pending | Independent final-commit review and authorized merge | Parent arranges Astra review; builder opens a draft PR and does not merge |

Earlier setup/test failures were corrected: writable npm cache, offline Expo install, safe-area mock default export, explicit Jest types, matching Jest type version, and test-double/module-cache lifecycle. The initial online Expo install also hit the proxy's Forbidden response. No application check failure remains in the final check set; the two Doctor online checks are reported separately. No payment approval was requested, credits purchased, billing changed, paid service enabled, app signed, deployed or released.
