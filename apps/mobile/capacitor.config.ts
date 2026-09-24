import type { CapacitorConfig } from "@capacitor/cli";

// The web app relies on Next.js server actions and route handlers, so it cannot be
// statically exported into the native bundle. The native shells load the deployed
// Next.js server instead. Override with CAP_SERVER_URL when running `cap sync`, e.g.
//   CAP_SERVER_URL=http://10.0.2.2:3000 npx cap sync android   (Android emulator -> local dev)
//   CAP_SERVER_URL=http://localhost:3000 npx cap sync ios      (iOS simulator -> local dev)
const serverUrl = process.env.CAP_SERVER_URL ?? "https://aisalesagent-jktajfbfw-btempnew-7904s-projects.vercel.app";

const config: CapacitorConfig = {
  appId: "com.signalpath.salesagent",
  appName: "SignalPath",
  // Bundled fallback shown when the remote server cannot be reached.
  webDir: "www",
  server: {
    url: serverUrl,
    cleartext: serverUrl.startsWith("http://"),
    errorPath: "index.html",
  },
  ios: {
    contentInset: "always",
  },
  android: {
    allowMixedContent: false,
  },
};

export default config;
