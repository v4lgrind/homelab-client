# Signature des APK et mises à jour dans l'app

## Clés

| Clé | Où | Rôle |
| --- | --- | --- |
| Ancienne clé (« legacy ») | `android/app/debug.keystore` (commitée, mot de passe public `android`) | signature v1/v2, vérifiée par Android 7 et 8 |
| Clé de release | `~/.config/homelab-signing/release.p12` + `signing.env` (hors dépôt, chmod 600), secrets GitHub `HOMELAB_SIGNING_KEYSTORE_B64` / `HOMELAB_SIGNING_PASSWORD` | signature v3, Android 9 et plus |

Empreinte SHA-256 du certificat de release :
`6214176a2b5a3fb4a53ee5159ce2f581ad0c2f06752f9dfb241960506f141a5a`.
`scripts/sign-android-apk.sh` vérifie cette empreinte après chaque signature.

**Rotation (APK Signature Scheme v3).** `android/signing/lineage.bin` prouve que
l'ancienne clé a autorisé la clé de release. Android 9 et plus installe donc un
APK rotaté par-dessus une version signée avec l'ancienne clé, **en gardant les
données**. L'ancienne clé n'a pas la capacité de rollback : une fois un APK rotaté
installé, un APK signé seulement avec l'ancienne clé est refusé.

⚠️ **Sauvegarder `~/.config/homelab-signing/`** (Bitwarden). Sans cette clé, plus
aucune mise à jour ne peut s'installer par-dessus l'app : il faudrait la
désinstaller.

## Builds

- `npm run android:build` : APK debug (WebView débogable), re-signé avec la clé
  de release quand elle est présente sur la machine.
- `npm run android:release` : APK release, re-signé de la même façon.
- CI (`release.yml`, `android-build.yml`) : `assembleRelease`, puis
  `sign-android-apk.sh --require`, qui échoue sans les secrets.

## Numéros de version

`.github/scripts/android-version.sh` calcule les numéros :
- une release vaut `MAJOR*1000000 + MINOR*10000 + PATCH*100` (v2.1.0 → 2010000) ;
- une nightly vaut le numéro de la dernière release + le nombre de commits
  depuis (1 à 99) ;
- un build local vaut `1` (`versionName` « dev »).

`src/services/app-update.ts` applique la même formule aux tags.

## Mise à jour dans l'app

- Au démarrage (au plus toutes les 6 h) et depuis Réglages → Application, l'app
  lit `releases/latest` de `v4lgrind/homelab-client`. Les prereleases (nightlies)
  et les brouillons sont ignorés.
- Elle n'accepte que l'asset `homelab-vX.Y.Z.apk` publié dans les releases du dépôt.
- `AppUpdatePlugin.java` télécharge l'APK (https seulement) dans le cache. Il
  vérifie le nom du paquet et que le versionCode est plus récent, puis ouvre
  l'installeur Android. La première fois, Android demande l'autorisation
  « Installer des applis inconnues » ; la mise à jour reprend au retour.

## Publier une release

`gh workflow run release.yml -f version=X.Y.Z`, ou depuis l'onglet Actions. Le
workflow tague, compile, signe et publie `homelab-vX.Y.Z.apk` avec les notes
générées par GitHub, qui deviennent la liste « Nouveautés » dans l'app.
