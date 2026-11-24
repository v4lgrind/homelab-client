import { defineStore } from "pinia";
import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { AppUpdate } from "@/plugins/app-update";
import { findUpdate, type AvailableUpdate } from "@/services/app-update";

/** Background checks run at most this often; the Settings button always checks. */
export const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

export type UpdateStatus =
  | "idle"
  | "checking"
  | "upToDate"
  | "available"
  | "needsPermission"
  | "downloading"
  | "installing"
  | "error";

function errorCode(error: unknown): string {
  const code = (error as { code?: unknown })?.code;
  return typeof code === "string" ? code : "download_failed";
}

/**
 * In-app updates from the GitHub releases (port of Vela's updater). The APK
 * is signed with the rotated release key, so Android installs it over the
 * current build and keeps its data.
 */
export const useAppUpdateStore = defineStore("appUpdate", {
  state: () => ({
    status: "idle" as UpdateStatus,
    update: null as AvailableUpdate | null,
    /** Download progress, 0 to 1 (0 while the size is unknown). */
    progress: 0,
    error: null as string | null,
    installedVersion: "",
    installedCode: 0,
    /** The APK of `update` is in the cache: installing again needs no download. */
    downloaded: false,
    lastCheckedAt: 0,
    dismissedVersion: "",
    resumeListening: false,
  }),

  getters: {
    supported: () => Capacitor.getPlatform() === "android",
    /** Show the startup sheet: an update the user hasn't put off yet. */
    shouldPrompt: (state) =>
      Boolean(state.update) && state.status !== "idle" && state.update?.version !== state.dismissedVersion,
  },

  actions: {
    /** Reads the installed version, drops a stale update and checks GitHub if due. */
    async init() {
      if (!this.supported) return;
      const info = await App.getInfo();
      this.installedVersion = info.version;
      this.installedCode = Number(info.build) || 0;
      if (this.update && this.update.versionCode <= this.installedCode) this.update = null;
      if (this.update) this.status = "available";
      this.listenForResume();
      await this.checkForUpdate();
    },

    /** Background checks fail silently; a forced check (Settings) reports errors. */
    async checkForUpdate({ force = false } = {}) {
      if (!this.supported || this.status === "checking" || this.status === "downloading") return;
      if (!force && Date.now() - this.lastCheckedAt < CHECK_INTERVAL_MS) return;
      this.status = "checking";
      this.error = null;
      try {
        const update = await findUpdate(this.installedCode);
        if (update?.version !== this.update?.version) this.downloaded = false;
        this.update = update;
        this.lastCheckedAt = Date.now();
        this.status = update ? "available" : "upToDate";
      } catch (error) {
        console.warn("[AppUpdate] Release check failed:", error);
        this.status = this.update ? "available" : force ? "error" : "idle";
        if (force) this.error = "check_failed";
      }
    },

    /** Asks for the install permission if needed, then downloads and installs. */
    async startUpdate() {
      if (!this.update) return;
      const { allowed } = await AppUpdate.canInstall();
      if (!allowed) {
        this.status = "needsPermission";
        await AppUpdate.openInstallSettings();
        return;
      }
      if (this.downloaded) await this.install();
      else await this.downloadAndInstall();
    },

    async downloadAndInstall() {
      if (!this.update) return;
      this.status = "downloading";
      this.progress = 0;
      this.error = null;
      const listener = await AppUpdate.addListener("downloadProgress", ({ received, total }) => {
        this.progress = total > 0 ? Math.min(received / total, 1) : 0;
      });
      try {
        await AppUpdate.download({ url: this.update.apkUrl });
        this.downloaded = true;
        await this.install();
      } catch (error) {
        const code = errorCode(error);
        console.warn("[AppUpdate] Download failed:", code, error);
        this.status = code === "cancelled" ? "available" : "error";
        this.error = code === "cancelled" ? null : code;
      } finally {
        await listener.remove();
      }
    },

    async install() {
      this.status = "installing";
      await AppUpdate.install();
    },

    async cancel() {
      await AppUpdate.cancelDownload();
    },

    /** "Plus tard": no more startup sheet for this version (Settings still offers it). */
    dismiss() {
      if (this.update) this.dismissedVersion = this.update.version;
    },

    /**
     * Back from the permission screen or a cancelled installer: continue if
     * the permission is now granted, otherwise offer the update again.
     */
    async onResume() {
      if (this.status === "installing") this.status = "available";
      if (this.status !== "needsPermission") return;
      const { allowed } = await AppUpdate.canInstall();
      if (allowed) await this.startUpdate();
      else this.status = "available";
    },

    listenForResume() {
      if (this.resumeListening) return;
      this.resumeListening = true;
      void App.addListener("resume", () => void this.onResume());
    },
  },

  persist: { pick: ["update", "lastCheckedAt", "dismissedVersion"] },
});
