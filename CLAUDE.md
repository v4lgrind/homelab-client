# Project Guidelines — Homelab Client

## Overview

App Android (Capacitor v8) cliente d'un homelab, en **Vue 3 + TypeScript**.
Pilote Radarr / Sonarr / qBittorrent et affiche les stats Glances. Les services
sont derrière un reverse proxy protégé par **Authelia**, mais l'app utilise
l'**Option B** : Authelia est bypassé sur `/api` (règle serveur), donc l'app
n'a besoin que des **clés API** — aucun login Authelia, aucun mot de passe
stocké. Cible **Android uniquement**. Accent fort sur le **design front-end**.

## Conventions

- **Package manager :** npm
- **Build :** `npm run build` (avec types) ou `npm run build:skip-types` (rapide)
- **Dev :** `npm run dev` (http://localhost:5173) ; typecheck `npm run typecheck`
- **Android :** `npm run android:build` (APK debug — nécessite JDK 17/21 + SDK)
- **Alias imports :** `@/` → `src/`
- **Styling :** Tailwind CSS v4 ; helper `cn()` (`src/lib/utils.ts`). Couleurs via
  les tokens design exposés en utilitaires (`bg-surface`, `text-sub`,
  `text-accent`, `border-border`…) définis dans `src/assets/main.css`.
- **Design system :** « Direction OLED » (thèmes auto/light/dark via
  `[data-theme]`, police Outfit, nav flottante). Voir `useTheme`.
- **Composants :** privilégier les primitives headless Reka UI.
- **Icônes :** Lucide via `@lucide/vue`.
- **State :** stores Pinia dans `src/store/` ; `persist` pour la config non
  sensible. Secrets (identifiants Authelia, clés API) → `@capacitor/preferences`.
- **HTTP :** toujours passer par le wrapper `src/services/http.ts` (CapacitorHttp),
  jamais `fetch` — il injecte la base-URL + `X-Api-Key` et contourne CORS.
- **Workflow design :** maquettes HTML dans `design-mockups/` validées **avant**
  de coder la vue Vue correspondante.

## Auth (Option B — rappel)

Authelia est bypassé sur `^/api/` côté serveur (voir `docs/authelia-bypass.md`) ;
les endpoints restent protégés par la **clé API** du service. L'app envoie donc
juste `X-Api-Key` (Radarr/Sonarr `/api/v3`). Pas de login Authelia, pas de mot
de passe stocké. Images : `/api/v3/mediacover/...?apikey=<clé>`.

## Roadmap

Phase 0 (fait) : scaffolding. Phase 1 : onboarding + config des services.
Phase 2 : module Radarr + Sonarr. Puis qBittorrent, Glances, hub notifications.
