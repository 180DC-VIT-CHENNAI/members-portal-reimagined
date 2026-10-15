# ADR-006 — Android client foundation

Status: decided for the initial client; release acceptance remains open.
Date: 8 October 2026.

## Context and decision

Build the Android client in `apps/mobile` with Expo/React Native and TypeScript, sharing the canonical member APIs and authorization policy. The generated SDK 57 scaffold supplies compatible native package versions; the workspace lockfile records the installed versions. This is an initial member client, not full Android parity.

Use custom backend device sessions. Member-token sign-in exchanges through `/api/auth/session` with an Android device label. Only the resulting session is persisted through Expo SecureStore; the source token is cleared after submission. There is no backend or auth-provider replacement. Native Google linking is deferred until a proof-backed OAuth/deep-link flow is implemented and tested.

Require an explicit exact HTTPS `EXPO_PUBLIC_API_URL`; never fall back to the club host. Public configuration contains no secret. Android binaries execute on devices; Cloudflare hosts the shared API/data services, not the Android runtime.

## Alternatives

Native Kotlin/Compose remains viable but would require a separate client implementation and toolchain. Expo enables a TypeScript client with native storage and platform integrations while retaining native-build escape hatches. A WebView-only wrapper was not selected because it cannot establish the requested native workflow parity. This choice is based on implementation fit, not an Android usability or performance comparison.

## Security and lifecycle

The client verifies saved access with the server before restoring protected content. API 401 clears the visible session/queue; source revocation and current role/resource access remain authoritative on the backend. Session expiry clears local access and late responses cannot repopulate the queue after teardown. Logout attempts local deletion and server revocation independently and reports incomplete outcomes. No private persistent content cache is implemented.

Expo documents Android SecureStore encryption via the platform Keystore and the need to exclude restored encrypted values from automatic backup. Use its default backup configuration and verify generated native behavior on a device before release. Do not treat module tests as proof of actual secure storage. [SecureStore documentation](https://docs.expo.dev/versions/latest/sdk/securestore/).

Initial navigation/work is Today, with owned-task completion and upcoming meeting links. Invitations and board approvals currently show counts only. System dark/light colors and native text scaling are implemented; safe-area, focus, font-scale and touch acceptance still need device evidence.

## Verification and consequences

Mobile TypeScript check, three transport tests and Android JavaScript export passed in credential-free Boat. The existing web build still passes with the added workspace dependencies. Export establishes bundling, not an APK, signed release, installability or emulator interaction.

Before release, test token sign-in, process restart, Keystore persistence, logout while offline, storage errors, expiry during requests, server revocation, foreground role changes and background/foreground transitions on Android. Add device file picking/sharing, push permissions/channels, deep links, guest scope and workflow screens against shared API contracts. Review provisional application ID/icons before signing and publishing.

## Compatibility and migration

No existing backend data, routes or web authentication is changed. Mobile uses additive session/work-queue APIs already verified locally. No Expo account, EAS build, signing identity, paid service or store distribution has been configured. Personal production origin and release credentials remain deployment prerequisites. [Expo project setup](https://docs.expo.dev/get-started/create-a-project/).

## Conditions for reconsideration

Revisit this stack if device experiments reveal unsupported workflow/native requirements or unacceptable performance/accessibility. Do not equate a successful bundle with mobile parity; track each capability and its permission/acceptance evidence separately.
