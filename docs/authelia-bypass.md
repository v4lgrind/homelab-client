# Règle bypass Authelia pour l'app Homelab

L'app (Option B) atteint les APIs des services **sans** passer par le portail
Authelia : les endpoints `/api` sont protégés par leur propre **clé API**. Il faut
donc dire à Authelia de laisser passer uniquement ces chemins.

## À ajouter dans `configuration.yml`

⚠️ **L'ordre compte** : dans Authelia, la première règle qui matche gagne. La
règle `bypass` sur `/api` doit être **avant** la règle générale du domaine.

```yaml
access_control:
  default_policy: deny
  rules:
    # 1) L'app mobile : APIs Radarr/Sonarr joignables avec la seule clé API.
    #    Scellé sur ^/api/ — le reste du domaine (web UI) reste protégé.
    - domain:
        - 'radarr.valgrind.cloud'
        - 'sonarr.valgrind.cloud'
      resources:
        - '^/api($|/)'
      policy: bypass

    # 2) Tout le reste de ces hôtes : auth complète (adapte à ta politique).
    - domain:
        - 'radarr.valgrind.cloud'
        - 'sonarr.valgrind.cloud'
      policy: two_factor
```

## Points importants

- **Le web UI reste protégé.** Seul le préfixe `/api/` est bypassé ; ouvrir
  `radarr.mondomaine.com` dans un navigateur demande toujours Authelia.
- **HTTPS obligatoire** (déjà le cas via ton reverse proxy) : la clé API ne
  circule jamais en clair.
- **La clé API est un secret.** L'app la stocke dans `@capacitor/preferences`
  (chiffré), jamais dans les logs.
- **Images / posters.** Radarr/Sonarr servent les affiches sous
  `/api/v3/mediacover/...` : couvertes par le bypass, chargées avec la clé en
  paramètre `?apikey=` (sur HTTPS, vers ton propre serveur).

## Glances

```yaml
    - domain: 'glances.valgrind.cloud'
      resources: ['^/api($|/)']
      policy: bypass
```

## qBittorrent

Deux modes au choix dans l'app (Réglages → qBittorrent → *Via qui* / *Direct*).

### Via qui (par défaut)

qBittorrent est piloté à travers le **Client Proxy de qui**.
Dans qui : *Settings → Client Proxy Keys → Create Client API Key* (choisir
l'instance qBittorrent) → copier l'**URL de proxy** (elle contient la clé), à
coller dans l'app.

Si `qui.valgrind.cloud` est derrière Authelia, bypasser le chemin du proxy (la
clé protège déjà l'accès) :

```yaml
    - domain: 'qui.valgrind.cloud'
      resources: ['^/proxy($|/)']
      policy: bypass
```

### Direct

Pour une instance qBittorrent sans qui : renseigner sous-domaine, identifiant et
mot de passe. L'app fait le login (`/api/v2/auth/login`) et réutilise le cookie
de session.

Bypasser `/api` sur le domaine qBittorrent — le login protège déjà l'accès :

```yaml
    - domain: 'qbittorrent.valgrind.cloud'
      resources: ['^/api($|/)']
      policy: bypass
```

⚠️ Le WebUI de qBittorrent rejette les requêtes cross-origin (CSRF). L'app sur
device n'envoie ni `Origin` ni `Referer`, donc c'est transparent ; en revanche
« Enable Host header validation » doit accepter le sous-domaine utilisé.

## Hub de notifications

Le récepteur de webhooks (`server/`) vit sur son propre sous-domaine (ex.
`hub.valgrind.cloud`). Deux chemins doivent être bypassés — les **jetons** du hub
font l'authentification, comme ailleurs (Option B) :

- `^/hook` — l'URL que Radarr/Sonarr/Uptime Kuma appellent (le jeton d'ingestion
  est dans le chemin).
- `^/api` — l'app lit les notifications ici (bearer d'app).

```yaml
    - domain: 'hub.valgrind.cloud'
      resources: ['^/hook($|/)', '^/api($|/)']
      policy: bypass
```

Déploiement : voir [`server/README.md`](../server/README.md) et
[`server/docker-compose.example.yml`](../server/docker-compose.example.yml).
