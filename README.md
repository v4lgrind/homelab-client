# Homelab Client

Application Android cliente de mon homelab : piloter les services principaux et
visualiser les stats du serveur, dans une seule app au design soigné.

📦 **Dernière version** : [Releases](../../releases/latest) · builds de développement continus : prerelease [`nightly`](../../releases/tag/nightly).

## Périmètre

| Module | Rôle | État |
| --- | --- | --- |
| Radarr | Films : bibliothèque, recherche/ajout, file d'attente, calendrier | ✅ livré |
| Sonarr | Séries : bibliothèque, recherche/ajout, file d'attente, calendrier | ✅ livré |
| qBittorrent | Torrents : liste, filtres, ajout, pause/reprise/catégorie/suppression (via le frontend « qui ») | ✅ livré |
| Glances | Stats serveur (CPU, RAM, disques, réseau) | ✅ livré |
| Hub notifications | Réception de webhooks + notifications locales | ⏳ à venir |

Tous les services sont derrière un reverse proxy protégé par **Authelia**, mais
l'app n'a besoin que des **clés API** (ou de l'URL de proxy « qui » pour
qBittorrent) : Authelia est bypassé sur `/api` côté serveur (voir ci-dessous).

## Stack

- **Frontend** : Vue 3 + TypeScript + Vite
- **Mobile** : Capacitor v8 (Android uniquement)
- **State** : Pinia + `pinia-plugin-persistedstate`
- **UI** : Reka UI (headless) + Tailwind CSS v4 + icônes Lucide (`@lucide/vue`)
- **HTTP** : `CapacitorHttp` (couche réseau native → gère les cookies de session
  cross-sous-domaine et contourne CORS)
- **Design** : système de tokens « Direction OLED » (thèmes auto/clair/sombre via
  `[data-theme]`, police Outfit, nav flottante)

## Authentification (Option B — bypass /api)

L'app atteint les APIs **sans** login Authelia : une règle `bypass` scellée sur
`^/api/` est ajoutée côté serveur (voir [`docs/authelia-bypass.md`](docs/authelia-bypass.md)),
et les endpoints restent protégés par la **clé API** du service (`X-Api-Key`).

Avantages : app plus simple, aucun mot de passe Authelia stocké, rayon de dégâts
réduit. Les clés API (et l'URL de proxy « qui ») sont stockées dans
`@capacitor/preferences` (chiffré) ; les URLs des services via le store Pinia persisté.

Par service :

| Service | Auth | Détail |
| --- | --- | --- |
| Radarr / Sonarr | clé API | header `X-Api-Key` sur `/api/v3`, images via `/api/v3/mediacover/…?apikey=` |
| Glances | aucune | API publique sur le sous-domaine (bypass `^/api`) |
| qBittorrent | URL de proxy « qui » | via le **Client Proxy** de [qui](https://getqui.com) : pas de login, l'URL contient la clé et qui maintient la session qBittorrent. Bypass `^/proxy` sur l'hôte qui |

Détails et règles Authelia par service : [`docs/authelia-bypass.md`](docs/authelia-bypass.md).

## Développement

```bash
npm install
npm run dev          # http://localhost:5173
npm run typecheck    # vue-tsc --noEmit
```

Pour tester la connexion réelle dans le navigateur (contournement CORS), copier
`.env.example` en `.env` et renseigner les URLs de tes services : un proxy Vite
les rend same-origin en dev. Sur device, l'app utilise `CapacitorHttp` en direct.

> Pour qBittorrent, `DEV_QBITTORRENT_URL` est l'**URL complète du proxy qui**
> (elle embarque la clé). Le proxy Vite retire les en-têtes `Origin`/`Referer`
> pour éviter le rejet CSRF de la WebUI qBittorrent — sans effet sur device.

Le workflow design passe par des maquettes HTML statiques dans
[`design-mockups/`](design-mockups/), validées avant de coder la vue Vue.

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

> ⚠️ **Transition unique** : si tu avais installé un `nightly` d'avant ce
> changement (signé par une clé éphémère du CI), désinstalle l'app **une seule
> fois** pour passer à la signature fixe. Ensuite, toutes les réinstallations
> fonctionnent sans désinstaller.

### Icône & splash

L'identité visuelle (icône « Hub » + splash clair/sombre) est générée depuis les
sources PNG de [`assets/`](assets/) avec `@capacitor/assets` :

```bash
npx @capacitor/assets generate --android \
  --splashBackgroundColor "#eef1f5" --splashBackgroundColorDark "#0a0c0f"
```

## CI/CD

Trois workflows GitHub Actions (`.github/workflows/`) :

| Workflow | Déclencheur | Rôle |
| --- | --- | --- |
| `pr-check.yml` | chaque PR vers `main` | Vérifie que tout build (types + web + APK), **sans** conserver l'APK. Garde-fou de merge. |
| `android-build.yml` | push sur `main` | Build l'APK debug et publie la prerelease roulante `nightly`. |
| `release.yml` | manuel (`workflow_dispatch`) | Release versionnée : voir ci-dessous. |

### Publier une release

Depuis l'onglet **Actions → Release → Run workflow**, ou en CLI :

```bash
gh workflow run release.yml -f version=1.1.0
```

Le workflow injecte la version dans `build.gradle` (`versionName` + un
`versionCode` dérivé du semver : `major*10000+minor*100+patch`, monotone),
build l'APK debug-signé (même keystore fixe → s'installe par-dessus l'existant),
tague le commit `v<version>` et publie une release GitHub avec l'APK attaché
(`homelab-v<version>.apk`). Il refuse de tourner si le tag existe déjà.

## Structure

```
src/
├── assets/main.css     # tokens design « Direction OLED » + Tailwind
├── components/          # composants réutilisables (BrandHeader, BottomNav, BottomSheet, ServiceCard…)
├── composables/         # useTheme
├── constants.ts         # métadonnées des services (auth, sous-domaines…)
├── lib/                 # helpers (cn(), format…)
├── pages/               # écrans routés (Library, Detail, Search, Activity, Calendar, Torrents, Stats, Settings, Onboarding)
├── router/              # Vue Router + garde d'onboarding
├── services/            # clients API : http (CapacitorHttp), arr (+arr-factory), glances, qbittorrent
├── store/               # stores Pinia : connection, library, activity, calendar, search, glances, qbittorrent
└── types/               # types partagés

android/                 # projet Capacitor Android (keystore debug fixe, assets générés)
assets/                  # sources icône/splash (@capacitor/assets)
design-mockups/          # maquettes HTML validées avant implémentation
docker/                  # image + script de build APK reproductible
docs/                    # docs serveur (bypass Authelia…)
```
