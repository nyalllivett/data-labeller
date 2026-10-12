# Slice C: capture and independent live labels

## Baseline, scope and acceptance

Starting/fetched master: `dabff1cb98467d2f6c39c8992f23e2f708c42057`, the parent-authorized slice B merge after Astra approved `e984d51d19a7aaa22f655725a604961006333867`. Clean checkout; next unused branch `0004-capture-labels`. Read AGENTS, README, product spec and delivery plan at that exact revision; no checkout skills were found. The original environment remained usable after its disconnect notification; checkpoint `3fa1ffad3c886bd0718b5673bb5259d7a8742222` preserved the implementation remotely before completing checks.

Scope: front/rear selection before capture, silent in-app video capture, horizontal independent overlapping label toggles, fixed Stop, media-relative position samples, persistent staging and coordinated local metadata save/recovery. No review editor, annotation Undo, export, import, integration tests, device QA, paid services, signing, deployment or release. Keep safeguards proportional to reachable actions and real device/storage failure; no general recovery framework.

Acceptance: meaningful unit tests for owned timing/interval rules, capture coordination, adapters, transactional persistence and component behavior; strict types/lint, reproducible patched installation and both bundles; native unit sources/targets with execution limits recorded; no false Saved state or invented start offset. GPT-6 Astra supplied architecture advice and identified lifecycle gaps that were resolved during implementation. Independent review of the final SHA is still required; advice is not that review. Exact final SHA/PR and remote verification are in the handoff.

## Media position decision and limits

Use **reported native media positions**, without a JavaScript start offset or elapsed-time interpolation. iOS reads AVCaptureMovieFileOutput.recordedDuration on the camera session queue and converts seconds to milliseconds. Android retains the current recording's CameraX RecordingStats duration and converts nanoseconds to milliseconds. Native state is reset/bound to the recording ID; every accepted event stores its reported position and source. Saved metadata identifies this policy and retains `lagBoundMs: null`.

This is a provisional development time basis, **not measured physical-tap synchronization**. Touch delivery, JS scheduling, bridge/queue delay and media buffering are unquantified. Android's cached status sample has additional unknown generation/delivery age. No first-frame anchor, frame accuracy, fixed tolerance or latency compensation is claimed. Later correction does not establish capture accuracy. iOS-first device measurements must assess the actual saved video, labels and playback against an owner-agreed criterion.

Labels become available after a positive current-recording sample. The UI polls every 250 ms only to notice that first usable sample; this cadence does not advance annotation time or establish a tolerance. Each toggle requests its own native sample. Invalid/regressing positions are rejected. A failed sample retains the label intent, failure reason and preceding event count in `annotationFailures`, without creating a timestamp or interval. Finalization waits for an outstanding toggle: valid late samples are checkpointed, and late failures remain explicit even during Stop/saving. Saved videos with such failures show an incomplete-annotations warning, including after relaunch; retrying a later toggle does not erase the failed intent. Equal samples preserve ordered events and zero-length intervals without expansion. Intervals are half-open `[startMs, endMs)`; active intervals close at inspected final media duration. Positions beyond that duration stay a recovery error and are never clamped. Unlabelled gaps do not create negative examples.

Evidence and qualifications:

- Installed Camera `57.0.6` maps to [Expo source at ad1efa3](https://github.com/expo/expo/tree/ad1efa3fa5802156660198ba5d787f91014d8df3/packages/expo-camera). Its public JS API has no live recording clock; inspected iOS session/movie output and Android recording callback provide the extension points. The [camera reference](https://docs.expo.dev/versions/v57.0.0/sdk/camera/) documents temporary output and flip-induced stop. V1 remounts the selected front/rear preview before capture and removes selection controls while active.
- Apple's [recordedDuration API](https://developer.apple.com/documentation/avfoundation/avcapturefileoutput/recordedduration) is the iOS candidate. Its detailed reference page could not be retrieved here; its exact update/finalization behavior and alignment to asset duration are not device-verified. No native start callback is treated as the first frame.
- [CameraX RecordingStats](https://developer.android.com/reference/androidx/camera/video/RecordingStats) documents snapshots, duration in nanoseconds and exclusion of paused intervals. Installed Expo Camera declares CameraX `1.6.0`. Current AndroidX [Recorder source](https://github.com/androidx/androidx/blob/androidx-main/camera/camera-video/src/main/java/androidx/camera/video/Recorder.java) corroborates derivation from encoded video PTS; the released 1.6.0 source/artifact was not retrieved. That corroboration is not pinned binary verification or a measured latency bound.

## Native route and reproducible dependencies

The versioned `patches/expo-camera+57.0.6.patch` adds only the required native boundary: optional known output/recording identity, on-demand position sampling, confirmed finalization/interruption flags and a recording-specific awaitable Stop. A tiny CaptureMedia module owns the testable position/Stop/output/inspection policy; ExpoCamera depends on CaptureMedia, which depends on ExpoModulesCore. There is no dependency back to the camera.

Both platforms select `buildFromSource: ["expo-camera"]`, verified in actual [autolinking](https://docs.expo.dev/modules/autolinking/) output. An unchanged precompiled camera cannot provide these methods. Camera is pinned exactly; postinstall checks its version and applies the patch with failure enabled. A clean `npm ci` exercised this path, and a controlled native-ref unit checks the installed patched JS forwarding. Native compilation/linking of this dependency graph remains unverified.

Actually installed additions: `expo-file-system@57.0.7`, matching the installed Expo 57 compatibility table, and development-only `patch-package@8.0.1` from its [maintained source](https://github.com/ds300/patch-package). FileSystem's installed [native type contract](https://github.com/expo/expo/blob/9e5319c0f821a27b7924841903abae50e2b41790/packages/expo-file-system/src/internal/NativeFileSystem.types.ts) makes directory creation synchronous and File.move asynchronous; promotion awaits the latter. No camera/video/settings cap, audio permission, backend, uploader or paid build project was added. Audio remains off and SDK capture defaults are retained.

Stop is separate from position sampling. Before native issuance, Stop cancels the empty unstarted pending row and does not start capture. After issuance, a small native request/start handshake retains Stop until the actual native recording-start callback, including when no positive media sample exists. This callback is operational state only, not a media-zero anchor. Repeated starts/stops and navigation are guarded while work is active; no generalized command queue was added.

## Local save and recovery

`recording.ts` owns snapshots, ordered toggles, interval finalization and persisted-data validation. Project and label names are snapshotted at recording creation, with stable IDs; later rename/archive does not rewrite those names. `CaptureStore` coordinates one live capture outside the render subtree. Narrow camera/media/repository adapters isolate platform behavior. The shared private-database opener is reused by project and recording repositories.

A separate private `recordings.db` leaves the reviewed project aggregate schema unchanged. Its version-1 tables hold pending drafts and immutable committed recordings. User values are bound parameters. Exclusive transactions own schema creation, checkpoint updates and the final recording/pending deletion. WAL/FULL synchronization is requested, without claiming physical fsync or power-loss guarantees.

1. Prepare a known private persistent `<id>.partial.<ext>` path under PrivateStorage/recordings. Stage a row containing UUID, project/label snapshots, camera facing, relative extension and ordered events **before** camera issuance. Capture directly there, avoiding the random-cache-URI association gap.
2. Checkpoint accepted toggles and untimed failure intents in order. A failed checkpoint retains the newest in-memory draft and requests Stop. Back, New recording and recovery of a different pending recording are blocked until that current draft checkpoints successfully. Same-recording recovery uses the current in-memory draft. This does not promise persistence for an explicitly failed write or process death before it commits.
3. On confirmed native finalization, inspect a video track and positive asset duration, promote to `<id>.<ext>`, and confirm nonempty final bytes. The path is immutable and remains discoverable if the move succeeds before its promise rejects. Inspection does not establish decoded playability, intended capture completeness, atomic rename or physical durability on either OS.
4. Transactionally commit media metadata and derived intervals and delete the pending row. Confirm/reload the committed result, then show Saved. Interruption remains explicit in the saved record/UI. Promotion/commit/read failures retain pending intent and previous saved data; same-ID retry does not duplicate or overwrite a completed recording.

App backgrounding/unmount requests interrupted Stop. Finalized failure/partial output is inspected as an interrupted clip; unusable media remains pending. Unknown native rejection is different: iOS CameraVideoRecording.cleanup can reject before queued writer teardown. A readable header is not finalization proof. Such output is not inspected/promoted in that process; journal-only annotation retry is offered, and file recovery requires fully closing/reopening the app so the previous writer no longer exists. JavaScript refresh alone is not that process restart. Unreadable interrupted movies remain pending; no generic orphan search or automatic deletion is added.

Diagnostics contain fixed capture phase/failure/interruption codes only. Names, media paths, event payloads and raw native errors do not enter owned logs. The existing RN exception-sanitization bound and its native/early-startup/developer-tool limitations remain unchanged.

## Verification

Cloud commands use Node `24.19.0`, npm `11.9.0`, and `npm_config_cache=/tmp/data-labeller-npm`. Offline Expo commands use `EXPO_NO_TELEMETRY=1 EXPO_OFFLINE=1 CI=1`. README contains reproducible commands; final unit/type/lint results are rerun at the final SHA.

| Status | Command | Outcome |
| --- | --- | --- |
| Passed | `npm ci` | Fresh 994-package installation; camera version check and patch applied successfully |
| Passed | `npm run check` | 23 JavaScript suites / 207 tests, strict types, zero-warning lint |
| Passed | `npm run test:coverage` | 100% instrumented owned JS/TS statements/branches/functions/lines; no skips/snapshots; type-only interfaces contain no executable code |
| Passed with offline limit | `npx expo install --check` | Matches installed Expo SDK table; online compatibility verification unavailable |
| Passed | `npm run bundle:check` | Both iOS and Android Hermes artifacts inspected; local export only |
| Passed | `npm run prebuild -- --platform all` | Both native projects generated without installing/compiling/signing |
| Passed | `npx expo config --type introspect --json` | Plugin/config expansion |
| Passed | Both `expo-modules-autolinking resolve` platforms | PrivateStorage/CaptureMedia registered; camera source-build selection present |
| Passed | Diff/whitespace, links/anchors, lock consistency, tracked sources | Scope and documentation inspected |
| Failed: external lookup | `EXPO_NO_TELEMETRY=1 CI=1 npx --yes expo-doctor@1.20.4` | Attempt and retry: 19/21; schema `EAI_AGAIN exp.host`, RN Directory unexpected response |
| Not run: toolchain | `swift test --package-path modules/capture-media` | Attempted: Swift absent; 10 XCTest methods supplied, not compiled/discovered/executed |
| Not run: bootstrap/toolchain | In generated android: `GRADLE_USER_HOME=/tmp/data-labeller-gradle ./gradlew :capture-media:testDebugUnitTest --offline` | Attempted: distribution DNS `UnknownHostException: services.gradle.org` before Gradle; 10 JUnit methods supplied, resolution/configuration/compilation/execution unverified; Android SDK absent |
| Not run | Native app compilation/linking, device/emulator and acceptance | Deferred/unavailable; iOS first later |
| Not run | Integration suite | Excluded by user/project direction |

Unit assertions cover overlap/gaps, equal positions, identity/name snapshots, invalid/late/regressing samples, unavailable first position, startup cancellation/Stop, late accepted toggles and failed untimed intents, checkpoint serialization/failure, cross-recording recovery guards, interrupted and unconfirmed finalization, save boundaries, transaction rollback/ambiguous completion, same-ID retry/relaunch, corrupted/schema data, permission/preview failures, independent highlighting, incomplete-annotation warnings, fixed Stop placement and navigation. Transaction/native/filesystem doubles do not execute SQLite or prove OS behavior. The patched JS wrapper unit exercises a controlled native ref only.

Native policy sources use the same production helpers: 10 Foundation/XCTest methods and 10 local JVM/JUnit methods specify recording reset/identity, unit conversion, terminal/unavailable samples, Stop before/after native start, output selection, media-reader failures/cleanup and fixed error normalization. Their execution gap is separate from deferred device QA. Native SDK wiring, actual filesystem/backup/low-storage behavior, codecs/playability, timing lag, interruption outcomes, camera orientation and visual/accessibility acceptance remain unverified. No full-platform coverage, native acceptance or release readiness is claimed.

Preliminary independent Astra review of checkpoint `3fa1ffad3c886bd0718b5673bb5259d7a8742222` found two issues: switching pending recovery could discard an uncheckpointed current event, and an outstanding sample rejection after Stop could be hidden by Saved. Both are resolved with explicit guards/failure metadata and focused logic/component regressions. Independent Astra review of the exact final revision and authorized merge remain pending. No paid mode/API, credit purchase, billing/account change, signing, deployment or release was performed.
