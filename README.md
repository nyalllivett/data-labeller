# Data Labeller

A local-first mobile app for recording video while marking overlapping labels, then reviewing and exporting the video and annotations.

The target platforms are iOS and Android, with iOS validation first. V1 captures video in the app; importing existing videos is planned for V2.

## Project reference

- [Project rules](AGENTS.md): mandatory reading for every job and review.
- [Product specification](docs/product-spec.md): agreed V1 behavior, deferred work, and open decisions.
- [Delivery plan](docs/delivery-plan.md): small reviewable slices, checks, and acceptance gates.

Every change is made and committed on a numbered branch, independently reviewed, then merged. Unit tests cover all owned logic and component behavior. Integration tests are out of scope for now.

## Current state

Slices A–E are implemented, independently reviewed and parent-merged. Native compilation/unit execution and device acceptance have not run; acceptance and release readiness remain unverified. The existing [later acceptance checklist](docs/delivery-plan.md#later-device-acceptance-and-release-gates) covers iOS first, then Android.

Slice C adds front/rear pre-capture selection, silent video recording, independent overlapping live labels in a horizontal bottom row, fixed Stop, and coordinated local media/annotation save and recovery. Slice D adds saved-recording review, local video above a zoomable per-label timeline, interval-bound/label editing, deletion, explicit Save and session Undo. [PR #5](https://github.com/nyalllivett/data-labeller/pull/5) was independently approved at `4996e21f7aeb5838103c77abafff87774ad95142` and parent-merged as `b1aadebcaa8db948f1556c57c8730b03b1682a48`. Slice E export in [PR #6](https://github.com/nyalllivett/data-labeller/pull/6) was independently approved at `48be12a8357d7ef5b710ff7468a9ca284305c014` and parent-merged as `b3996df0e0147a1b5f938b54892641f4d8f09560`. Its [v1 JSON/ZIP contract and evidence](docs/slice-e.md) were architecture-approved at `2f1c0f877b62a106b40df42a45bbe60136033232` before encoding. See [slice D decisions and verification](docs/slice-d.md), [slice C capture decisions](docs/slice-c.md), [slice B metadata decisions](docs/slice-b.md), and the [initial timing investigation](docs/slice-a.md).

The baseline is Expo `57.0.27`, React Native `0.86.3`, React `19.2.3` and TypeScript `6.0.3`. The lockfile records exact installed versions. Recording uses a small version-pinned Expo Camera `57.0.6` patch and the local CaptureMedia module. Camera permission is checked on entering capture and requested only through the user's Allow action; audio stays off. No permission was requested on an actual device in this cloud work. No backend, authentication, analytics uploader, cloud-build project or paid service is configured.

## Reproducible setup and cloud checks

Use Node `24.19.0` (`.nvmrc`) and npm `11.9.0`. From the repository root:

```sh
node --version
npm --version
npm ci
npm run check
npm run test:coverage
EXPO_NO_TELEMETRY=1 EXPO_OFFLINE=1 CI=1 npx expo install --check
EXPO_NO_TELEMETRY=1 EXPO_OFFLINE=1 CI=1 npm run bundle:check
EXPO_NO_TELEMETRY=1 EXPO_OFFLINE=1 CI=1 npm run prebuild -- --platform all
EXPO_NO_TELEMETRY=1 EXPO_OFFLINE=1 CI=1 npx expo config --type introspect --json
```

The bundle check exports iOS and Android JavaScript/Hermes bytecode into ignored `dist/`; it does not publish anything. Prebuild generates ignored native projects without installing Pods, compiling, signing or launching a device. Native directories are generated from app configuration and dependencies; keep persistent customizations in config/plugins rather than editing generated files.

The JavaScript unit suite uses controlled native/filesystem/transaction doubles. It checks project/name/label rules and UI, capture/Stop transitions, media-position validation, overlaps/gaps, historical names, checkpoints, rollback, ambiguous save completion, retry/relaunch, schema/corruption, permissions, native preparation and exception sanitization. It also checks patched JS camera forwarding, Android's private-path creation/promotion boundary, immutable capture evidence with edited overlays, Apply/Save/Undo, reported playback/seek coordination and timeline/component behavior. Export adds schema/media linkage, original/committed annotation provenance, pending inventories, cancellation/cleanup settlement, identical retry, package verification and share/cache recovery. The current suite passes 41 suites / 358 tests with 100% instrumented owned JS/TS coverage, including fractional playback endpoints and intentional manual replacement; native Swift/Kotlin and real SQLite/player/filesystem behavior are outside that measurement. No integration suite is included. Strict types and zero-warning lint pass.

`npm ci` checks the exact camera version and applies `patches/expo-camera+57.0.6.patch`; do not omit development dependencies or installation scripts. Both platforms explicitly build Expo Camera from source to include these methods. A new camera version requires revisiting the patch and timing contract. Installed media/export additions are FileSystem `57.0.7`, Sharing `57.0.22`, ZIP Archive `9.5.3` and development-only patch-package `8.0.1`. ZIP native dependencies have not compiled here; a rebuilt development client is needed.

In this sandbox, npm's default home cache is not writable. Prefix npm/npx commands with `npm_config_cache=/tmp/data-labeller-npm`, or export that variable. Expo's online compatibility lookup is blocked by the proxy; offline checks use the version table shipped with the installed SDK and explicitly warn that online validation is unavailable. Fresh installation, both bundles, native generation/config/autolinking, units/types/lint pass. Expo Doctor passes 19/21 with two failed remote checks (schema DNS and RN Directory response). See [slice E verification](docs/slice-e.md#verification) for the current passed/failed/not-run outcomes.

For additional native registration/configuration checks without compiling or launching a device:

```sh
npx expo-modules-autolinking resolve --platform apple --json
npx expo-modules-autolinking resolve --platform android --json
npx expo-modules-autolinking react-native-config --platform ios --json
npx expo-modules-autolinking react-native-config --platform android --json
EXPO_NO_TELEMETRY=1 CI=1 npx --yes expo-doctor@1.20.4
```

The local PrivateStorage and CaptureMedia modules, patched camera, Sharing and ZIP Archive must be included in a rebuilt development client. Older A/B clients cannot provide the capture contract. Storage preparation verifies iOS backup exclusion or selects Android's no-backup directory before databases/media open; failure blocks opening and offers Retry. Mocked tests/autolinking do not establish actual filesystem, SQLite, backup or device-transfer behavior. Do not uninstall to resolve a storage error: the local-only data has no cloud recovery copy.

The native policy helpers also have controlled-filesystem unit test sources: a Foundation-only Swift Package XCTest target (macOS with Swift 5.9+) and an Android local JVM/JUnit target. Both target the same helper sources used by the Expo module. On suitable hosts, from the repository root:

```sh
swift test --package-path modules/private-storage
swift test --package-path modules/capture-media
# After the documented Android prebuild, with the Android SDK/JDK installed:
cd android
./gradlew :private-storage:testDebugUnitTest
./gradlew :capture-media:testDebugUnitTest
```

These targets require no device, emulator or signing. They have **not run in this cloud environment**: Swift is absent; Android's Gradle wrapper cannot resolve `services.gradle.org`, and the Android SDK/Kotlin toolchain is absent. JUnit resolution is unverified. Shared native sources cover storage policy plus recording identity/position, native startup Stop, output selection, video-reader failures/cleanup and sanitized errors. Their execution is a separate outstanding check from deferred device QA. See [storage unit details](docs/slice-b.md#native-policy-unit-targets) and [capture verification](docs/slice-c.md#verification).

Names are trimmed Unicode strings without control characters, with no fixed length/count caps. Duplicate names are allowed and IDs remain stable. Recordings snapshot project/active label names; later rename/archive leaves that historical identity/name linkage intact. Archive/restore retains label identity. Project retries retain submitted intent, and an unconfirmed discard locks other pending requests until resolved. Unsaved typing and explicitly failed/uncommitted checkpoints cannot be promised across process death.

Capture writes directly to a pre-associated private persistent staging path. Confirmed finalization, video inspection and media promotion precede the recording/annotation metadata commit and “Saved locally.” Same-ID retry/relaunch preserves pending data and avoids duplicate saves. Interrupted saved clips are identified. A failed annotation checkpoint blocks Back, New recording and recovery of another recording until its sole in-memory copy is staged. When native rejection leaves writer finalization unknown, save only the pending annotations, then fully close/reopen the app before file recovery; JavaScript refresh is insufficient. Unfinished/unreadable video remains pending.

On Android's no-backup path, create the recordings directory through its existing writable private parent and promote via sibling file rename. Generic creation/move APIs check nonexistent targets and fail there in this installed SDK. The adapter verifies directory creation and final bytes; the [inspected source contract and regressions](docs/slice-c.md#private-filesystem-permission-contract) record the evidence and remaining native execution limits.

Live labels use native reported media positions with unquantified tap lag, including cached Android status age. No JavaScript start offset or elapsed-time extrapolation is used. Saved events retain source provenance and unknown lag; intervals are half-open and can overlap, with unlabelled gaps distinct from negatives. Equal sampled times are retained without a minimum duration. Failed label samples retain an untimed intent and visibly mark saved annotations incomplete, including after relaunch. Device timing measurements remain necessary; future correction does not establish capture accuracy.

From a committed project's “Review recordings,” select saved video and inspect intervals from the timeline or interval list. Apply accepts valid field/label changes; Save commits the effective interval document without rewriting capture events, names, timing provenance or untimed failures. Delete is undoable, and Undo after Save creates unsaved changes. Apply or Reset unapplied fields before saving, leaving or selecting another interval. A failed/unconfirmed Save retains its submission and offers only the same Save retry. Undo and unsaved edits last while the recording remains open; process death reopens committed annotations. Missing/changed saved video is an error, with no temporary-media fallback. Reported playback positions share the annotation milliseconds basis; seeking does not confirm displayed-frame arrival or establish physical alignment.

From a committed project’s “Export recordings,” choose one saved recording or all project recordings, then Prepare and explicitly Share. One unencrypted ZIP links videos to versioned UTF-8 JSON, committed reviewed intervals, original capture evidence and untimed failures. Project exports visibly inventory pending recordings without including uncommitted video. Source-read failure blocks the whole package. Cancellation waits for native completion before cache cleanup; retry retains the same frozen payload. Share-sheet return does not confirm delivery. Completed ZIPs remain in cache for recipients and may be evicted by the OS; prepare again from unchanged saved sources. Persistent share launch failure may require full app closure/reopening. Native ZIP creation, integrity/interoperability and receiver access remain unverified.

The startup privacy adapter sanitizes values routed through React Native's pinned exception manager before application import. Fixed local events include storage and capture phase/failure codes. Direct console/native-originated reports, early startup exceptions and development tooling remain outside that bound; no remote uploader is configured. Preserve those limits when debugging with private data.

## Local development builds (later native checks)

After `npm ci`, an installed development client connects to local Metro with:

```sh
EXPO_NO_TELEMETRY=1 npm start
```

Creating the native client locally requires macOS/Xcode for iOS, or the Android SDK/JDK for Android. Expo SDK 57's [official prerequisites](https://docs.expo.dev/versions/v57.0.0/) include Xcode 26.4+ and iOS 16.4+. The scripts `npm run ios` and `npm run android` invoke Expo's local debug build commands. They are documented entry points, **not checks run in this cloud job**. Physical iOS installation may require signing setup, which needs separate authorization; no signing credentials were accessed here. Rebuild the client after native dependencies or plugin configuration change.

Real-device testing is deferred, with iOS first and Android afterwards. Native compilation/unit execution, camera timing, capture interruption, media durability, playback and capture/export acceptance remain unverified. Passing JS units, generation and bundles does not establish native acceptance or release readiness. A JavaScript record request time is not the first recorded frame; the provisional reported-position route makes no frame-accuracy or measured tap-alignment claim.
