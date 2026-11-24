import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

const { request, plugin, env } = vi.hoisted(() => ({
  request: vi.fn(),
  plugin: {
    canInstall: vi.fn(async () => ({ allowed: true })),
    openInstallSettings: vi.fn(async () => {}),
    download: vi.fn(async (_o: unknown) => {}),
    cancelDownload: vi.fn(async () => {}),
    install: vi.fn(async () => {}),
    addListener: vi.fn(async (_e: string, _h: unknown) => ({ remove: async () => {} })),
  },
  env: { platform: "android", resume: undefined as (() => void) | undefined },
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => env.platform !== "web", getPlatform: () => env.platform },
  CapacitorHttp: { request: (opts: unknown) => request(opts) },
  registerPlugin: () => plugin,
}));
vi.mock("@capacitor/app", () => ({
  App: {
    getInfo: async () => ({ version: "dev", build: "1" }),
    addListener: async (_e: string, cb: () => void) => {
      env.resume = cb;
      return { remove: async () => {} };
    },
  },
}));

import { CHECK_INTERVAL_MS, useAppUpdateStore } from "@/store/app-update-store";

const RELEASE = {
  tag_name: "v2.1.0",
  body: "* feat: things by @v4lgrind in https://github.com/v4lgrind/homelab-client/pull/1",
  assets: [
    {
      name: "homelab-v2.1.0.apk",
      browser_download_url: "https://github.com/v4lgrind/homelab-client/releases/download/v2.1.0/homelab-v2.1.0.apk",
      size: 8_400_000,
    },
  ],
};

beforeEach(() => {
  request.mockReset();
  request.mockResolvedValue({ status: 200, data: RELEASE, headers: {} });
  Object.values(plugin).forEach((f) => f.mockClear());
  plugin.canInstall.mockResolvedValue({ allowed: true });
  env.platform = "android";
  env.resume = undefined;
  setActivePinia(createPinia());
});

describe("app update store", () => {
  it("offers a newer release at startup", async () => {
    const s = useAppUpdateStore();
    await s.init();

    expect(s.installedVersion).toBe("dev");
    expect(s.status).toBe("available");
    expect(s.update?.version).toBe("2.1.0");
    expect(s.shouldPrompt).toBe(true);
  });

  it("does nothing outside Android", async () => {
    env.platform = "web";
    await useAppUpdateStore().init();
    expect(request).not.toHaveBeenCalled();
  });

  it("checks in the background at most every 6 hours, but always on demand", async () => {
    const s = useAppUpdateStore();
    await s.init();
    await s.checkForUpdate();
    expect(request).toHaveBeenCalledTimes(1);

    s.lastCheckedAt = Date.now() - CHECK_INTERVAL_MS - 1;
    await s.checkForUpdate();
    await s.checkForUpdate({ force: true });
    expect(request).toHaveBeenCalledTimes(3);
  });

  it("stays silent when a background check fails, reports a forced one", async () => {
    request.mockRejectedValue(new Error("offline"));
    const s = useAppUpdateStore();
    await s.init();
    expect(s.status).toBe("idle");
    expect(s.error).toBeNull();

    await s.checkForUpdate({ force: true });
    expect(s.status).toBe("error");
    expect(s.error).toBe("check_failed");
  });

  it("asks for the install permission, then carries on when the user comes back", async () => {
    plugin.canInstall.mockResolvedValueOnce({ allowed: false });
    const s = useAppUpdateStore();
    await s.init();

    await s.startUpdate();
    expect(s.status).toBe("needsPermission");
    expect(plugin.openInstallSettings).toHaveBeenCalled();
    expect(plugin.download).not.toHaveBeenCalled();

    env.resume?.();
    await vi.waitFor(() => expect(plugin.install).toHaveBeenCalled());
    expect(plugin.download).toHaveBeenCalledWith({ url: RELEASE.assets[0].browser_download_url });
  });

  it("stops prompting for a version the user put off", async () => {
    const s = useAppUpdateStore();
    await s.init();
    s.dismiss();
    expect(s.shouldPrompt).toBe(false);
  });

  it("reports a rejected download", async () => {
    plugin.download.mockRejectedValueOnce(Object.assign(new Error("x"), { code: "wrong_package" }));
    const s = useAppUpdateStore();
    await s.init();
    await s.startUpdate();

    expect(s.status).toBe("error");
    expect(s.error).toBe("wrong_package");
  });
});
