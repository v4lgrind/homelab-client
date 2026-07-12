# Homelab Client

Application Android cliente de mon homelab : piloter les services principaux et
visualiser les stats du serveur, dans une seule app au design soigné.

## Périmètre

| Module | Rôle | État |
| --- | --- | --- |
| Radarr | Gestion des films | 🚧 en cours (Phase 2) |
| Sonarr | Gestion des séries | 🚧 en cours (Phase 2) |
| qBittorrent | Liste / contrôle des torrents (frontend « qui ») | ⏳ à venir |
| Glances | Stats serveur (CPU, RAM, disques, réseau) | ⏳ à venir |
| Hub notifications | Réception de webhooks | ⏳ plus tard |

Tous les services sont derrière un reverse proxy protégé par **Authelia** ;
l'app effectue le flux de login session Authelia (voir ci-dessous).

## Stack

- **Frontend** : Vue 3 + TypeScript + Vite
- **Mobile** : Capacitor v8 (Android uniquement)
- **State** : Pinia + `pinia-plugin-persistedstate`
- **UI** : Reka UI (headless) + Tailwind CSS v4 + icônes Lucide (`@lucide/vue`)
- **HTTP** : `CapacitorHttp` (couche réseau native → gère les cookies de session
  cross-sous-domaine et contourne CORS)

## Authentification (Authelia)

Deux couches se superposent sur chaque requête :

1. **Authelia** — cookie de session `authelia_session` (valable sur `.tondomaine`)
   obtenu via `POST /api/firstfactor` (+ `POST /api/secondfactor/totp` si 2FA).
2. **Service** — Radarr/Sonarr via header `X-Api-Key`.

Les identifiants Authelia et les clés API sont stockés dans
`@capacitor/preferences` ; les URLs des services via le store Pinia persisté.

## Développement

```bash
npm install
npm run dev          # http://localhost:5173
npm run typecheck    # vue-tsc --noEmit
npm run test         # vitest
```

Pour tester la connexion réelle dans le navigateur (contournement CORS), copier
`.env.example` en `.env` et renseigner les URLs de tes services : un proxy Vite
les rend same-origin en dev. Sur device, l'app utilise `CapacitorHttp` en direct.

## Android

```bash
npm run cap:sync       # synchronise le web vers android/
npm run android:build  # build APK debug (nécessite JDK 17/21 + Android SDK)
```

APK de sortie : `android/app/build/outputs/apk/debug/`.

## Structure

```
src/
├── assets/main.css   # tokens design « Direction OLED » + Tailwind
├── components/        # composants réutilisables (BottomNav, LazyImg…)
├── composables/       # useTheme, …
├── lib/utils.ts       # helper cn()
├── pages/             # écrans (routés)
├── router/            # Vue Router
├── services/          # clients API (http, autheliaAuth, radarr, sonarr…)
├── store/             # stores Pinia (connection, library…)
└── types/             # types partagés
```
