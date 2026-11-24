# Accès réseau de l'app Homelab

## Principe

Les services sont derrière Traefik, et leurs domaines publics (`*.valgrind.cloud`)
sont protégés par **tinyauth + PocketID**. tinyauth exige une session de
navigateur : un appel API venant de l'app reçoit un `401` avec l'en-tête
`x-tinyauth-location`. L'app le reconnaît et affiche **« Bloqué par tinyauth —
VPN connecté ? »**.

**Choix retenu : aucune exception dans tinyauth.** L'app joint chaque service
**directement en HTTP sur le réseau local** (`http://192.168.1.19:<port>`). Ces
adresses ne répondent que depuis la maison ou **via le VPN**. Côté Internet, rien
ne change : tout ce qui arrive par un domaine public passe par PocketID.

Chaque service garde son propre contrôle d'accès (clé API, login…). L'app ne
détient aucun identifiant tinyauth ou PocketID.

## Adresses et authentification

| Service | Adresse dans l'app | Authentification |
| --- | --- | --- |
| Radarr | `http://192.168.1.19:7878` | clé API (`X-Api-Key`) |
| Sonarr | `http://192.168.1.19:8989` | clé API (`X-Api-Key`) |
| Glances | `http://192.168.1.19:61208` | aucune : joignable en local seulement |
| qBittorrent (Direct) | `http://192.168.1.19:7777` | identifiant et mot de passe **facultatifs** (voir plus bas) |
| qBittorrent (via qui) | URL du Client Proxy qui | la clé est dans l'URL |
| Jellyfin | adresse du serveur | Quick Connect ou identifiants |
| Plex | aucune à saisir | code sur **plex.tv/link**, puis choix du serveur ; l'adresse vient de plex.tv |

Dans l'app, chaque service prend une **adresse complète**. Sans protocole, c'est
`https://` par défaut, et `http://` est accepté pour le réseau local.

## Côté serveur

- **Publier les ports sur l'IP LAN seulement**, par exemple
  `"192.168.1.19:7878:7878"`, et non `"7878:7878"`, qui écoute sur toutes les
  interfaces. Ne mettre **aucune redirection de port** sur la box.
- ⚠️ Docker contourne les règles UFW : un port publié reste ouvert même si le
  pare-feu dit le contraire.
- Le VPN doit pouvoir joindre `192.168.1.19`, avec du routage vers le LAN ou un
  masquerade.
- **qBittorrent sans login** : *Options → Web UI → Bypass authentication for
  clients in whitelisted IP subnets*, avec les sous-réseaux du LAN et du VPN.
  « Enable Host header validation » doit accepter l'adresse utilisée.

## Côté app (pourquoi c'est configuré ainsi)

- **HTTP autorisé** (`usesCleartextTraffic`) : les adresses locales sont en HTTP
  simple. Le trafic passe dans le tunnel VPN, ou sur le LAN.
- **Page interne en `http://localhost`** (`androidScheme: "http"`) : les pochettes
  sont des `<img>` chargées par la WebView. Sur une page `https://`, elles seraient
  bloquées comme « Mixed Content », et `allowMixedContent` n'y change rien sur
  WebView 157. `localhost` reste un contexte sécurisé.
- **Secrets** (clés API, mots de passe, tokens Plex et Jellyfin) : stockés dans
  `@capacitor/preferences`, jamais dans le `localStorage`.

## Alternative non retenue : ouvrir `/api` dans tinyauth

tinyauth sait laisser passer un chemin sans login
(`tinyauth.apps.<app>.path.allow=^/api(/|$)`), ou une plage d'IP
(`tinyauth.apps.<app>.ip.bypass=<CIDR>`). Écartée, parce qu'elle exposerait
`/api` sur Internet : chaque service ne serait plus protégé que par sa clé, et
**Glances, qui n'a aucune authentification, deviendrait public**.

## Hub de notifications (fonctionnalité masquée)

Le récepteur de webhooks (`server/`) a besoin que `^/hook` et `^/api` soient
joignables sans login, les jetons du hub faisant l'authentification. C'est à
trancher quand la fonctionnalité reviendra : soit en local seulement, comme les
autres services, soit avec un `path.allow` tinyauth limité à ces deux chemins.
