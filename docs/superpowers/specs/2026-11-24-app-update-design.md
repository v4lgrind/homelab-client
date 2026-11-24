# Mise à jour dans l'app + clé de signature — design

## Intention
Reprendre dans homelab-client le mécanisme de vela (`mediaserver-client`, commit
`cade5c7`) : l'app se met à jour toute seule depuis les releases GitHub, et les
APK publiés sont signés avec une vraie clé, gardée hors du dépôt. Décision de
l'utilisateur : **avec la clé**.

## Objectifs
- Au démarrage (au plus toutes les 6 h) et depuis Réglages → Application, l'app
  compare sa version à la dernière **release stable** de `v4lgrind/homelab-client`.
  Les nightlies sont ignorées.
- Un panneau propose la mise à jour, avec la liste des changements. « Mettre à
  jour » télécharge l'APK avec une progression, puis lance l'installeur Android.
  « Plus tard » ne remontre plus le panneau pour cette version.
- Les APK publiés (release et nightly) sont signés avec une clé de release : RSA
  4096 en PKCS12, rangée dans `~/.config/homelab-signing/`, avec rotation v3
  depuis `android/app/debug.keystore` (`android/signing/lineage.bin`). Ils
  s'installent par-dessus les versions actuelles en gardant les données.
- Des numéros de version monotones : release = `MAJOR*1000000 + MINOR*10000 +
  PATCH*100`, nightly = celui de la dernière release + le nombre de commits
  depuis (1 à 99). La v2.0.0 actuelle valait 20000 ; tous les nouveaux numéros
  sont au-dessus.

## Hors périmètre
- Google Play, Obtainium, et l'auto-update du serveur.

## Approches
- **Sans clé.** Écartée par l'utilisateur : n'importe qui pourrait signer une « mise à jour ».
- **Retenue : le portage de vela.** Adaptations (choix de Claude) :
  - le plugin natif est écrit en **Java**, parce que le projet Android n'a pas Kotlin ;
  - l'appel à l'API GitHub passe par `ServiceHttp` (règle du projet : jamais `fetch`) ;
  - l'asset attendu est `homelab-vX.Y.Z.apk`, téléchargé depuis
    `github.com/v4lgrind/homelab-client/releases/download/` ;
  - les textes sont en français dans le code, puisqu'il n'y a pas d'i18n dans ce projet ;
  - l'interface réutilise `BottomSheet.vue` et le style des sections de Réglages
    (maquette `design-mockups/app-update.html`).
- Les builds locaux (`npm run android:build`) restent en debug, pour garder le
  débogage de la WebView, mais sont re-signés avec la clé quand elle est présente.
  La CI compile en `assembleRelease`, non débogable, et **exige** la clé (`--require`).

## Actions de l'utilisateur
1. Sauvegarder `~/.config/homelab-signing/` (Bitwarden).
2. Créer les secrets GitHub `HOMELAB_SIGNING_KEYSTORE_B64` et `HOMELAB_SIGNING_PASSWORD`.
3. Publier une release (par exemple v2.1.0) pour essayer le parcours complet.
