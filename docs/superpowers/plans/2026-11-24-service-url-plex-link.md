# Adresse complète + qBittorrent sans login + Plex par code — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** remplacer « domaine racine + sous-domaine » par une adresse complète par service, rendre facultatifs les identifiants qBittorrent en mode direct, et connecter Plex via un code à saisir sur plex.tv/link.

**Architecture :** une fonction pure `normalizeServiceUrl` (dans `src/lib/service-url.ts`) est la seule à décider de ce qu'est une adresse valide. Le store stocke ce qui a été tapé, normalise à la lecture (`urlOf`) et migre l'ancien état persisté dans `afterHydrate`. Toute la couche HTTP reçoit des URL absolues. Plex réutilise le modèle « code affiché + polling » du Quick Connect Jellyfin.

**Tech Stack :** Vue 3 + TypeScript, Pinia + pinia-plugin-persistedstate 4, Capacitor 8 (CapacitorHttp, Browser), Vitest, Tailwind v4.

**Specs :** `docs/superpowers/specs/2026-11-24-service-url-design.md`, `docs/superpowers/specs/2026-11-24-plex-link-design.md`

## Global Constraints

- Tout appel HTTP passe par `src/services/http.ts` (CapacitorHttp), jamais `fetch` (CLAUDE.md).
- Sans protocole, l'adresse prend `https://`. Seuls `http://` et `https://` sont acceptés. Le `/` final est retiré et le protocole mis en minuscules.
- Texte de l'erreur d'adresse, exact : `Adresse invalide — ex. https://radarr.domaine.com ou http://192.168.1.10:7878`.
- Le champ stocke ce qui est tapé, sans normalisation pendant la frappe (régression déjà rencontrée : le `/` de `http:/` était mangé).
- Les couleurs passent par les tokens (`text-danger`, `text-muted`, `bg-field`…), jamais en dur.
- Maquette validée par l'utilisateur **avant** de modifier un `.vue` (CLAUDE.md).
- Pas de `git commit` sans demande explicite de l'utilisateur : on est sur `main`, avec des changements non commités antérieurs.
- Vérification de fin de tâche : `npx vitest run` vert et `npm run typecheck` sans erreur.

## Review Focus

1. **Frappe caractère par caractère** de `http://192.168.1.10:7878` dans le champ : le texte reste intact, et `urlOf` renvoie l'URL. Test dans la Task 2.
2. **Utilisateur déjà configuré avec la build d'aujourd'hui** (`host: "http://192.168.1.10:7878"`, ou `subdomain` + `rootDomain`) : après mise à jour, son adresse est la même, protocole compris. Test dans la Task 2.
3. **Saisie « sale »** (`  HTTPS://Radarr.example.com/ `, `https://x.com/radarr/`, `radarr.example.com:7878`) : elle est normalisée sans être refusée. Test dans la Task 1.
4. **qBittorrent avec un seul des deux identifiants** : erreur explicite, aucun appel réseau. Test dans la Task 4.
5. **Plex : coupure réseau pendant l'attente** (l'utilisateur est parti dans le navigateur), puis retour : l'attente continue et récupère le token. Test dans la Task 5.

---

### Task 0 : Maquette

**Files :**
- Create : `design-mockups/service-url.html`

- [ ] **Step 1 : Écrire la maquette** en reprenant le `<style>` (tokens, thèmes dark/light) et la structure de `design-mockups/onboarding.html`. Elle montre, en dark et en light :
  - la page Réglages sans le bloc « Domaine racine » ;
  - une carte Radarr dont le champ « Adresse » contient `https://radarr.valgrind.cloud` ;
  - une carte Radarr avec `http://192.168.1.10:7878` ;
  - une carte Radarr avec `ftp://x` et l'erreur sous le champ, en `--danger`, le bouton Tester grisé ;
  - une carte qBittorrent Direct avec les placeholders « Identifiant (facultatif) » et « Mot de passe (facultatif) » ;
  - une carte Plex en attente : « Saisis ce code sur **plex.tv/link** », le code `7K2Q` en gros, « En attente… », un bouton secondaire « Ouvrir plex.tv/link » et un bouton « Annuler ».
- [ ] **Step 2 : Faire valider la maquette par l'utilisateur.** On ne passe à la Task 3 qu'une fois la validation obtenue. Les Tasks 1 et 2 (sans `.vue`) peuvent avancer en parallèle.

### Task 1 : Normalisation et validation d'adresse

**Files :**
- Create : `src/lib/service-url.ts`
- Test : `src/lib/service-url.test.ts`

**Interfaces :**
- Produces : `normalizeServiceUrl(raw: string): string | null`. Renvoie `""` pour une saisie vide ou blanche, `null` pour une adresse invalide, sinon l'URL canonique.
- Produces : `SERVICE_URL_ERROR = "Adresse invalide — ex. https://radarr.domaine.com ou http://192.168.1.10:7878"`.

- [ ] **Step 1 : Écrire les tests**

```ts
it.each([
  ["radarr.example.com", "https://radarr.example.com"],
  ["  HTTPS://Radarr.example.com/ ", "https://radarr.example.com"],
  ["http://192.168.1.10:7878", "http://192.168.1.10:7878"],
  ["HTTP://192.168.1.10:7878/", "http://192.168.1.10:7878"],
  ["radarr.example.com:7878", "https://radarr.example.com:7878"],
  ["https://x.com/radarr/", "https://x.com/radarr"],
])("normalises %s", (raw, out) => expect(normalizeServiceUrl(raw)).toBe(out));
it.each(["ftp://x.com", "https://", "http://exa mple.com", "://x"])("rejects %s", (raw) =>
  expect(normalizeServiceUrl(raw)).toBeNull());
it("blank is empty, not invalid", () => expect(normalizeServiceUrl("   ")).toBe(""));
```

- [ ] **Step 2 :** `npx vitest run src/lib/service-url.test.ts` → FAIL (module introuvable).
- [ ] **Step 3 : Implémenter.** Ajouter `https://` si aucun `^[a-z][a-z0-9+.-]*://` n'est présent (insensible à la casse). Parser avec `new URL`, puis refuser si le protocole n'est pas `http:`/`https:`, si `hostname` est vide ou si la saisie contient un espace. Renvoyer `${protocol}//${host}${pathname sans / final}` : l'hôte est mis en minuscules par `URL`, la query et le fragment sont ignorés.
- [ ] **Step 4 :** `npx vitest run src/lib/service-url.test.ts` → PASS.

### Task 2 : Store et couche HTTP sur l'URL complète

**Files :**
- Modify : `src/types/service.ts` (`ServiceState`)
- Modify : `src/store/connection-store.ts` (state, persist, getters, `setUrl`, `resetService`, `resetAll`, `qbitConfig`, `testService`, Quick Connect / login Jellyfin, plus le retrait de `normalizeHost`, `setRootDomain`, `setSubdomain`, `setHost`, `clearHost`, `hasHostOverride`)
- Create : `src/store/migrate-address.ts`
- Modify : `src/services/http.ts` (`serviceBaseUrl`, retrait d'`originOf`), `src/services/qbittorrent.ts` (`QbitConfig`, `baseUrlFor`)
- Modify (renommage `hostOf` → `urlOf`) : `src/services/arr-factory.ts`, `src/pages/DetailPage.vue:34`, `src/store/glances-store.ts:23`, `src/store/mediaservers-store.ts:125`, `src/store/library-store.ts:87,145`
- Test : `src/store/migrate-address.test.ts` ; réécrire `src/services/local-address.test.ts`

**Interfaces :**
- Consumes : `normalizeServiceUrl` (Task 1).
- Produces : `ServiceState.url?: string` (saisie brute). `subdomain`, `host` et le state `rootDomain` sont supprimés, mais `baseUrl` (Plex) reste.
- Produces : getter `urlOf(id: ServiceId): string`, qui renvoie l'URL canonique, ou `""` si l'adresse est vide ou invalide.
- Produces : getter `urlError(id: ServiceId): string | undefined`, qui renvoie `SERVICE_URL_ERROR` si la saisie est non vide et invalide.
- Produces : action `setUrl(id: ServiceId, raw: string): void`, qui stocke `raw` tel quel et repasse le status à `"idle"`.
- Produces : `migrateLegacyAddress(svc: { subdomain?: string; host?: string; url?: string }, rootDomain?: string): string | undefined`.
- Produces : `serviceBaseUrl(id: ServiceId, url: string): string`, qui renvoie `url` sur device et le proxy Vite en dev, comme aujourd'hui.
- Produces : `QbitConfig` direct = `{ mode: "direct"; url: string; username?: string; password?: string }`.

- [ ] **Step 1 : Tests de migration** (`migrate-address.test.ts`)

```ts
expect(migrateLegacyAddress({ url: "https://a.b" }, "x.com")).toBe("https://a.b");          // déjà migré
expect(migrateLegacyAddress({ host: "http://192.168.1.10:7878", subdomain: "radarr" }, "x.com"))
  .toBe("http://192.168.1.10:7878");
expect(migrateLegacyAddress({ host: "radarr.other.com" }, "x.com")).toBe("https://radarr.other.com");
expect(migrateLegacyAddress({ subdomain: "radarr" }, "valgrind.cloud")).toBe("https://radarr.valgrind.cloud");
expect(migrateLegacyAddress({ subdomain: "radarr" }, "")).toBeUndefined();
expect(migrateLegacyAddress({ subdomain: "" }, "x.com")).toBeUndefined();
```

- [ ] **Step 2 : Réécrire `local-address.test.ts`**, avec mocks Capacitor et Preferences et un Pinia frais :
  - `serviceBaseUrl("radarr", "http://192.168.1.10:7878")` vaut `"http://192.168.1.10:7878"` ;
  - frappe caractère par caractère de `http://192.168.1.10:7878` via `setUrl` (en relisant `services.radarr.url` à chaque fois) : le champ vaut la saisie exacte, et `urlOf("radarr")` aussi ;
  - `setUrl("radarr", "ftp://x")` : `urlOf` vaut `""` et `urlError` vaut `SERVICE_URL_ERROR` ;
  - `setUrl("radarr", "")` : `urlError` vaut `undefined` ;
  - qBittorrent direct `{ url: "http://192.168.1.10:8080", username: "u", password: "p" }` : le premier appel part vers `http://192.168.1.10:8080/api/v2/auth/login` ;
  - le test d'hydratation : un state persisté au format ancien `{ rootDomain: "valgrind.cloud", services: { radarr: { subdomain: "radarr", status: "idle" } } }`, passé dans le hook `afterHydrate`, donne `urlOf("radarr") === "https://radarr.valgrind.cloud"`. Appeler directement le hook exporté depuis les options `persist` du store, ou extraire `migrateHydratedState(state)` et le tester.
- [ ] **Step 3 :** `npx vitest run src/store src/services/local-address.test.ts` → FAIL.
- [ ] **Step 4 : Implémenter.**
  - `persist: { pick: ["services"], afterHydrate }`. `afterHydrate` lit l'ancien `rootDomain` dans le state hydraté brut, puis, pour chaque service, écrit `url = migrateLegacyAddress(...)` et supprime `subdomain` et `host`.
  - `defaultServices()` initialise `{ status: "idle" }`.
  - Les messages « Domaine du service requis » deviennent « Adresse du service requise ».
  - `qbitConfig` direct renvoie `url: this.urlOf("qbittorrent")`. Les identifiants restent requis à ce stade, c'est la Task 4 qui les rend facultatifs.
- [ ] **Step 5 :** `npx vitest run && npm run typecheck` → tout est vert, sauf le typecheck des `.vue` qui utilisent encore `rootDomain`, `setHost`… Ceux-là sont traités dans la Task 3.

### Task 3 : Interface — champ unique

Elle commence une fois la maquette de la Task 0 validée.

**Files :**
- Modify : `src/components/ServiceCard.vue` (bloc « Address », lignes ~168-212)
- Modify : `src/pages/OnboardingPage.vue` (section « Serveur » et computed `rootDomain`), `src/pages/SettingsPage.vue` (idem, lignes ~48 et ~120-140)

**Interfaces :**
- Consumes : `setUrl`, `urlOf`, `urlError` (Task 2). `meta.defaultSubdomain` ne sert plus qu'au placeholder.

- [ ] **Step 1 : `ServiceCard`.** Quand `needsSubdomain` (à renommer `needsAddress`) est vrai, afficher un seul champ : icône `Globe`, `v-model` sur `svc.url` via `setUrl`, `inputmode="url"`, placeholder `` `https://${meta.defaultSubdomain || 'service'}.domaine.com` ``. Retirer le crayon, le bouton de retour au domaine racine, `customHost` et `useCustomHost`. Un ref local `touched` passe à `true` au `@blur`. Sous le champ, si `touched && conn.urlError(id)`, afficher `<p class="text-[11.5px] text-danger px-1">{{ conn.urlError(id) }}</p>`. Le bouton Tester est `:disabled="!!conn.urlError(id)"`.
- [ ] **Step 2 : Pages.** Supprimer la section « Serveur / Domaine racine » de l'onboarding et des réglages, ainsi que leurs computed et les imports devenus inutiles.
- [ ] **Step 3 :** `npm run typecheck && npx vitest run && npm run build` → vert.
- [ ] **Step 4 : Vérifier à l'œil** avec `npm run dev` : la page Réglages correspond à la maquette validée (dark et light).

### Task 4 : qBittorrent sans identifiants

**Files :**
- Modify : `src/services/qbittorrent.ts` (`login`, `req`)
- Modify : `src/store/connection-store.ts` (`qbitConfig`, `testService` branche userpass)
- Modify : `src/components/ServiceCard.vue` (placeholders userpass, seulement quand `id === "qbittorrent"`)
- Test : `src/services/qbit-nologin.test.ts`

**Interfaces :**
- Consumes : `QbitConfig` direct avec `username?`/`password?` (Task 2).

- [ ] **Step 1 : Tests**
  - Direct sans identifiants : `getTransferInfo()` fait **un seul** appel, vers `.../api/v2/transfer/info`, sans appel à `/auth/login` et sans header `Cookie`.
  - Direct sans identifiants, réponse 403 : `HttpError` avec `kind: "auth"` et le message exact `qBittorrent demande un login — renseigne-le, ou autorise ton sous-réseau dans qBittorrent`. Pas de tentative de relogin.
  - Store : `username: "u"` et mot de passe vide, `testService("qbittorrent")` renvoie `false`, `error === "Identifiant et mot de passe vont ensemble"`, et `request` n'est pas appelé.
  - Store : les deux vides avec une URL valide, `qbitConfig` n'est pas `null`.
- [ ] **Step 2 :** `npx vitest run src/services/qbit-nologin.test.ts` → FAIL.
- [ ] **Step 3 : Implémenter.**
  - `qbitConfig` n'exige plus que l'URL, avec `username` et `password` à `undefined` s'ils sont vides.
  - `login()` sort immédiatement si `!cfg.username && !cfg.password`.
  - La relance sur 403 de `req` ne se fait que s'il y a des identifiants.
  - Dans `testService`, l'exigence « Identifiant et mot de passe requis » reste pour Jellyfin uniquement. Pour qBittorrent, l'erreur « vont ensemble » se déclenche si exactement un des deux est rempli.
  - Placeholders qBittorrent : `Identifiant (facultatif)` et `Mot de passe (facultatif)`.
- [ ] **Step 4 :** `npx vitest run && npm run typecheck` → vert.

### Task 5 : Plex par code plex.tv/link

**Files :**
- Modify : `src/services/plex.ts` (`createPin`)
- Modify : `src/types/media.ts` (`PlexPin.expiresIn?: number`)
- Modify : `src/store/connection-store.ts` (`startPlexAuth`, nouvelle action `openPlexLink`, suppression de `waitForReturn`, `PIN_GRACE_MS` et du polling post-retour s'ils ne servent plus)
- Modify : `src/components/ServiceCard.vue` (bloc d'attente Plex, bouton principal)
- Test : `src/services/plex-link.test.ts`

**Interfaces :**
- Produces : `createPin(): Promise<PlexPin>` (plus d'`authUrl`).
- Produces : `pairing.plex = { active: true, code: string }` pendant l'attente, comme pour Jellyfin.
- Produces : action `openPlexLink(): Promise<void>`, qui ouvre `https://plex.tv/link` via `Browser.open`.

- [ ] **Step 1 : Tests** (mocks `@capacitor/core`, `@capacitor/preferences`, `@capacitor/browser`, `@capacitor/app`, faux timers Vitest)
  - `createPin()` envoie un POST sur `https://plex.tv/api/v2/pins` avec `strong=false` dans l'URL, jamais `strong=true`.
  - `startPlexAuth()` : après la création du PIN, `pairing.plex.code === "7K2Q"`.
  - Polling : 1ʳᵉ réponse `{ authToken: null }`, 2ᵉ rejet réseau (`request` rejette), 3ᵉ `{ authToken: "tok" }`. `apiKeys.plex` vaut alors `"tok"` et `discoverPlex` est appelé (à espionner).
  - `cancelPairing("plex")` pendant l'attente : `startPlexAuth` renvoie `false` sans erreur affichée.
  - Avec `expiresIn: 10` et aucun token : on obtient `false`, `error === "Code expiré — réessaie"`.
- [ ] **Step 2 :** `npx vitest run src/services/plex-link.test.ts` → FAIL.
- [ ] **Step 3 : Implémenter.**
  - `createPin` utilise `params: { strong: false }`.
  - `startPlexAuth` fixe la deadline à `now + (pin.expiresIn ? pin.expiresIn * 1000 : PAIRING_TIMEOUT_MS)`, puis boucle `sleep(POLL_INTERVAL_MS)` → `checkPin`. Une `HttpError` de `kind: "network"` fait `continue`, toute autre erreur fait `fail`. Une fois le token reçu : `Browser.close().catch(() => {})`, puis on persiste et on appelle `discoverPlex`, comme aujourd'hui.
- [ ] **Step 4 : `ServiceCard`.**
  - Le bloc du code Jellyfin devient générique : libellé « Saisis ce code dans Jellyfin » pour Jellyfin, « Saisis ce code sur **plex.tv/link** » pour Plex.
  - Pour Plex, ajouter sous le code un bouton secondaire « Ouvrir plex.tv/link » qui appelle `openPlexLink`.
  - Supprimer l'ancien bloc « 1. Sur plex.tv, appuie sur Connexion… ».
  - Bouton principal : icône `Link` pour Plex aussi.
- [ ] **Step 5 :** `npx vitest run && npm run typecheck && npm run build` → vert.

### Task 6 : Build et installation sur le Pixel

- [ ] **Step 1 :** `npm run android:build` → `BUILD SUCCESSFUL`.
- [ ] **Step 2 :** `adb devices -l`, repérer la ligne `model:Pixel_10`, puis `adb -s <serial> install -r android/app/build/outputs/apk/debug/app-debug.apk` → `Success`.
- [ ] **Step 3 :** comparer `sha256sum` de l'APK local et celui de `adb -s <serial> shell sha256sum $(pm path …)` : ils doivent être identiques.
- [ ] **Step 4 :** demander à l'utilisateur de vérifier sur le Pixel (adresse `http://` d'un service, qBittorrent sans login, code Plex).
