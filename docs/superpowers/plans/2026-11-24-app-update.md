# Mise à jour dans l'app + clé de signature — plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use `- [ ]`.

**Goal :** l'app se met à jour depuis les releases GitHub stables ; les APK publiés sont signés avec une clé de release en rotation depuis la clé de debug commitée.
**Spec :** `docs/superpowers/specs/2026-11-24-app-update-design.md` (référence : vela `cade5c7`).

## Global Constraints
- La clé de release et son mot de passe ne vont **jamais** dans le dépôt : ils restent dans `~/.config/homelab-signing/` et dans les secrets GitHub.
- Pas de `fetch` : l'appel à GitHub passe par `ServiceHttp`.
- Formule des numéros de version, identique dans le script CI et dans `appUpdate.ts` : `MAJOR*1000000 + MINOR*10000 + PATCH*100`.
- Asset attendu : `homelab-vX.Y.Z.apk`, sous `https://github.com/v4lgrind/homelab-client/releases/download/`.

## Review Focus
1. Un APK rotaté installé par-dessus une version signée avec l'ancienne clé : il s'installe sans perte de données (à vérifier sur le Pixel).
2. Une release marquée prerelease ou brouillon, ou un tag non semver : aucune mise à jour proposée.
3. Un asset hébergé hors du dépôt : refusé.
4. Le retour depuis l'écran de permission : la mise à jour reprend.
5. Une vérification qui échoue en arrière-plan : silencieuse ; lancée depuis Réglages : erreur affichée.

### Task 1 : Clé et lineage
- [ ] Générer `~/.config/homelab-signing/release.p12` (RSA 4096, alias `homelab`, mot de passe aléatoire) et `signing.env` en chmod 600.
- [ ] `apksigner rotate` depuis `android/app/debug.keystore`, sans rollback pour l'ancienne clé, vers `android/signing/lineage.bin`.
- [ ] Relever le SHA-256 du certificat.

### Task 2 : Script de signature et versions
- [ ] `scripts/sign-android-apk.sh` (variables `HOMELAB_SIGNING_*`, vérification de l'empreinte) et `.github/scripts/android-version.sh`.
- [ ] `build.gradle` : `versionCode` et `versionName` lus depuis l'environnement ; le build release signé avec l'ancienne clé avant re-signature.
- [ ] `package.json` : `android:build` et `android:release` signent quand la clé est présente.
- [ ] Workflows `release.yml` et `android-build.yml` : `assembleRelease` + numéro de version + signature `--require`.
- [ ] Vérification : un build local signé, `apksigner verify` montre la clé de release au-dessus d'API 28.

### Task 3 : Plugin natif (Java)
- [ ] `AppUpdatePlugin.java` (download https, `canInstall`, `openInstallSettings`, `install`, `cancelDownload`, vérification du paquet et du versionCode), `UpdateApkCheck` + test JUnit, enregistrement dans `MainActivity`, permission `REQUEST_INSTALL_PACKAGES`.

### Task 4 : Service + store (TDD)
- [ ] `src/services/app-update.ts` : `versionCodeOf`, `summarizeNotes`, `parseRelease`, `findUpdate(installedCode)`.
- [ ] `src/store/app-update-store.ts` : port du store de vela.
- [ ] Tests :
  - `versionCodeOf("v2.1.0") === 2010000` ; `"v1.100.0"` donne null ;
  - prerelease, brouillon ou asset hors dépôt donnent null ;
  - `findUpdate` ne renvoie rien si le code n'est pas plus récent ;
  - le store : contrôle toutes les 6 h, permission refusée puis reprise au retour, « Plus tard » pour cette version.

### Task 5 : Interface
- [ ] `AppUpdateSheet.vue` (sur `BottomSheet`), `AppUpdateAction.vue`, section « Application » dans Réglages, `init()` dans `App.vue`. Conforme à `design-mockups/app-update.html`.

### Task 6 : Publication
- [ ] Secrets `HOMELAB_SIGNING_KEYSTORE_B64` et `HOMELAB_SIGNING_PASSWORD`.
- [ ] Installer un build local rotaté sur le Pixel par-dessus l'actuel, en vérifiant que les données sont gardées.
- [ ] Commit et push sur `main`, la nightly doit être signée.
- [ ] Lancer la release v2.1.0, puis vérifier l'asset, la signature, et que l'app la propose.
