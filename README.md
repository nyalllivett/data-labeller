# Data Labeller

A local-first mobile app for recording video while marking overlapping labels, then reviewing and exporting the video and annotations.

The target platforms are iOS and Android, with iOS validation first. V1 captures video in the app; importing existing videos is planned for V2.

## Project reference

- [Project rules](AGENTS.md): mandatory reading for every job and review.
- [Product specification](docs/product-spec.md): agreed V1 behavior, deferred work, and open decisions.
- [Delivery plan](docs/delivery-plan.md): small reviewable slices, checks, and acceptance gates.

Every change is made and committed on a numbered branch, independently reviewed, then merged. Unit tests cover all owned logic and component behavior. Integration tests are out of scope for now.

## Current state

Slice A is merged. Slice B adds project creation/rename and custom label add/rename/archive/restore with local SQLite metadata, recoverable save/retry states and submitted-change reconciliation. Recording, video review, annotation editing/Undo and export remain later slices. See the [slice B decisions and verification](docs/slice-b.md) and the [timing/media recovery investigation](docs/slice-a.md).

The baseline is Expo `57.0.27`, React Native `0.86.3`, React `19.2.3` and TypeScript `6.0.3`. The lockfile records exact installed versions. Camera/playback dependencies and native plugins are present for subsequent slices; this shell does not invoke them or request permissions. No backend, authentication, analytics uploader, cloud-build project or paid service is configured.

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

The unit suite uses controlled native doubles. It checks project/name/label rules, stable IDs, archive/restore, UI behavior, loading/save/failure states, staged operations, transactional rollback, ambiguous completion, same-request retry, relaunch reconciliation, conflicts, corruption, schema guards, native-preparation coordination and exception sanitization. No integration suite is included. Types check application and test files under strict settings; lint rejects warnings.

In this sandbox, npm's default home cache is not writable. Prefix npm/npx commands with `npm_config_cache=/tmp/data-labeller-npm`, or export that variable. Expo's online compatibility lookup is blocked by the proxy; offline checks use the version table shipped with the installed SDK and explicitly warn that online validation is unavailable. See [slice B verification](docs/slice-b.md#verification) for exact outcomes and limitations.

For additional native registration/configuration checks without compiling or launching a device:

```sh
npx expo-modules-autolinking resolve --platform apple --json
npx expo-modules-autolinking resolve --platform android --json
EXPO_NO_TELEMETRY=1 CI=1 npx --yes expo-doctor@1.20.4
```

The local `PrivateStorage` Expo module must be included in a rebuilt development client. The old slice A client cannot open the new workspace. Storage preparation verifies iOS backup exclusion or selects Android's no-backup directory before SQLite opens; failure blocks opening and offers Retry. Mocked tests/autolinking do not establish actual filesystem, SQLite, backup or device-transfer behavior. Do not uninstall to resolve a storage error: the local-only database has no cloud recovery copy.

Names are trimmed Unicode strings without control characters, with no fixed length/count caps. Duplicate names are allowed and identifiers remain stable. Archiving retains labels; restoring reuses the ID. Submitted saves use one immutable request ID for retry, and conflicts preserve the saved revision and pending change. Unsaved typing and a submission that never staged cannot survive process death. “Saved locally” appears only after the repository confirms commit and reloads the committed metadata; no recording/media Saved state exists yet.

The startup privacy adapter sanitizes values routed through React Native's pinned exception manager before application import. Fixed local events include storage phase/failure codes. Direct console/native-originated reports, early startup exceptions and development tooling remain outside that bound; no remote uploader is configured. Preserve those limits when debugging with private data.

## Local development builds (later native checks)

After `npm ci`, an installed development client connects to local Metro with:

```sh
EXPO_NO_TELEMETRY=1 npm start
```

Creating the native client locally requires macOS/Xcode for iOS, or the Android SDK/JDK for Android. Expo SDK 57's [official prerequisites](https://docs.expo.dev/versions/v57.0.0/) include Xcode 26.4+ and iOS 16.4+. The scripts `npm run ios` and `npm run android` invoke Expo's local debug build commands. They are documented entry points, **not checks run in this cloud job**. Physical iOS installation may require signing setup, which needs separate authorization; no signing credentials were accessed here. Rebuild the client after native dependencies or plugin configuration change.

Real-device testing is deferred, with iOS first and Android afterwards. Native compilation, camera timing, capture interruption, media durability, playback and capture/export acceptance remain unverified. Passing unit tests, generation and bundles does not establish native acceptance or release readiness. A JavaScript record request time is not the first recorded frame; no live capture mapping or frame-accuracy claim is implemented.
