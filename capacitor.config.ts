import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.v4lgrind.homelab",
  appName: "Homelab",
  webDir: "dist",
  server: {
    androidScheme: "https",
    // All services are reached over public HTTPS domains behind the reverse
    // proxy, so cleartext HTTP is not needed.
    cleartext: false,
  },
  android: {
    buildOptions: {
      releaseType: "APK",
    },
    edgeToEdge: true,
  },
};

export default config;
