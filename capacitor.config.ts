import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.v4lgrind.homelab",
  appName: "Homelab",
  webDir: "dist",
  server: {
    // The app page is http://localhost, not https: its <img> tags load posters
    // from plain-HTTP LAN / VPN addresses, which an https page may not do
    // ("Mixed Content"). allowMixedContent does not lift that on recent WebView
    // (Chromium 157, measured). localhost still counts as a secure context.
    // Changing this changes the origin: web storage starts empty once.
    androidScheme: "http",
    // Services may be reached at a plain-HTTP LAN / VPN address
    // (http://192.168.1.10:7878) instead of their public HTTPS domain, so
    // cleartext must be allowed (AndroidManifest: usesCleartextTraffic).
    cleartext: true,
  },
  android: {
    buildOptions: {
      releaseType: "APK",
    },
    edgeToEdge: true,
  },
};

export default config;
