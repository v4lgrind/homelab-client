import { ServiceHttp } from "@/services/http";

/**
 * Finds newer Homelab releases on GitHub. The Android versionCode of a release
 * is derived from its tag exactly like .github/scripts/android-version.sh does:
 * MAJOR * 1000000 + MINOR * 10000 + PATCH * 100 (v2.1.0 → 2010000). Nightlies
 * add 1–99 to the code of the release they follow, and are never offered.
 */

export const RELEASE_REPO = "v4lgrind/homelab-client";
const ASSET_URL_PREFIX = `https://github.com/${RELEASE_REPO}/releases/download/`;
const ASSET_NAME = /^homelab-v\d+\.\d+\.\d+\.apk$/;
const MAX_NOTES = 6;

export interface AvailableUpdate {
  version: string;
  versionCode: number;
  apkUrl: string;
  /** APK size in bytes. */
  size: number;
  /** One line per change, from the generated release notes. */
  notes: string[];
}

interface GitHubAsset {
  name: string;
  browser_download_url: string;
  size: number;
}

interface GitHubRelease {
  tag_name?: string;
  draft?: boolean;
  prerelease?: boolean;
  body?: string | null;
  assets?: GitHubAsset[];
}

/** `v2.1.0` / `2.1.0` → versionCode, or null for anything else. */
export function versionCodeOf(tag: string): number | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(tag.trim());
  if (!match) return null;
  const [major, minor, patch] = match.slice(1).map(Number);
  if (minor > 99 || patch > 99) return null;
  return major * 1_000_000 + minor * 10_000 + patch * 100;
}

/**
 * Change lines of GitHub's generated notes ("* feat: x by @me in https://…/pull/45"),
 * without the author and PR link.
 */
export function summarizeNotes(body: string | null | undefined): string[] {
  if (!body) return [];
  return body
    .split(/\r?\n/)
    .filter((line) => /^\s*[*-]\s+/.test(line))
    .map((line) =>
      line
        .replace(/^\s*[*-]\s+/, "")
        .replace(/\s+by @\S+ in https?:\/\/\S+$/, "")
        .trim(),
    )
    .filter(Boolean)
    .slice(0, MAX_NOTES);
}

/** Only an APK published in this repository's own releases is ever downloaded. */
function androidAsset(release: GitHubRelease): GitHubAsset | undefined {
  return release.assets?.find(
    (asset) => ASSET_NAME.test(asset.name) && asset.browser_download_url.startsWith(ASSET_URL_PREFIX),
  );
}

/** The release as an update, or null when it isn't a published Android release. */
export function parseRelease(release: GitHubRelease): AvailableUpdate | null {
  if (release.draft || release.prerelease || !release.tag_name) return null;
  const versionCode = versionCodeOf(release.tag_name);
  const asset = androidAsset(release);
  if (versionCode === null || !asset) return null;
  return {
    version: release.tag_name.replace(/^v/, ""),
    versionCode,
    apkUrl: asset.browser_download_url,
    size: asset.size,
    notes: summarizeNotes(release.body),
  };
}

/** The latest release when it is newer than the installed build, else null. */
export async function findUpdate(installedCode: number): Promise<AvailableUpdate | null> {
  const github = new ServiceHttp("https://api.github.com", "");
  const latest = await github.get<GitHubRelease>(`/repos/${RELEASE_REPO}/releases/latest`, {
    headers: { Accept: "application/vnd.github+json" },
  });
  const update = parseRelease(latest);
  return update && update.versionCode > installedCode ? update : null;
}
