# Data Labeller

A local-first mobile app for recording video while marking overlapping labels, then reviewing and exporting the video and annotations.

The target platforms are iOS and Android, with iOS validation first. V1 captures video in the app; importing existing videos is planned for V2.

## Project reference

- [Project rules](AGENTS.md): mandatory reading for every job and review.
- [Product specification](docs/product-spec.md): agreed V1 behavior, deferred work, and open decisions.
- [Delivery plan](docs/delivery-plan.md): small reviewable slices, checks, and acceptance gates.

Every change is made and committed on a numbered branch, independently reviewed, then merged. Unit tests cover all owned logic and component behavior. Integration tests are out of scope for now.

## Current state

Slice A establishes a React Native/TypeScript/Expo development-build scaffold with a welcome screen, retryable render-error handling and local structured diagnostics. Projects, labels, capture, editing/Undo and export are not implemented yet. See the [architecture, timing and recovery decision](docs/slice-a.md) for installed SDK evidence, proposed adapters and remaining feasibility questions.

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

The unit suite uses controlled native doubles from Jest Expo and safe-area context. It covers welcome content, app error-boundary wiring, render/lifecycle failure, successful remount, repeated retry and privacy-safe diagnostics including a broken sink. No integration suite is included. Types check application and test files under strict settings; lint rejects warnings.

In this sandbox, npm's default home cache is not writable. Prefix npm/npx commands with `npm_config_cache=/tmp/data-labeller-npm`, or export that variable. Expo's online compatibility lookup is blocked by the proxy; offline checks use the version table shipped with the installed SDK and explicitly warn that online validation is unavailable. See [slice A verification](docs/slice-a.md#verification) for exact outcomes and limitations.

## Local development builds (later native checks)

After `npm ci`, an installed development client connects to local Metro with:

```sh
EXPO_NO_TELEMETRY=1 npm start
```

Creating the native client locally requires macOS/Xcode for iOS, or the Android SDK/JDK for Android. Expo SDK 57's [official prerequisites](https://docs.expo.dev/versions/v57.0.0/) include Xcode 26.4+ and iOS 16.4+. The scripts `npm run ios` and `npm run android` invoke Expo's local debug build commands. They are documented entry points, **not checks run in this cloud job**. Physical iOS installation may require signing setup, which needs separate authorization; no signing credentials were accessed here. Rebuild the client after native dependencies or plugin configuration change.

Real-device testing is deferred, with iOS first and Android afterwards. Native compilation, camera timing, capture interruption, media durability, playback and capture/export acceptance remain unverified. Passing unit tests, generation and bundles does not establish native acceptance or release readiness. A JavaScript record request time is not the first recorded frame; no live capture mapping or frame-accuracy claim is implemented.
