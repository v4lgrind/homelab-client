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

## qBittorrent (via qui)

qBittorrent est piloté à travers le **Client Proxy de qui**, pas en direct.
Dans qui : *Settings → Client Proxy Keys → Create Client API Key* (choisir
l'instance qBittorrent) → copier l'**URL de proxy** (elle contient la clé), à
coller dans l'app (Réglages → qBittorrent).

Si `qui.valgrind.cloud` est derrière Authelia, bypasser le chemin du proxy (la
clé protège déjà l'accès) :

```yaml
    - domain: 'qui.valgrind.cloud'
      resources: ['^/proxy($|/)']
      policy: bypass
```
