# Slice C: capture and independent live labels

## Baseline and scope

Starting/fetched master: `dabff1cb98467d2f6c39c8992f23e2f708c42057`, the parent-authorized slice B merge after Astra approved `e984d51d19a7aaa22f655725a604961006333867`. Clean checkout; next unused branch `0004-capture-labels`. Read AGENTS, README, product spec and delivery plan at that exact revision; no checkout skills were found.

Scope: front/rear selection before capture, silent in-app video capture, horizontal independent overlapping label toggles, fixed Stop, media-relative position samples, persistent staging and coordinated local metadata save/recovery. No review editor, annotation Undo, export, import, integration tests, device QA, paid services, signing, deployment or release. Keep safeguards proportional to reachable actions and real device/storage failure; no general recovery framework.

Implementation and checks are in progress. This checkpoint preserves work; it is not final verification or native acceptance. GPT-6 Astra advised the architecture; independent exact-final-commit review remains the parent's responsibility.

## Media position decision

Use reported native media positions, without a JavaScript start offset or elapsed-time interpolation. iOS reads AVCaptureMovieFileOutput.recordedDuration on the camera session queue. Android retains the current recording's CameraX RecordingStats duration. Native state is reset/bound to the recording ID; source provenance and unknown lag are preserved with the events.

This is a provisional development time basis, not measured physical-tap synchronization. Touch/JS/bridge/queue/media-buffering lag is unquantified; Android's status sample has additional unknown age. No first-frame anchor, frame accuracy, fixed tolerance, or latency compensation is claimed. Positive samples make labels available; Stop is independent of this clock and retains a native start/Stop request. Equal samples preserve event order and zero-length intervals; regressions and positions beyond inspected final media duration remain recovery errors rather than being clamped.

The Expo Camera 57.0.6 install patch exposes on-demand position samples, a known output destination, finalization/interruption evidence and an awaitable recording-specific Stop. Both platforms explicitly build Expo Camera from source; an unchanged precompiled module cannot provide the patched methods. Owned clock/Stop/output/inspection policy lives in the small CaptureMedia module, shared with native unit sources. Dependencies flow ExpoCamera → CaptureMedia → ExpoModulesCore. Camera's version is exact and postinstall rejects mismatch before applying the patch.

## Local save and recovery

Stage a recording row with UUID, project/label-name snapshots, facing, relative media extension and ordered events before camera issuance. Capture directly into its known private persistent `<id>.partial.<ext>` path under the existing prepared PrivateStorage directory. This avoids waiting for a random cache URI to learn the recording's file identity.

Checkpoint accepted toggles in order. On confirmed native finalization, inspect a video track and duration, promote to `<id>.<ext>`, confirm nonempty final bytes, then transactionally insert immutable recording metadata and delete the pending row. Only then report Saved. Full physical durability/fsync, OS backup behavior and codec/playability acceptance remain unverified.

A separate recordings.db retains the reviewed project schema. Retry uses the same recording/path; an already promoted final file or committed row is reconciled without duplication. Save failure keeps pending media/events and previous committed data. Failed annotation checkpoints block clearing the sole in-memory copy until persistence succeeds. A startup Stop before camera issuance cancels only an empty unstarted row. An interrupted finalized clip may be saved with explicit interruption status.

An early native rejection can precede writer teardown, especially iOS view cleanup. Such output is not inspected/promoted in that process. Persist pending annotations and require app restart before recovery, when the prior writer no longer exists. Unfinished/unreadable output remains pending; no readable header alone is treated as finalization proof.

## Verification status

Focused JavaScript unit suites are being added/run for domain, capture coordination, persistence and adapters. A controlled native-ref unit test verifies the installed patched JS methods. Type/lint/full coverage, clean installation, both bundles, generation/config/autolinking and final diff checks remain to be completed at the final revision.

Native XCTest/JUnit sources are added, with shared production helpers and filesystem/media-reader doubles. Compilation/discovery/execution are not run: Swift is absent; Gradle distribution lookup is blocked and Android SDK/toolchain is absent. This native unit execution gap is separate from explicitly deferred iOS-first device QA. No native acceptance or release-readiness claim is made.
