# Choix du serveur Plex — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use `- [ ]`.

**Goal :** choisir le serveur Plex parmi ceux du compte, et s'y connecter en moins d'une seconde en local.
**Architecture :** `plex.ts` expose `listServers` et `connectServer` (sonde par niveau). Le store garde `serverId` (persisté) et `plexChoices` (en mémoire). `ServiceCard` affiche la liste.
**Tech :** Vue 3, Pinia, Vitest (faux timers), Capacitor.
**Spec :** `docs/superpowers/specs/2026-11-24-plex-server-choice-design.md`

## Global Constraints
- Tous les appels HTTP passent par `ServiceHttp`. Le timeout des sondes reste à 5000 ms.
- On ne commite rien sans demande explicite.
- Libellés exacts : `Quel serveur utiliser ?`, `À toi`, `Partagé`, `Serveur : `, `Changer`, `Serveur Plex injoignable depuis ce réseau`.

## Review Focus
1. Une adresse locale qui répond vite alors que d'autres pendent 5 s : le résultat arrive avant 1 s. (Task 1)
2. Hors du réseau local, toutes les adresses locales échouent : l'adresse publique est retenue. (Task 1)
3. Un `serverId` mémorisé qui n'existe plus dans le compte : la liste s'affiche, sans erreur bloquante. (Task 2)
4. « Annuler » sur la liste : la carte revient à l'état non connecté, le token est gardé et rien n'est persisté. (Task 2)
5. Un seul serveur : aucune liste, connexion directe. (Task 2)

### Task 1 : `listServers` + `connectServer` (plex.ts)
**Files :** Modify `src/services/plex.ts`, `src/types/media.ts` (`PlexResource.owned?: boolean`). Test `src/services/plex-servers.test.ts`.
**Produces :**
- `listServers(accountToken: string): Promise<PlexResource[]>`
- `connectServer(r: PlexResource, accountToken: string): Promise<PlexServer>`
- `discoverServers` est supprimé.
- [ ] Tests :
  - les ressources `{v4lgrind owned:true}`, `{Serveur owned:false}` et un lecteur (`provides:"player"`) donnent `["v4lgrind","Serveur"]`, même si « Serveur » arrive en premier ;
  - `connectServer` avec une adresse locale qui répond en 100 ms et deux autres qui ne répondent jamais : la promesse se résout en moins de 1000 ms (faux timers) avec l'URI locale ;
  - toutes les adresses locales échouent et l'adresse publique répond : on obtient l'URI publique ;
  - rien ne répond : on obtient une erreur avec le message exact.
- [ ] RED, puis implémentation, puis GREEN (`npx vitest run src/services/plex-servers.test.ts`).

### Task 2 : Store (choix, mémorisation, changement)
**Files :** Modify `src/store/connection-store.ts` (state `plexChoices: PlexResource[]`, `discoverPlex`, `selectPlexServer`, `changePlexServer`, `cancelPlexChoice`, `resetService`), `src/types/service.ts` (`serverId?: string`). Test `src/store/plex-choice.test.ts`.
**Consumes :** Task 1.
- [ ] Tests :
  - avec 2 serveurs et sans `serverId`, `discoverPlex()` remplit `plexChoices` (2 éléments), laisse le status à `"idle"` et n'envoie aucune sonde `/identity` ;
  - `selectPlexServer("srv-a")` sonde uniquement les adresses de srv-a, enregistre `serverId = "srv-a"`, `serverName` et `baseUrl`, puis vide `plexChoices` ;
  - avec un seul serveur, `discoverPlex()` se connecte directement et `plexChoices` reste vide ;
  - avec un `serverId` connu et présent, `discoverPlex()` se connecte à ce serveur sans afficher la liste ;
  - avec un `serverId` inconnu, la liste s'affiche ;
  - `cancelPlexChoice()` vide la liste et repasse le status à `"idle"` ;
  - `changePlexServer()` remplit de nouveau la liste.
- [ ] RED, puis implémentation, puis GREEN.

### Task 3 : Interface
**Files :** Modify `src/components/ServiceCard.vue`.
- [ ] La liste s'affiche quand `conn.plexChoices.length` est non nul (icône `Server`, nom, badge si `owned` est défini, chevron), avec un bouton « Annuler » qui appelle `cancelPlexChoice`. Une fois connecté, on affiche la ligne « Serveur : **nom** » et le lien « Changer » (`changePlexServer`), à la place de la ligne actuelle.
- [ ] `npm run typecheck && npx vitest run && npm run build` sont verts.
- [ ] Capture headless de la carte : elle doit correspondre à la maquette.

### Task 4 : Build et installation sur le Pixel
- [ ] `npm run android:build`, puis `adb install` sur le Pixel 10, puis comparaison des hash.
