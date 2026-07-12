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

## Extensions futures

Quand on ajoutera qBittorrent et Glances, étendre le bypass :

```yaml
    - domain: 'qbittorrent.valgrind.cloud'
      resources: ['^/api($|/)']
      policy: bypass
    - domain: 'glances.valgrind.cloud'
      resources: ['^/api($|/)']
      policy: bypass
```
