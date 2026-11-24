import { beforeEach, describe, expect, it, vi } from "vitest";

const request = vi.fn();

vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => true },
  CapacitorHttp: { request: (opts: unknown) => request(opts) },
}));

import { findUpdate, parseRelease, summarizeNotes, versionCodeOf } from "@/services/app-update";

const ASSET_URL = "https://github.com/v4lgrind/homelab-client/releases/download/v2.1.0/homelab-v2.1.0.apk";

function release(over: Record<string, unknown> = {}) {
  return {
    tag_name: "v2.1.0",
    draft: false,
    prerelease: false,
    body: "## What's Changed\n* feat(connection): full addresses by @v4lgrind in https://github.com/v4lgrind/homelab-client/pull/30\n* fix(theme): status bar icons by @v4lgrind in https://github.com/v4lgrind/homelab-client/pull/31\n\n**Full Changelog**: x",
    assets: [{ name: "homelab-v2.1.0.apk", browser_download_url: ASSET_URL, size: 8_400_000 }],
    ...over,
  };
}

beforeEach(() => request.mockReset());

// Same formula as .github/scripts/android-version.sh: a release's code must be
// what the APK built from its tag carries, or the app would offer it forever.
describe("versionCodeOf", () => {
  it("follows the CI formula", () => {
    expect(versionCodeOf("v2.1.0")).toBe(2_010_000);
    expect(versionCodeOf("2.1.3")).toBe(2_010_300);
  });

  it("rejects anything that is not MAJOR.MINOR.PATCH within range", () => {
    expect(versionCodeOf("v1.100.0")).toBeNull();
    expect(versionCodeOf("nightly-20261124-b1a0f3b")).toBeNull();
  });
});

describe("summarizeNotes", () => {
  it("keeps the change lines, without author and PR link", () => {
    expect(summarizeNotes(release().body)).toEqual([
      "feat(connection): full addresses",
      "fix(theme): status bar icons",
    ]);
  });
});

describe("parseRelease", () => {
  it("reads a published release", () => {
    expect(parseRelease(release())).toEqual({
      version: "2.1.0",
      versionCode: 2_010_000,
      apkUrl: ASSET_URL,
      size: 8_400_000,
      notes: ["feat(connection): full addresses", "fix(theme): status bar icons"],
    });
  });

  it("ignores prereleases (nightlies) and drafts", () => {
    expect(parseRelease(release({ prerelease: true }))).toBeNull();
    expect(parseRelease(release({ draft: true }))).toBeNull();
  });

  it("ignores an APK hosted outside the repository's releases", () => {
    const foreign = [{ name: "homelab-v2.1.0.apk", browser_download_url: "https://evil.example/homelab-v2.1.0.apk", size: 1 }];
    expect(parseRelease(release({ assets: foreign }))).toBeNull();
  });
});

describe("findUpdate", () => {
  it("asks GitHub for the latest release through the HTTP wrapper", async () => {
    request.mockResolvedValue({ status: 200, data: release(), headers: {} });
    const update = await findUpdate(1);

    expect(update?.version).toBe("2.1.0");
    const { url, headers } = request.mock.calls[0][0];
    expect(url).toBe("https://api.github.com/repos/v4lgrind/homelab-client/releases/latest");
    expect(headers.Accept).toBe("application/vnd.github+json");
  });

  it("returns nothing when the installed build is as new", async () => {
    request.mockResolvedValue({ status: 200, data: release(), headers: {} });
    expect(await findUpdate(2_010_000)).toBeNull();
  });
});
