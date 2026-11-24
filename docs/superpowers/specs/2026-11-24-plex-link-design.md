# Connexion Plex par code (plex.tv/link) — design

## Intention

Aujourd'hui, l'app ouvre `app.plex.tv/auth` dans le navigateur. L'utilisateur
doit appuyer sur « Connexion », puis revenir à l'app à la main, parce que la page
ne se ferme pas toute seule. Le parcours est fragile : Android coupe le réseau
d'une app en arrière-plan, et Plex ignore le lien de retour.

Décision de l'utilisateur : **se connecter en tapant un code sur plex.tv/link**,
comme sur une TV.

## Objectifs

- L'app affiche un code court, et l'utilisateur le saisit sur `plex.tv/link`
  depuis n'importe quel appareil (PC, ou le téléphone lui-même).
- L'app détecte seule la validation, sans qu'il faille y revenir à un moment précis.
- Après la connexion, on garde la découverte du serveur (`discoverPlex`), qui ne change pas.

## Hors périmètre

- La découverte et le choix du serveur Plex.
- Le champ d'adresse : Plex n'en a toujours pas.

## Approches considérées

- **Navigateur `app.plex.tv/auth` (l'existant).** Écartée : il faut revenir à la
  main, et le parcours est fragile.
- **Retenue : PIN court + plex.tv/link** (choix de l'utilisateur). L'app reste au
  premier plan et peut interroger plex.tv tranquillement. C'est le même modèle que
  le Quick Connect de Jellyfin, déjà présent dans l'app.

## Design

**Service** : `createPin()` demande un PIN **non « strong »** (`strong=false`),
c'est-à-dire un code de 4 caractères accepté par plex.tv/link. Il n'y a plus de
construction d'`authUrl`. `checkPin()` ne change pas.

**Store** (`startPlexAuth`) : il crée le PIN, stocke `pairing.plex.code`, puis
interroge plex.tv toutes les 2,5 s jusqu'à recevoir un `authToken`, ou jusqu'à
l'expiration (`expiresIn` renvoyé par Plex, sinon les 5 min actuelles). Une
**erreur réseau pendant l'attente ne coupe pas la boucle** : si l'utilisateur
passe sur le navigateur du même téléphone, Android coupe le réseau de l'app, et
la boucle reprend à son retour. `Browser.open`, `waitForReturn` et
`PIN_GRACE_MS` sont supprimés.

**Interface** (`ServiceCard`) : on réutilise le bloc du code Jellyfin.
- « Saisis ce code sur **plex.tv/link** », le code en gros, puis « En attente… ».
- Un bouton secondaire « Ouvrir plex.tv/link » ouvre le navigateur, pour qui
  n'a que son téléphone.
- Le bouton principal devient « Se connecter à Plex » avec l'icône `Link`, au lieu
  d'`ExternalLink`.
- Le bouton « Annuler » ne change pas.

**Tests** : le PIN est demandé avec `strong=false`, le code est exposé dans
`pairing.plex`, la boucle survit à une erreur réseau, et elle s'arrête sur un
token ou à l'expiration.

## Processus

La maquette est intégrée à `design-mockups/service-url.html` (même carte de
service) et validée avant de coder.

## Laissé au builder

- Ajouter `expiresIn` au type `PlexPin`.
- Les libellés exacts.
