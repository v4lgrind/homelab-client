# Proxmox v1 — surveillance en lecture seule

Maquette validée : `design-mockups/proxmox.html` (4 écrans).

## Périmètre
- **Lecture seule.** Aucune action sur les VM et LXC (démarrer, arrêter…) en v1.
- **Un seul nœud** affiché, mais le code lit la liste des nœuds via `/cluster/resources`. Un 2ᵉ nœud ne casse rien : on prend le premier nœud `online`.
- Données : nœud (CPU, RAM, charge 1 min, swap, uptime, version PVE), VM et LXC (état, CPU, RAM, disque, débit réseau, uptime, tags, IP), stockages (utilisé / total, type).
- Pas d'historique RRD, ni de backups, ni de tâches, ni de ZFS/SMART. Alertes reportées en v2 (via le hub).

## Accès réseau
- Adresse : `https://<IPv4 privée>:<port>` (Proxmox écoute en HTTPS sur 8006, certificat auto-signé). Pas de domaine.
- Plugin natif Android `PinnedHttp` : accepte un certificat non vérifié **uniquement** si l'hôte est une IPv4 RFC 1918 (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`). Sinon, refus `not_private`.
- **Empreinte mémorisée (TOFU)** : au 1er contact, l'empreinte SHA-256 du certificat feuille est retenue sans rien demander. Plus tard, une empreinte différente coupe la connexion **pendant la poignée TLS**, donc avant l'envoi de tout mot de passe ou ticket. Erreur `cert_mismatch`, avec l'empreinte reçue.
- Seul Proxmox passe par ce plugin. Les autres services gardent CapacitorHttp.
- En dev dans le navigateur : proxy Vite `/proxy-proxmox` (`secure: false`), et CapacitorHttp comme transport.

## Authentification
- Login et mot de passe d'un utilisateur dédié (ex. `homelab@pve`, rôle PVEAuditor), sans 2FA. L'utilisateur saisit le royaume dans l'identifiant (`@pve` / `@pam`).
- `POST /api2/json/access/ticket` (form-urlencoded) renvoie `ticket`, envoyé ensuite en `Cookie: PVEAuthCookie=<ticket>`. Le jeton CSRF ne sert à rien en lecture seule.
- Le ticket reste en mémoire seulement. Sur un 401, on refait un login silencieux puis **une** nouvelle tentative. Le mot de passe est dans `@capacitor/preferences` (`homelab_password_proxmox`).
- Un échec de login affiche `Identifiant ou mot de passe incorrect`.

## Interface
- **Stats** : sélecteur `Machine` / `Proxmox` à la place de l'intertitre « Machine ». Il n'apparaît que si Glances **et** Proxmox sont configurés ; sinon on affiche celui qui l'est. Le choix est retenu en localStorage.
- Rafraîchissement : Proxmox toutes les **5 s**, seulement quand son onglet est visible. Glances garde 3 s, seulement quand le sien est visible.
- Liste : VM allumées en haut, triées par CPU décroissant ; éteintes ensuite par vmid, grisées ; templates masqués. Intertitre `VM & conteneurs` · `N en marche · M éteints`.
- Tap sur une VM : `BottomSheet` avec CPU (· N cœurs), uptime, mémoire, disque, réseau ↓/↑ (débit calculé entre deux relevés), adresse IP, tags.
  - IP : LXC via `/lxc/{id}/interfaces`, VM via l'agent QEMU. Échec ou 403 : `—`.
  - Disque d'une VM sans agent : seulement la taille allouée (`32 Go alloués`).
- **Carte Proxmox** (onboarding et Réglages) : adresse (placeholder `https://192.168.1.10:8006`), identifiant (`Utilisateur (ex. homelab@pve)`), mot de passe, encart `Certificat auto-signé mémorisé` + empreinte abrégée, pastille `Connecté · PVE x.y.z`.
- **Certificat changé** : carte d'alerte `Certificat changé`, empreinte `Mémorisé` / `Reçu`, boutons `Faire confiance au nouveau` et `Réglages`.

## Couleurs de seuil
Mêmes seuils que Glances (`threshColor` : < 70 accent, 70–89 warn, ≥ 90 danger).
