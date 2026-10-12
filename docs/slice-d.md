# Slice D: recording review, interval editing and Undo

## Baseline, scope and acceptance

Fetched/read master `4af3e4f16a82ac176f158dd192c188ec79ff7978`, the parent merge of PR #4 after independent Astra approval of `98fa9fb55f22d8713d3f1fb828a5cbad109a19fa`. Clean start; next unused branch `0005-review-editor`. Read AGENTS, README, product spec and delivery plan at that exact revision. No relevant checkout skills exist.

Scope: saved-recording selection, local video above a zoomable common-scale per-label timeline, interval inspection, start/end changes, relabelling to captured label identities, deletion and Undo. Preserve immutable original capture events/intervals, names, timing provenance and untimed failure information. No new interval creation or claim that review resolves missing/untimed annotations; keep their warnings. Export remains E, import remains V2. No integration/device testing, native signing, publishing, paid services or deployment.

Acceptance: meaningful deterministic units for domain validation, overlay persistence, Apply/Save/Undo and navigation/retry transitions, playback conversion/coordination and component behaviour. Required installation, full unit/type/lint/coverage, both bundles and config checks must match the final revision. Source inspection does not establish native playback/seek or physical alignment. Independent Astra review and the parent's merge decision remain separate.

## Edit and save model

A sidecar `annotations.db` stores the full effective interval document per recording. No row means the immutable capture baseline; a persisted empty list means all intervals were deleted. Database errors never fall back to original annotations. Each original interval's ordinal is its stable ID within that recording, retained through edits, deletion/Undo and relabelling; current sort/list indices are not identity.

Apply validates an interval and accepts it into the in-memory document; Delete is another undoable document change. Bounds are finite `0 <= startMs <= endMs <= capturedDurationMs`, with known captured label IDs and unique interval IDs. Equal boundaries and overlaps remain valid; no snapping, minimum length or media/storage caps are introduced. Invalid/no-op edits add no history. Stored values are not rounded by display formatting.

Save is explicit, updates the committed baseline/revision and retains session Undo history. Undo after Save creates unsaved changes. Switching recording clears history only when there are no accepted unsaved edits or unapplied form changes. Unapplied fields require Apply or Reset before Save/navigation/Undo. Session edits/Undo are not promised across process death; reopening uses the last committed overlay.

A Save freezes one expected revision, target revision and canonical payload. One exclusive transaction accepts the expected revision, or treats an already-committed target revision with identical payload as retry success; other data is a conflict. Failed/ambiguous saves retain that frozen intent and disable editing, Undo and navigation until Retry confirms it. No generalized editor framework or extra journal is needed.

## Playback and timeline boundary

Installed Expo Video `57.0.5` (`gitHead` `9349d1457178dd9cccb8bdd3aed47473c49134e1`) exposes currentTime and timeUpdate in seconds. The adapter converts to the same milliseconds domain as annotations. Current-time assignment requests a seek; it is not displayed-frame confirmation. Android source converts requested seconds to integer milliseconds and delegates to ExoPlayer; iOS delegates to the SDK seeker. Keep SDK seek defaults and make no frame/tolerance claim. A nonzero update interval controls display refresh only.

Use reported positions for the playhead and any boundary-from-playback action. Captured duration remains the validation basis; loading duration zero or a differing player duration does not rescale annotations. Scope listeners to the selected recording, remove them on unmount/switch and resolve only the known saved media path without promotion/recovery. Native playback, interruption, seeking and media alignment remain unverified until later iOS-first device acceptance.

Each captured label retains a track, including empty tracks. All tracks/playhead share one visible time window. Zero-length intervals have selectable markers; display hit sizes do not expand stored duration. An accompanying interval list preserves individual selection for overlapping intervals.

## Progress and verification

Architecture advice from GPT-6 Astra is recorded in the model above; it is not independent acceptance review. Unfinished implementation checkpoint: annotation domain and transactional sidecar, stable review store/Apply/Save/Undo guards, read-only saved media resolver, playback adapter/controller, review selection and initial editor/timeline UI are implemented. Domain/persistence/store and playback coordination units pass; the initial screen units and strict types pass. Full coverage, dedicated native-player/timeline component units, bundle/config/install verification and final diff review remain in progress. Actual blockers remain the documented absent Swift/Android toolchains and deferred native/device acceptance, not a newly discovered playback SDK limitation. Outcomes, exact final SHA/PR and remaining blockers will be recorded before final handoff.
