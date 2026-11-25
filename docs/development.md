# Development

Everything a contributor or maintainer needs beyond the [README](../README.md).

## Run the web app

```bash
npm install
npm run dev          # http://localhost:5173
npm run typecheck
npm test
```

Copy `.env.example` to `.env` and fill in your service addresses. A Vite proxy
makes them same-origin in the browser, so you can develop against your real
services without CORS errors. On a device the app ignores these: it uses
`CapacitorHttp`, the native network layer, which has no CORS and keeps its
own cookie jar.

All HTTP goes through `src/services/http.ts`, never `fetch`.

## Build the APK

### With Docker, nothing else required

The image bundles JDK 21, Node 22 and the Android SDK:

```bash
./docker/build-apk.sh          # debug APK
./docker/build-apk.sh release  # release APK
```

### Locally, with JDK 21 and the Android SDK

```bash
npm run android:build     # debug APK (debuggable WebView)
npm run android:release   # release APK
```

Output: `android/app/build/outputs/apk/{debug,release}/`.

## Signing

Builds are signed twice:

- **Legacy key**, `android/app/debug.keystore`, committed, public password
  `android`. It provides the v1/v2 signatures that Android 7 and 8 check.
- **Release key**, kept out of the repository (CI secrets, or
  `~/.config/homelab-signing/` on a maintainer's machine). It provides the v3
  signature that Android 9+ checks.

`android/signing/lineage.bin` records that the legacy key authorised the
release key (APK Signature Scheme v3 rotation), so a release-signed build
installs over an older legacy-signed one and keeps its data.
`scripts/sign-android-apk.sh` applies the release key after Gradle and checks
the certificate fingerprint. Without the key, a local build keeps only the
legacy signature: fine for your own device, but it will not update an install
of an official release.

Details (in French): [`signature-et-mises-a-jour.md`](signature-et-mises-a-jour.md).

## Versions

`.github/scripts/android-version.sh` derives the numbers:

- a release `X.Y.Z` gets `versionCode = X*1000000 + Y*10000 + Z*100`;
- a nightly gets the last release's code plus the number of commits since it;
- a local build gets `1` and `versionName` "dev", unless you set
  `ANDROID_VERSION_CODE` / `ANDROID_VERSION_NAME`.

The in-app updater (`src/services/app-update.ts`) applies the same formula to
release tags. It only considers non-prerelease releases of this repository
that carry a `homelab-vX.Y.Z.apk` asset.

## CI and releases

| Workflow | Trigger | What it does |
| --- | --- | --- |
| `pr-check.yml` | every PR | Type-checks, builds the web app and the APK. A merge gate, nothing is published. |
| `android-build.yml` | push to `main` | Builds and publishes the rolling `nightly` prerelease. |
| `release.yml` | manual | Tags, builds, signs and publishes `homelab-vX.Y.Z.apk`. GitHub's generated notes become the "what's new" list in the app. |
| `cleanup-artifacts.yml` | daily | Deletes old workflow artifacts. |

```bash
gh workflow run release.yml -f version=1.2.0
```

## Design workflow

Every screen starts as a static HTML mockup in
[`design-mockups/`](../design-mockups/). The Vue view is written only once
the mockup is approved. Design tokens live in `src/assets/main.css` and are
exposed as Tailwind utilities (`bg-surface`, `text-sub`, `text-accent`…).

## Layout

```
src/
├── assets/main.css   # design tokens + Tailwind
├── components/       # shared UI (PosterCard, BottomNav, BottomSheet…)
├── composables/      # useTheme…
├── pages/            # routed screens
├── services/         # API clients: http, arr, qbittorrent, jellyfin, plex, glances, proxmox…
├── store/            # Pinia stores
└── types/

android/              # Capacitor Android project (+ native plugins)
assets/               # icon and splash sources (@capacitor/assets)
design-mockups/       # HTML mockups, approved before implementation
docker/               # reproducible APK build image
docs/                 # network access, signing, specs and plans
```
