# Adresse complète par service — design

## Intention

Les services sont désormais joints de deux façons : par leur domaine public (HTTPS,
derrière Traefik + tinyauth) ou en local via le VPN (`http://IP:port`, qui
contourne tinyauth). Le modèle « domaine racine + sous-domaine (+ crayon pour
surcharger) » cache le protocole. On ne voit pas qu'on peut taper `http://`.

Décision de l'utilisateur : **un seul champ par service, contenant l'adresse
complète, avec vérification du format.** La notion de domaine racine disparaît.

## Objectifs

- Chaque service a un champ « Adresse » qui contient l'URL complète, protocole
  compris (`https://radarr.valgrind.cloud`, `http://192.168.1.10:7878`).
- Le format est vérifié, et une erreur claire s'affiche sous le champ.
- La config existante (domaine racine + sous-domaines + surcharges) est migrée
  automatiquement, sans rien ressaisir.

## Hors périmètre

- Plusieurs adresses par service (public + local) avec bascule automatique.
- Plex : son adresse vient de plex.tv, il n'a toujours pas de champ. Sa
  connexion change, mais dans un design à part (`2026-11-24-plex-link-design.md`).
- L'URL du proxy qui (qBittorrent) : c'est déjà une URL complète, on n'y touche pas.

## Approches considérées

- **A. Préfixe `https`/`http` cliquable** devant le champ actuel. Écartée : elle
  garde le domaine racine, que l'utilisateur veut supprimer.
- **B. Onglets Domaine / Local.** Écartée : elle enferme certains cas (https en
  local, http sur un domaine) et ajoute de l'interface.
- **C. Texte d'aide seulement.** Écartée : pas assez visible.
- **Retenue : un champ d'URL complète + validation** (choix de l'utilisateur).
  C'est le modèle le plus simple, et le protocole est toujours visible puisqu'il
  fait partie de l'adresse.

## Design

**Règle de format** (choix de Claude) :
- `http://` ou `https://` en tête ; **sans protocole, c'est `https://` par défaut**
  (décision de l'utilisateur) ; tout autre protocole (`ftp://`…) est refusé ;
- une fois le protocole ajouté, l'adresse doit être lisible par `new URL()`,
  avec un hôte non vide ;
- un port et un chemin sont acceptés (`https://domaine/radarr`, utile pour un
  reverse proxy en sous-chemin) ;
- le `/` final est retiré, et le protocole est mis en minuscules.

**Erreur** : « Adresse invalide — ex. `https://radarr.domaine.com` ou
`http://192.168.1.10:7878` ». Elle s'affiche quand on quitte le champ, pas à chaque
lettre tapée, et le bouton « Tester » reste désactivé tant que l'adresse est
invalide.

**Store** : `services[id].url` remplace `subdomain` et `host`, et `rootDomain` est
supprimé. `hostOf` devient `urlOf`. La valeur est stockée telle que tapée et
normalisée à la lecture, pour éviter de refaire le bug du `/` mangé pendant la frappe.

**Migration** (à la première lecture de l'ancien état persisté) :
1. une surcharge `host` existante devient `https://<host>`, ou reste telle quelle
   si elle commence déjà par `http://` ;
2. sinon, `sous-domaine` + `domaine racine` donnent `https://<sous-domaine>.<racine>` ;
3. sinon, l'adresse reste vide.

**Couche HTTP** : `serviceBaseUrl(id, url)` reçoit l'URL complète. Le mode direct
de qBittorrent aussi. Les proxys de dev Vite ne changent pas.

**Interface** :
- dans `ServiceCard`, un seul champ avec une icône globe et un placeholder par
  service (`https://radarr.domaine.com`). Le crayon et le bouton de retour au
  domaine racine sont supprimés ;
- dans l'onboarding et les réglages, le bloc « Domaine racine » est supprimé ;
- `defaultSubdomain` (constants) ne sert plus qu'à construire le placeholder.

## Processus

Une maquette HTML dans `design-mockups/service-url.html` est validée avant de
coder la vue (règle du projet).

## Laissé au builder

- Le style exact de l'erreur, à prendre dans les tokens existants (`text-danger`
  ou équivalent).
- Le nommage interne.

## Ajout : qBittorrent sans identifiants (demande de l'utilisateur, validée)

En mode **Direct**, l'identifiant et le mot de passe deviennent **facultatifs**.
qBittorrent peut ne demander aucun login aux clients de sous-réseaux autorisés
(*Options → Web UI → Bypass authentication for clients in whitelisted IP
subnets*). C'est le cas de l'accès local/VPN.

- Si les deux champs sont vides, l'app n'appelle pas `/api/v2/auth/login` et
  envoie les requêtes directement, sans cookie.
- Si un seul des deux champs est rempli, c'est une erreur : « Identifiant et mot
  de passe vont ensemble ».
- Si qBittorrent répond 403 sans identifiants : « qBittorrent demande un login —
  renseigne-le, ou autorise ton sous-réseau dans qBittorrent ».
- Dans l'interface, les placeholders deviennent « Identifiant (facultatif) » et
  « Mot de passe (facultatif) ».
