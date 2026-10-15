# 180DC Android member client

Initial Expo/React Native implementation, not a production-ready mobile release.

Configure `EXPO_PUBLIC_API_URL` in a local `.env` to your personal API's exact HTTPS origin. It is public configuration, not a secret. There is no fallback to club production. Install root dependencies with `pnpm install`, then run `pnpm --filter mobile start` or `pnpm --filter mobile android` with an Android device/emulator available. Public Cloudflare hosts the API; the Android application runs on the device.

Implemented: member-token exchange for an independent Android-labeled device session, SecureStore credential persistence, stored credential/expiry validation and server validation before restoring protected content, validated Today task/meeting responses with explicit notices when the 100-task or 20-meeting result limit is reached, owned-task completion, refresh on foreground, local/remote logout attempts, and native signed-in device listing/revocation with confirmation. Source tokens are cleared after submission and never intentionally persisted. Theme uses the system color scheme and native text scaling remains enabled. Network/storage failures display errors. No private offline cache is stored.

Run `pnpm --filter mobile check` and `pnpm --filter mobile test`. Generate an Android JavaScript bundle using `pnpm --filter mobile exec expo export --platform android`; this is not an APK, signing/distribution or device acceptance.

Pending: Android emulator/device sign-in and SecureStore tests; safe-area/device lifecycle behavior; session expiry/revocation while foreground; full directory/project/department/meet/task views, guest workspaces, Google linking, contextual files/chat, push permissions/channels and deep links. Account approvals and invitations currently display counts; no native review/action screens yet. No external web link is represented as native feature parity. Template icons and provisional application ID must be reviewed before a signed release.
