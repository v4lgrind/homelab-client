# Homelab Client

**A polished Android client for your homelab.** Browse your media library, drive
your downloads and watch your server — from one app, on your phone, over your
own domain.

No cloud account. No third party. The app talks straight to the services you
already run.

📦 [**Download the latest APK**](../../releases/latest) · rolling dev build: [`nightly`](../../releases/tag/nightly)

---

## What it does

### 📚 Your library, at a glance

A poster grid of everything Radarr and Sonarr know about. Switch between movies
and series, filter down to what's **missing** or **monitored**, and sort by
title, date added, year or size. Built to stay smooth with a library of
thousands of titles.

### 🎬 Every title, in detail

Open any title for its artwork, synopsis and genres. From there you can toggle
**monitoring**, kick off a **search**, or delete it — with or without its files.

### 🔎 Pick your own release

Not happy with what was grabbed? Run an **interactive search**: the app queries
your indexers and lays out the releases so you can choose exactly which one to
grab.

### ⏳ Activity

Watch the download queue live — progress, speed, ETA — and scan what landed
recently.

### 📅 Calendar

See what's coming, in an agenda list or a month view, so you know what lands
this week.

### 🧲 Torrents

Full qBittorrent control, either through **[qui](https://getqui.com)'s Client
Proxy** — no credentials shared with the app — or connected **directly** to a
plain qBittorrent. List and filter your torrents, add magnets, pause, resume,
force-resume, re-categorise or delete. Transfer speeds update live.

### 📺 Media servers

See who is watching, right now, across **Jellyfin** and **Plex** at once: user,
device, what they are playing, how far in, and whether the box is transcoding for
them. Sign-in never handles a password — Jellyfin uses **Quick Connect**, Plex
its own sign-in page — and your Plex server is discovered automatically.

### 📊 Server stats

A Glances dashboard for the box itself: CPU, memory, load, disks and network —
sitting right under the streams that explain the load.

---

## Design

The interface follows a house design language — **"Direction OLED"**: true-black
surfaces, a single blue accent, the Outfit typeface and a floating navigation
bar. Light, dark and auto themes all ship. Every screen is designed as a static
mockup before it is built, so the app is drawn on purpose rather than assembled
by default.

---

## How it connects

The services' public domains are protected by **tinyauth + PocketID**, and no
exception is carved into it. The app does not go through them: it reaches each
service **directly on the LAN** (`http://192.168.1.19:<port>`), so from home or
**over the VPN**, with that service's **own credentials**. The app never holds a
master login that would unlock the whole homelab. See
[`docs/acces-reseau.md`](docs/acces-reseau.md).

| Service | How the app authenticates |
| --- | --- |
| Radarr / Sonarr | API key (`X-Api-Key`) on `/api/v3` |
| Glances | none — reachable on the LAN / VPN only |
| qBittorrent | a **qui Client Proxy URL** that embeds its own key, or direct access with an optional login (whitelisted subnet) |
| Jellyfin | **Quick Connect** — the app shows a code, you approve it from a session already signed in |
| Plex | a short code typed at **plex.tv/link**, then you pick the server; its address comes from plex.tv |

Every secret is stored with `@capacitor/preferences` and never leaves the device
— they are kept out of persisted app state entirely.

---

## Built to feel fast

Performance is treated as a feature, and measured on a real device rather than
guessed:

- **Instant launch.** The library renders from cache immediately, then
  revalidates in the background. Cold start shows a full grid with no spinner.
- **Covers at the right size.** Artwork is served by your own Radarr/Sonarr at
  display resolution instead of full-resolution originals — ~28× less data per
  poster, and nothing about your library leaks to a third-party CDN.
- **Smooth scrolling.** Off-screen cards skip layout and paint, keeping frame
  times low on lists of thousands of items.

---

## Stack

- **Frontend** — Vue 3, TypeScript, Vite
- **Mobile** — Capacitor v8 (Android only)
- **State** — Pinia + `pinia-plugin-persistedstate`
- **UI** — Reka UI (headless), Tailwind CSS v4, Lucide icons
- **Networking** — `CapacitorHttp`, the native network layer (no CORS, native cookie jar)

---

## Build it yourself

### With Docker — nothing else required

A reproducible image bundles JDK 21, Node 22 and the Android SDK:

```bash
./docker/build-apk.sh          # debug APK
./docker/build-apk.sh release  # release APK
```

The APK lands in `android/app/build/outputs/apk/debug/`.

### Locally, with JDK 21 + Android SDK

```bash
npm install
npm run android:build
```

### Develop

```bash
npm run dev          # http://localhost:5173
npm run typecheck
```

Copy `.env.example` to `.env` and fill in your service URLs: a Vite proxy makes
them same-origin in the browser so you can develop against the real thing. On
device, `CapacitorHttp` talks to them directly.

Screen mockups live in [`design-mockups/`](design-mockups/) and are validated
before the matching Vue view is written.

### Signing

Debug builds are signed with a **fixed, committed keystore**
(`android/app/debug.keystore` — a debug key is not a secret). Every build, local
or CI, therefore shares one signature: a new APK installs straight over the
previous one, no uninstall dance.

---

## Releases

| Workflow | Trigger | What it does |
| --- | --- | --- |
| `pr-check.yml` | every PR | Type-checks, builds the web app and the APK. Nothing is kept — it is a merge gate. |
| `android-build.yml` | push to `main` | Builds and publishes the rolling `nightly` prerelease. |
| `release.yml` | manual | Give it a version — it tags, builds and publishes the release. |

```bash
gh workflow run release.yml -f version=1.1.0
```

The version drives `versionName` and a `versionCode` derived from semver, so
upgrades stay monotonic.

---

## Roadmap

A **notifications hub** is next: a self-hosted webhook receiver that collects
events from across the homelab — grabs, imports, uptime alerts — and surfaces
them in the app.

---

## Layout

```
src/
├── assets/main.css   # design tokens + Tailwind
├── components/       # BrandHeader, BottomNav, PosterCard, ServiceCard…
├── composables/      # useTheme
├── pages/            # routed screens
├── services/         # API clients: http, arr, glances, qbittorrent
├── store/            # Pinia stores
└── types/

android/              # Capacitor Android project
assets/               # icon & splash sources (@capacitor/assets)
design-mockups/       # HTML mockups, validated before implementation
docker/               # reproducible APK build image
docs/                 # network access, specs and plans
```
