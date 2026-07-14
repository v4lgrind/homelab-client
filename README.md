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

Tous les services sont derrière un reverse proxy protégé par **Authelia**, mais
l'app n'a besoin que des **clés API** : Authelia est bypassé sur `/api` côté
serveur (voir ci-dessous).

## Stack

- **Frontend** : Vue 3 + TypeScript + Vite
- **Mobile** : Capacitor v8 (Android uniquement)
- **State** : Pinia + `pinia-plugin-persistedstate`
- **UI** : Reka UI (headless) + Tailwind CSS v4 + icônes Lucide (`@lucide/vue`)
- **HTTP** : `CapacitorHttp` (couche réseau native → gère les cookies de session
  cross-sous-domaine et contourne CORS)

## Authentification (Option B — bypass /api)

L'app atteint les APIs **sans** login Authelia : une règle `bypass` scellée sur
`^/api/` est ajoutée côté serveur (voir [`docs/authelia-bypass.md`](docs/authelia-bypass.md)),
et les endpoints restent protégés par la **clé API** du service (`X-Api-Key`).

Avantages : app plus simple, aucun mot de passe Authelia stocké, rayon de dégâts
réduit. Les clés API sont stockées dans `@capacitor/preferences` (chiffré) ; les
URLs des services via le store Pinia persisté.

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

### Build via Docker (recommandé — aucun SDK local requis)

Une image Docker reproductible embarque JDK 21 + Node 22 + Android SDK
(platform/build-tools 36). Seul **Docker** est requis sur la machine :

```bash
./docker/build-apk.sh          # APK debug
./docker/build-apk.sh release  # APK release
```

Le 1er run construit l'image (télécharge le SDK, quelques minutes) ; les runs
suivants réutilisent le cache Gradle et les `node_modules` du conteneur (le
`node_modules` de l'hôte n'est pas touché). APK de sortie :
`android/app/build/outputs/apk/debug/`.

### Build local (si tu as JDK 21 + Android SDK installés)

```bash
npm run cap:sync       # synchronise le web vers android/
npm run android:build  # build APK debug
```

### Signature (keystore debug fixe)

Le build debug est signé par un keystore **fixe et versionné**
(`android/app/debug.keystore`, identifiants debug standard `android` /
`androiddebugkey`). Ce n'est **pas** un secret : un keystore debug n'ouvre aucun
accès. L'intérêt est que **tous** les builds (local + CI) partagent la même
signature, donc réinstaller un nouvel APK par-dessus l'ancien ne déclenche plus
l'erreur *« signatures do not match »* — pas besoin de désinstaller d'abord.

> ⚠️ **Transition unique** : l'APK déjà installé avant ce changement était signé
> par une clé éphémère du CI. Pour passer à la nouvelle signature fixe, il faut
> désinstaller l'app **une seule fois**. Ensuite, toutes les réinstallations
> fonctionnent sans désinstaller.

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
