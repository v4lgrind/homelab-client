import { registerPlugin, type PluginListenerHandle } from "@capacitor/core";

/** Error codes the native side rejects `download` with. */
export type AppUpdateErrorCode =
  | "insecure_url"
  | "download_failed"
  | "cancelled"
  | "invalid_apk"
  | "wrong_package"
  | "not_newer";

/**
 * Self-update outside the Play Store (android/…/AppUpdatePlugin.java):
 * download a newer APK and open the system installer. Android only.
 */
export interface AppUpdatePluginInterface {
  /** Whether the user allowed Homelab to install apps ("Install unknown apps"). */
  canInstall(): Promise<{ allowed: boolean }>;
  /** Opens the system screen where that permission is granted. */
  openInstallSettings(): Promise<void>;
  /** Downloads the APK into the cache and checks it is a newer Homelab build. */
  download(opts: { url: string }): Promise<void>;
  cancelDownload(): Promise<void>;
  /** Hands the downloaded APK to the system installer (the user confirms there). */
  install(): Promise<void>;
  addListener(
    event: "downloadProgress",
    handler: (e: { received: number; total: number }) => void,
  ): Promise<PluginListenerHandle>;
}

export const AppUpdate = registerPlugin<AppUpdatePluginInterface>("AppUpdate");
