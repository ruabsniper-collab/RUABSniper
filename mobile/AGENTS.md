# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v54.0.0/ before writing any code.

Pinned to SDK 54 deliberately, not "latest" (was on 57, downgraded 2026-08-31): as of that date the iOS
**Expo Go app on the App Store is stuck at its SDK-54 build** (last updated Sept 2025) even though Expo has
shipped SDKs 55/56/57 since — Expo Go's real-device iOS releases only reach people through the App Store
(the `expo-go-releases` GitHub repo only publishes an `.apk` for Android and a `.tar.gz` iOS **Simulator**
build, no real-device ipa). A project on a newer SDK than the store's Expo Go build fails to open with a
misleading "install the latest version" error even when Expo Go actually is the latest App Store release.
Before bumping this project's `expo` version again, check the store's actual current version against
https://exp.host/--/api/v2/versions (its `sdkVersions` map) — don't just take "latest on npm" at face value.
