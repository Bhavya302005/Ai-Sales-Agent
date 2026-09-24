# SignalPath mobile (Android + iOS)

Native Android and iOS apps for the SignalPath web app, built with [Capacitor 8](https://capacitorjs.com/).

## How it works

`apps/web` uses Next.js server actions, route handlers and `output: "standalone"`, so it
can't be exported as static files and bundled into the app. The native apps instead
open the deployed Next.js server in a WebView (`server.url` in
[capacitor.config.ts](capacitor.config.ts)). As a result:

- Web deploys show up in the apps right away. You don't need a new store build unless
  native config changes.
- `www/index.html` is the offline and error page that ships inside the app.
- The server URL defaults to `https://ai-sales-agent.vercel.app`. Override it at sync time
  with `CAP_SERVER_URL`.

This package is kept **out of the pnpm workspace** on purpose, so CI's
`pnpm install --frozen-lockfile` doesn't change. It uses npm.

## Prerequisites

| Platform | Requirements |
| --- | --- |
| Android | Android Studio (bundles JDK 21), Android SDK 36. From the CLI, set `JAVA_HOME` to a **JDK 21**. JDK 17 fails with `invalid source release: 21`. |
| iOS | macOS with Xcode 26+. Dependencies use Swift Package Manager, so CocoaPods isn't needed. |

## Commands

```bash
cd apps/mobile
npm install

npm run sync            # copy config/web assets into both native projects
npm run open:android    # open in Android Studio
npm run open:ios        # open in Xcode (macOS only)
npm run run:android     # build + launch on a device/emulator
npm run assets          # regenerate icons/splash from the logo in assets/generate-sources.cjs
```

From the repo root you can also run `npm run mobile:sync`, `npm run mobile:android` and
`npm run mobile:ios`.

### Point the app at a local dev server

```bash
# terminal 1 (repo root)
pnpm dev:web

# terminal 2: Android emulator reaches the host at 10.0.2.2
CAP_SERVER_URL=http://10.0.2.2:3000 npx cap sync android && npx cap run android
# iOS simulator shares the host network
CAP_SERVER_URL=http://localhost:3000 npx cap sync ios && npx cap run ios
```

PowerShell: `$env:CAP_SERVER_URL="http://10.0.2.2:3000"; npx cap sync android`.
Run `npm run sync` again without the variable before you make a release build.

## Backend CORS

Server actions run on the Next.js server, so most API traffic doesn't come from the
WebView. Any browser-side `fetch`/WebSocket calls to the API and voice services come from
the web origin, which is already in `ALLOWED_ORIGINS`. If you point `CAP_SERVER_URL`
at a different host, add that origin to `ALLOWED_ORIGINS` / `WEB_ORIGIN`.

## Native permissions

- **Microphone** (Voice Lab `getUserMedia`): `RECORD_AUDIO` and `MODIFY_AUDIO_SETTINGS`
  in `android/app/src/main/AndroidManifest.xml`, and `NSMicrophoneUsageDescription` in
  `ios/App/App/Info.plist`.

## Release builds

- **Android:** in Android Studio, use *Build → Generate Signed App Bundle*. Bump
  `versionCode`/`versionName` in `android/app/build.gradle`.
- **iOS:** in Xcode, set your Team under *Signing & Capabilities*, then *Product →
  Archive*. Bump the version and build under *General*.
- App ID / bundle ID: `com.signalpath.salesagent`. Change it in `capacitor.config.ts`
  *before* you publish. Changing it later also means editing the native projects.
