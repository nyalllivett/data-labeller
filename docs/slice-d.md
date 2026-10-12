# Slice D: recording review, interval editing and Undo

## Baseline, scope and acceptance

Fetched/read master `4af3e4f16a82ac176f158dd192c188ec79ff7978`, the parent merge of PR #4 after independent Astra approval of `98fa9fb55f22d8713d3f1fb828a5cbad109a19fa`. Clean start; next unused branch `0005-review-editor`. Read AGENTS, README, product spec and delivery plan at that exact revision. No relevant checkout skills exist.

Scope: saved-recording selection, local video above a zoomable common-scale per-label timeline, interval inspection, start/end changes, relabelling to captured label identities, deletion and Undo. Preserve immutable original capture events/intervals, names, timing provenance and untimed failure information. No new interval creation or claim that review resolves missing/untimed annotations; keep their warnings. Export remains E, import remains V2. No integration/device testing, native signing, publishing, paid services or deployment.

Acceptance: meaningful deterministic units for domain validation, overlay persistence, Apply/Save/Undo and navigation/retry transitions, playback conversion/coordination and component behaviour. Required installation, full unit/type/lint/coverage, both bundles and config checks must match the final revision. Source inspection does not establish native playback/seek or physical alignment. Independent Astra review and the parent's merge decision remain separate.

## Edit and save model

A sidecar `annotations.db` stores the full effective interval document per recording. No row means the immutable capture baseline; a persisted empty list means all intervals were deleted. Database errors never fall back to original annotations. Each original interval's ordinal is its stable ID within that recording, retained through edits, deletion/Undo and relabelling; current sort/list indices are not identity.

Apply validates an interval and accepts it into the in-memory document; Delete is another undoable document change. Bounds are finite `0 <= startMs <= endMs <= capturedDurationMs`, with known captured label IDs and unique interval IDs. Equal boundaries and overlaps remain valid; no snapping, minimum length or media/storage caps are introduced. Invalid/no-op edits add no history. Untouched field text preserves the exact stored doubles, including during relabelling. Changed seconds text shifts decimal units before a single numeric parse: entering `2.007` seconds at a 2007 ms endpoint does not introduce multiplication overshoot. This is unit conversion, not a tolerance or snap.

Save is explicit, updates the committed baseline/revision and retains session Undo history. Undo after Save creates unsaved changes. Switching recording clears history only when there are no accepted unsaved edits or unapplied form changes. Unapplied fields require Apply or Reset before Save/navigation/Undo. Session edits/Undo are not promised across process death; reopening uses the last committed overlay.

A Save freezes one expected revision, target revision and canonical payload. One exclusive transaction accepts the expected revision, or treats an already-committed target revision with identical payload as retry success; other data is a conflict. Failed/ambiguous saves retain that frozen intent and disable editing, Undo and navigation until Retry confirms it. No generalized editor framework or extra journal is needed.

## Playback and timeline boundary

Installed Expo Video `57.0.5` (`gitHead` verified from the registry: `9349d1457178dd9cccb8bdd3aed47473c49134e1`) remains the locked dependency; D adds no packages. The [official SDK 57 documentation](https://docs.expo.dev/versions/v57.0.0/sdk/video/) and installed sources were inspected, rather than inferring a native contract from doubles:

- [Player API](https://github.com/expo/expo/blob/9349d1457178dd9cccb8bdd3aed47473c49134e1/packages/expo-video/src/VideoPlayer.types.ts) and [events](https://github.com/expo/expo/blob/9349d1457178dd9cccb8bdd3aed47473c49134e1/packages/expo-video/src/VideoPlayerEvents.types.ts): `currentTime`, duration and `timeUpdate.currentTime` are seconds. Current-time assignment requests a seek; update emission needs a nonzero interval.
- [Android currentTime](https://github.com/expo/expo/blob/9349d1457178dd9cccb8bdd3aed47473c49134e1/packages/expo-video/android/src/main/java/expo/modules/video/VideoModule.kt#L106) reads `currentPosition / 1000f`, whereas [time updates](https://github.com/expo/expo/blob/9349d1457178dd9cccb8bdd3aed47473c49134e1/packages/expo-video/android/src/main/java/expo/modules/video/player/VideoPlayer.kt#L544) divide by `1000.0`. The setter queues ExoPlayer `seekTo((seconds * 1000).toLong())`.
- [iOS currentTime](https://github.com/expo/expo/blob/9349d1457178dd9cccb8bdd3aed47473c49134e1/packages/expo-video/ios/VideoPlayer.swift#L42) reads AVPlayer seconds and passes a CMTime to the SDK seeker. [Periodic observation](https://github.com/expo/expo/blob/9349d1457178dd9cccb8bdd3aed47473c49134e1/packages/expo-video/ios/VideoPlayerObserver.swift#L375) reports player time.
- [useVideoPlayer](https://github.com/expo/expo/blob/9349d1457178dd9cccb8bdd3aed47473c49134e1/packages/expo-video/src/VideoPlayer.tsx#L45) owns and releases the native player for a source. The view uses the known local URI with caching off, muted audio and background/PiP disabled by existing config.

The narrow adapter converts reported seconds to annotation milliseconds. Seeking remains a request, not displayed-frame confirmation. Keep SDK seek defaults and make no frame/tolerance claim. The chosen 0.25-second update interval is a display cadence only; annotation edits use reported positions without JavaScript interpolation.

Use reported positions for the playhead and any boundary-from-playback action. Captured duration remains the validation basis; loading duration zero or a differing player duration does not rescale annotations. Scope listeners to the selected recording, remove them on unmount/switch and resolve only the known saved media path without promotion/recovery. Native playback, interruption, seeking and media alignment remain unverified until later iOS-first device acceptance.

Native float conversion can report a position just beyond captured bounds. Position eligibility is separate from player availability: reject that position for playhead/boundary assignment, retain controls and recover when a valid report arrives. Do not clamp it or latch a permanent playback error. Genuine player/control failures request a best-effort Pause, keep Pause available while reported playback continues, and offer player recreation without losing edits. Stale seek requests clear on recording switch, including A→B→A. A consumed request is not replayed merely because buffering ends.

Each captured label retains a track, including empty tracks. All tracks/playhead share one visible time window. Zero-length intervals have selectable markers; display hit sizes do not expand stored duration. An accompanying interval list preserves individual selection for overlapping intervals.

## Boundaries, recovery and diagnostics

Pure [annotation rules](../src/review/annotations.ts) and [timeline geometry](../src/review/timeline.ts) stay separate from the small [ReviewStore](../src/review/ReviewStore.ts), [annotation repository](../src/review/SqliteAnnotationRepository.ts) and [playback controller](../src/review/PlaybackController.ts). UI consumes these boundaries; the existing recording repository, private database opener, media path rules and render-retry boundary are reused. The store lives outside the render subtree, so a render retry does not discard accepted edits or save intent.

The sidecar requests WAL/FULL synchronization and uses bound values. It changes neither the reviewed recording database schema nor media. Read-only media resolution checks the known final file and its committed byte size; missing/changed final media is a fixed error, with no staging fallback, scan, creation or promotion. Capture's coordinated promotion/metadata recovery remains C's responsibility. Native SQLite/backup/power-loss durability is still unverified.

Failed reads, unsupported schemas, corrupt rows, conflicts and media/player failures remain explicit; no automatic reset or overwritten capture evidence. Retry opening reloads annotations and resolves media; Retry Save retains the identical submission. Fixed local review transition/failure codes contain no project/label names, paths, media or raw exception data. Existing exception-sanitization limits still apply.

## Verification

Installation and checks ran in this cloud on Node `24.19.0` / npm `11.9.0`. Prefix npm/npx with `npm_config_cache=/tmp/data-labeller-npm`; offline Expo checks use `EXPO_NO_TELEMETRY=1 EXPO_OFFLINE=1 CI=1`. Reproducible commands are in the README.

| Status | Command/check | Outcome |
| --- | --- | --- |
| Passed | `npm ci` | Fresh 994-package install; pinned camera version check and patch succeed; lockfile unchanged |
| Passed | `npm run check` | 33 JavaScript unit suites / 287 tests, strict types, zero-warning lint |
| Passed | `npm run test:coverage` | Same 287 tests; 100% instrumented owned JS/TS statements/branches/functions/lines; no skips or snapshots |
| Passed with offline limit | `npx expo install --check` | Installed SDK compatibility table matches; online validation unavailable |
| Passed | `npm run bundle:check` | Local iOS and Android Hermes exports; no upload/publish |
| Passed | `npm run prebuild -- --platform all` | Both ignored native projects generated without install, compilation, signing or launching |
| Passed | `npx expo config --type introspect --json` | Silent camera config, no iOS background audio, Android backup disabled and external-storage/audio permissions removed |
| Passed | `expo-modules-autolinking resolve --platform apple/android --json` | Camera/player and both local modules registered; both configurations select camera source builds |
| Passed | Diff/whitespace, local links, tracked-source/lock checks | Slice D scope and C review/merge evidence inspected |
| Failed: external checks | `EXPO_NO_TELEMETRY=1 CI=1 npx --yes expo-doctor@1.20.4` | 19/21; Expo schema lookup `EAI_AGAIN exp.host`, RN Directory unexpected server response |
| Not run: native/toolchain | Swift/Kotlin policy unit targets and native app compilation/linking | D adds no native code; existing B/C unit sources remain unexecuted. Swift/Kotlin/Android SDK are absent; C's Gradle bootstrap DNS failure remains documented separately |
| Not run: deferred | Device/emulator, physical playback/seek/timing alignment and acceptance | iOS first later; no native acceptance or release readiness claim |
| Not run: excluded | Integration suite | Excluded by user/project direction |

Deterministic units cover stable identity, immutable capture evidence, numeric bounds/conversion, overlaps/zero-length intervals, missing-versus-empty overlays, schema/read/migration failure, rollback and commit-before-rejection/idempotent retry. Store/component units cover Apply/Reset/Save/Undo including Undo after Save, unapplied-field/navigation guards, repeated actions, loading/failure/retry, record switching and incomplete/interrupted capture warnings. Controlled player units cover seconds conversion, readiness, seek request versus reported position, float overshoot/recovery, Pause after failure, listener cleanup/stale callbacks and retry without losing edit scope. Timeline units cover shared zoom/pan/window geometry, empty label tracks, overlapping selection, endpoint markers and playhead eligibility. These tests execute no real SQLite, camera, player or OS filesystem.

Both final platform artifacts are present in ignored `dist/`: Android `index-879c2d546a0e92b0d7406390f89b90f5.hbc` and iOS `index-e22e630ba6623dfea992a0a82721e418.hbc` (about 1.8 MB each). They establish bundling only.

## Review and remaining acceptance

Implementation and cloud verification are complete on `0005-review-editor` in draft [PR #5](https://github.com/nyalllivett/data-labeller/pull/5); exact final SHA and remote verification are in the handoff/PR. GPT-6 Astra architecture advice informed the model and identified Pause/position eligibility and stale-seek issues; both are resolved with focused regression units. Advice is separate from the parent's pending independent exact-SHA review and merge decision. No known implementation findings remain from that advice.

Native player initialization/control/event delivery, decoding, actual seek behavior, visual/accessibility usability, filesystem/SQLite durability and camera-to-playback timing alignment remain unverified. No timing tolerance or storage cap is invented. Later iOS-first device acceptance must record exact commit/device/OS and agreed criteria. No paid API/mode, purchase/credit spend, billing change, signing, deployment or release occurred.
