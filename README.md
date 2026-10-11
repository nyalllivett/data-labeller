# Data Labeller

A local-first mobile app for recording video while marking overlapping labels, then reviewing and exporting the video and annotations.

The target platforms are iOS and Android, with iOS validation first. V1 captures video in the app; importing existing videos is planned for V2.

## Project reference

- [Project rules](AGENTS.md): mandatory reading for every job and review.
- [Product specification](docs/product-spec.md): agreed V1 behavior, deferred work, and open decisions.
- [Delivery plan](docs/delivery-plan.md): small reviewable slices, checks, and acceptance gates.

Every change is made and committed on a numbered branch, independently reviewed, then merged. Unit tests cover all owned logic and component behavior. Integration tests are out of scope for now.

## Current state

This repository is being established with project documentation. There is no application scaffold, runtime, or test command yet. React Native, TypeScript, and an Expo development build are the proposed implementation direction; SDK and media-timing capabilities must be verified before implementation decisions are locked.

Real-device testing is deferred for now. Development can proceed with unit tests, type checks, lint, and review; device acceptance remains a separate gate, starting with iOS. No native or frame-accuracy claim has been validated.

See the delivery plan before starting the next job. Add verified setup and check commands here when the scaffold exists.
