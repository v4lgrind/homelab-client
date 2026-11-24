# Project Guidelines — Homelab Client

## Overview

App Android (Capacitor v8) cliente d'un homelab, en **Vue 3 + TypeScript**.
Pilote Radarr / Sonarr / qBittorrent / Jellyfin / Plex et affiche les stats
Glances. Les domaines publics des services sont protégés par **tinyauth +
PocketID** ; l'app ne passe **pas** par eux : elle joint chaque service en
**HTTP local** (`http://192.168.1.19:<port>`), donc depuis le LAN ou **via le
VPN**, avec l'authentification propre au service. Cible **Android uniquement**.
Accent fort sur le **design front-end**.

## Conventions

- **Package manager :** npm
- **Build :** `npm run build` (avec types) ou `npm run build:skip-types` (rapide)
- **Dev :** `npm run dev` (http://localhost:5173) ; typecheck `npm run typecheck`
- **Android :** `npm run android:build` (APK debug — nécessite JDK 17/21 + SDK),
  re-signé avec la clé de release (`~/.config/homelab-signing/`) via
  `scripts/sign-android-apk.sh`. Signature, rotation de clé, numéros de version
  et mise à jour dans l'app : `docs/signature-et-mises-a-jour.md`.
- **Alias imports :** `@/` → `src/`
- **Styling :** Tailwind CSS v4 ; helper `cn()` (`src/lib/utils.ts`). Couleurs via
  les tokens design exposés en utilitaires (`bg-surface`, `text-sub`,
  `text-accent`, `border-border`…) définis dans `src/assets/main.css`.
- **Design system :** « Direction OLED » (thèmes auto/light/dark via
  `[data-theme]`, police Outfit, nav flottante). Voir `useTheme`.
- **Composants :** privilégier les primitives headless Reka UI.
- **Icônes :** Lucide via `@lucide/vue`.
- **State :** stores Pinia dans `src/store/` ; `persist` pour la config non
  sensible (adresses des services…). Secrets (clés API, mots de passe, tokens
  Plex/Jellyfin) → `@capacitor/preferences`.
- **HTTP :** toujours passer par le wrapper `src/services/http.ts` (CapacitorHttp),
  jamais `fetch` — il injecte la base-URL + `X-Api-Key` et contourne CORS.
- **Workflow design :** maquettes HTML dans `design-mockups/` validées **avant**
  de coder la vue Vue correspondante.

## Accès réseau (rappel)

Voir `docs/acces-reseau.md`. En bref :
- Une **adresse complète par service** (`https://` par défaut, `http://` accepté).
  Plus de domaine racine ni de sous-domaine.
- Les domaines publics renvoient un 401 tinyauth (`x-tinyauth-location`) →
  erreur `kind: "gate"`, message « Bloqué par tinyauth — VPN connecté ? ».
  On n'ajoute **pas** d'exception tinyauth (Glances n'a aucune auth).
- Auth par service : `X-Api-Key` (Radarr/Sonarr), aucune (Glances), login
  facultatif ou proxy qui (qBittorrent), Quick Connect (Jellyfin), code
  plex.tv/link + choix du serveur (Plex).
- La WebView sert l'app en `http://localhost` (`androidScheme: "http"`) pour que
  les pochettes `http://` ne soient pas bloquées en mixed content. Changer ce
  schéma change l'origine et vide le stockage web.
- Images : `/api/v3/mediacover/...?apikey=<clé>`.

## Roadmap

Phase 0 (fait) : scaffolding. Phase 1 : onboarding + config des services.
Phase 2 : module Radarr + Sonarr. Puis qBittorrent, Glances, hub notifications.
