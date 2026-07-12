# Project Guidelines — Homelab Client

## Overview

App Android (Capacitor v8) cliente d'un homelab, en **Vue 3 + TypeScript**.
Pilote Radarr / Sonarr / qBittorrent et affiche les stats Glances. Tous les
services sont derrière un reverse proxy protégé par **Authelia** ; l'app gère
le login session Authelia. Cible **Android uniquement**. Accent fort sur le
**design front-end**.

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
  jamais `fetch` — c'est lui qui gère le cookie de session Authelia et le relogin.
- **Workflow design :** maquettes HTML dans `design-mockups/` validées **avant**
  de coder la vue Vue correspondante.

## Auth Authelia (rappel)

Chaque requête porte 2 couches : cookie session Authelia (proxy) + auth service
(Radarr/Sonarr : header `X-Api-Key`). Login : `POST /api/firstfactor`
(+ `secondfactor/totp` si 2FA). Le cookie `authelia_session` est domaine-large.

## Roadmap

Phase 0 (fait) : scaffolding. Phase 1 : connexion + auth Authelia.
Phase 2 : module Radarr + Sonarr. Puis qBittorrent, Glances, hub notifications.
