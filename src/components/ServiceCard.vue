<script setup lang="ts">
import { computed, ref } from "vue";
import {
  KeyRound,
  User,
  Link,
  ExternalLink,
  Server,
  ChevronRight,
  Globe,
  AlertCircle,
  Unplug,
  Check,
  LoaderCircle,
  Eye,
  EyeOff,
  ShieldCheck,
} from "@lucide/vue";
import { AUTH_LABELS, SERVICES } from "@/constants";
import type { AuthType, ServiceId } from "@/types/service";
import { useConnectionStore } from "@/store/connection-store";
import ServiceLogo from "@/components/ServiceLogo.vue";
import { shortFingerprint } from "@/lib/format";

const props = defineProps<{ id: ServiceId }>();

const conn = useConnectionStore();
const meta = computed(() => SERVICES.find((s) => s.id === props.id)!);
const svc = computed(() => conn.services[props.id]);
/** The user's pick when the service offers a choice, else its only method. */
const auth = computed<AuthType>(() => conn.authTypeOf(props.id));

const address = computed({
  get: () => svc.value.url ?? "",
  set: (v: string) => conn.setUrl(props.id, v),
});
/** Only complain about the address once the user has left the field. */
const addressTouched = ref(false);
const addressError = computed(() => conn.urlError(props.id));
const apiKey = computed({
  get: () => conn.apiKeys[props.id] ?? "",
  set: (v: string) => conn.setApiKey(props.id, v),
});

const username = computed({
  get: () => svc.value.username ?? "",
  set: (v: string) => conn.setUsername(props.id, v),
});
const password = computed({
  get: () => conn.passwords[props.id] ?? "",
  set: (v: string) => conn.setPassword(props.id, v),
});

const showKey = ref(false);
const showPassword = ref(false);
const testing = computed(() => svc.value.status === "testing");

/** Plex needs no address: plex.tv hands it over after sign-in. The qui proxy
 *  URL is already absolute. */
const needsAddress = computed(() => auth.value !== "proxyurl" && auth.value !== "plexauth");

/** Services signed into interactively rather than by pasting a key. */
const isInteractive = computed(
  () => auth.value === "quickconnect" || auth.value === "plexauth",
);
const pairing = computed(() =>
  props.id === "jellyfin" || props.id === "plex" ? conn.pairing[props.id] : undefined,
);
const connected = computed(() => !!conn.apiKeys[props.id]?.trim());
/** Plex: the server list is open, waiting for the user to pick one. */
const choosingServer = computed(() => props.id === "plex" && conn.plexChoices.length > 0);

function test() {
  if (!testing.value && !addressError.value) conn.testService(props.id);
}

function connect() {
  if (props.id === "jellyfin") conn.startQuickConnect();
  else if (props.id === "plex") conn.startPlexAuth();
}

function cancel() {
  if (props.id === "jellyfin" || props.id === "plex") conn.cancelPairing(props.id);
}

async function disconnect() {
  await conn.resetService(props.id);
}
</script>

<template>
  <!-- Unavailable module: compact "coming soon" card -->
  <div
    v-if="!meta.available"
    class="flex items-center gap-3 rounded-[20px] bg-surface border border-border p-3.5 opacity-50"
  >
    <ServiceLogo :id="id" />
    <div>
      <p class="font-bold text-[15px] leading-tight">{{ meta.name }}</p>
      <p class="text-xs text-sub">{{ meta.desc }}</p>
    </div>
    <span class="ml-auto text-[11px] font-semibold text-muted bg-chip px-2 py-1 rounded-lg">
      À venir
    </span>
  </div>

  <!-- Available module: full config card -->
  <div v-else class="flex flex-col gap-2.5 rounded-[20px] bg-surface border border-border p-3.5">
    <div class="flex items-center gap-3">
      <ServiceLogo :id="id" />
      <div>
        <p class="font-bold text-[15px] leading-tight">{{ meta.name }}</p>
        <p class="text-xs text-sub">{{ meta.desc }}</p>
      </div>
      <div class="ml-auto flex items-center gap-1.5 text-xs font-semibold">
        <span
          class="size-2 rounded-full"
          :class="{
            'bg-ok': svc.status === 'ok',
            'bg-danger': svc.status === 'error',
            'bg-muted': svc.status === 'idle' || svc.status === 'testing',
          }"
          :style="
            svc.status === 'ok'
              ? 'box-shadow: 0 0 0 4px color-mix(in srgb, var(--ok) 22%, transparent)'
              : undefined
          "
        />
        <span
          :class="{
            'text-ok': svc.status === 'ok',
            'text-danger': svc.status === 'error',
            'text-muted': svc.status === 'idle' || svc.status === 'testing',
          }"
        >
          {{
            svc.status === "ok"
              ? "Connecté"
              : svc.status === "error"
                ? "Erreur"
                : svc.status === "testing"
                  ? "Test…"
                  : "Non testé"
          }}
        </span>
      </div>
    </div>

    <!-- auth picker, for services reachable more than one way (qBittorrent) -->
    <div v-if="meta.authTypes" class="flex gap-1 p-1 rounded-[14px] bg-field border border-field-border">
      <button
        v-for="t in meta.authTypes"
        :key="t"
        type="button"
        class="flex-1 py-1.5 rounded-[10px] text-[12.5px] font-semibold transition"
        :class="auth === t ? 'bg-accent text-accent-ink' : 'text-sub active:scale-95'"
        @click="conn.setAuthType(id, t)"
      >
        {{ meta.authLabels?.[t] ?? AUTH_LABELS[t] ?? t }}
      </button>
    </div>

    <!-- Address: the full URL. No scheme means https; http:// reaches a
         service on the LAN / over the VPN, skipping the reverse proxy. -->
    <template v-if="needsAddress">
      <div
        class="flex items-center gap-2 h-11 rounded-[14px] bg-field border px-3"
        :class="addressTouched && addressError ? 'border-danger/55' : 'border-field-border'"
      >
        <Globe :size="16" class="text-muted shrink-0" />
        <input
          v-model="address"
          class="flex-1 min-w-0 bg-transparent outline-none text-[14px]"
          :placeholder="id === 'proxmox' ? 'https://192.168.1.10:8006' : `https://${meta.defaultSubdomain || 'service'}.domaine.com`"
          inputmode="url"
          autocapitalize="none"
          autocorrect="off"
          spellcheck="false"
          @blur="addressTouched = true"
        />
      </div>
      <p
        v-if="addressTouched && addressError"
        class="text-[11.5px] text-danger px-1 -mt-1 flex items-start gap-1.5 leading-snug"
      >
        <AlertCircle :size="13" class="shrink-0 mt-px" />
        {{ addressError }}
      </p>
    </template>

    <!-- username + password (qBittorrent, direct) -->
    <template v-if="auth === 'userpass'">
      <div class="flex items-center gap-2 h-11 rounded-[14px] bg-field border border-field-border px-3">
        <User :size="16" class="text-muted shrink-0" />
        <input
          v-model="username"
          class="flex-1 min-w-0 bg-transparent outline-none text-[15px]"
          :placeholder="id === 'qbittorrent' ? 'Identifiant (facultatif)' : id === 'proxmox' ? 'Utilisateur@royaume (ex. root@pam)' : 'Identifiant'"
          autocapitalize="none"
          autocorrect="off"
          spellcheck="false"
        />
      </div>
      <div class="flex items-center gap-2 h-11 rounded-[14px] bg-field border border-field-border px-3">
        <KeyRound :size="16" class="text-muted shrink-0" />
        <input
          v-model="password"
          :type="showPassword ? 'text' : 'password'"
          class="flex-1 min-w-0 bg-transparent outline-none text-[15px]"
          :placeholder="id === 'qbittorrent' ? 'Mot de passe (facultatif)' : 'Mot de passe'"
          autocapitalize="none"
          autocorrect="off"
          spellcheck="false"
        />
        <button class="text-muted shrink-0" type="button" @click="showPassword = !showPassword">
          <component :is="showPassword ? EyeOff : Eye" :size="18" />
        </button>
      </div>
    </template>

    <p v-if="id === 'proxmox'" class="text-[11.5px] text-muted px-1 -mt-1 leading-snug">
      Identifiant avec son royaume : <b class="text-sub font-semibold">root@pam</b> (compte Linux) ou
      <b class="text-sub font-semibold">utilisateur@pve</b>. Un compte dédié en lecture seule (rôle PVEAuditor) suffit.
    </p>

    <!-- Proxmox: the self-signed certificate pinned on first contact, to compare
         with Node → System → Certificates in the Proxmox GUI. -->
    <div
      v-if="id === 'proxmox' && svc.certSha256"
      class="flex items-start gap-2 rounded-[14px] bg-field border border-field-border px-3 py-2.5 text-xs text-sub leading-snug"
    >
      <ShieldCheck :size="15" class="text-ok shrink-0 mt-px" />
      <div class="min-w-0">
        <p class="font-semibold text-text">Certificat auto-signé mémorisé</p>
        <p class="font-mono text-[12px] truncate" :title="svc.certSha256">SHA-256 {{ shortFingerprint(svc.certSha256) }}</p>
      </div>
    </div>

    <!-- api key (only for services authenticated by key) -->
    <div v-if="auth === 'apikey'" class="flex items-center gap-2 h-11 rounded-[14px] bg-field border border-field-border px-3">
      <KeyRound :size="16" class="text-muted shrink-0" />
      <input
        v-model="apiKey"
        :type="showKey ? 'text' : 'password'"
        class="flex-1 min-w-0 bg-transparent outline-none text-[15px]"
        placeholder="Clé API"
        autocapitalize="none"
        autocorrect="off"
        spellcheck="false"
      />
      <button class="text-muted shrink-0" type="button" @click="showKey = !showKey">
        <component :is="showKey ? EyeOff : Eye" :size="18" />
      </button>
    </div>

    <!-- qui proxy URL (qBittorrent) -->
    <div v-if="auth === 'proxyurl'" class="flex items-center gap-2 h-11 rounded-[14px] bg-field border border-field-border px-3">
      <Link :size="16" class="text-muted shrink-0" />
      <input
        v-model="apiKey"
        :type="showKey ? 'text' : 'password'"
        class="flex-1 min-w-0 bg-transparent outline-none text-[14px]"
        placeholder="https://qui…/proxy/clé"
        autocapitalize="none"
        autocorrect="off"
        spellcheck="false"
      />
      <button class="text-muted shrink-0" type="button" @click="showKey = !showKey">
        <component :is="showKey ? EyeOff : Eye" :size="18" />
      </button>
    </div>

    <!-- Pairing code: typed into a signed-in Jellyfin (Quick Connect) or at
         plex.tv/link, from any device. The app notices on its own. -->
    <div
      v-if="pairing?.active && pairing.code"
      class="rounded-[14px] bg-field border border-field-border px-3 py-3 text-center"
    >
      <p v-if="id === 'plex'" class="text-[11px] text-muted font-semibold">
        Saisis ce code sur <span class="text-surface-text font-bold">plex.tv/link</span>
      </p>
      <p v-else class="text-[11px] text-muted font-semibold">Saisis ce code dans Jellyfin</p>
      <p class="text-[26px] font-bold tracking-[0.18em] my-1">{{ pairing.code }}</p>
      <p class="text-[11px] text-sub flex items-center justify-center gap-1.5">
        <LoaderCircle :size="12" class="animate-spin" />
        En attente…
      </p>
      <button
        v-if="id === 'plex'"
        type="button"
        class="mt-2.5 px-3.5 py-2 rounded-xl bg-chip text-surface-text text-[12.5px] font-semibold border border-border inline-flex items-center gap-1.5 active:scale-95 transition"
        @click="conn.openPlexLink()"
      >
        <ExternalLink :size="14" />
        Ouvrir plex.tv/link
      </button>
    </div>

    <!-- Plex: the account may see several servers (its own, shared ones) -->
    <div v-if="choosingServer" class="flex flex-col gap-1.5">
      <p class="text-[12px] text-sub font-semibold px-0.5">Quel serveur utiliser ?</p>
      <button
        v-for="s in conn.plexChoices"
        :key="s.clientIdentifier"
        type="button"
        class="flex items-center gap-2.5 rounded-[14px] bg-field border border-field-border px-3 py-2.5 text-left active:scale-[0.99] transition"
        @click="conn.selectPlexServer(s.clientIdentifier)"
      >
        <Server :size="16" class="text-muted shrink-0" />
        <span class="font-bold text-[14.5px] truncate">{{ s.name }}</span>
        <span
          v-if="s.owned !== undefined"
          class="text-[10.5px] font-bold tracking-[0.06em] uppercase px-[7px] py-[3px] rounded-[7px]"
          :class="s.owned ? 'text-accent' : 'bg-chip text-sub'"
          :style="s.owned ? 'background: color-mix(in srgb, var(--accent) 18%, transparent)' : undefined"
        >
          {{ s.owned ? "À toi" : "Partagé" }}
        </span>
        <ChevronRight :size="16" class="text-muted shrink-0 ml-auto" />
      </button>
      <button
        type="button"
        class="self-start mt-1 px-3.5 py-2 rounded-xl bg-chip text-sub text-[12.5px] font-semibold border border-border active:scale-95 transition"
        @click="conn.cancelPlexChoice()"
      >
        Annuler
      </button>
    </div>

    <!-- chosen Plex server -->
    <p
      v-else-if="auth === 'plexauth' && svc.serverName"
      class="text-[12.5px] text-sub px-0.5 flex items-center gap-2"
    >
      <Server :size="15" class="text-muted shrink-0" />
      <span class="truncate">Serveur : <b class="text-surface-text">{{ svc.serverName }}</b></span>
      <button type="button" class="ml-auto text-accent font-semibold" @click="conn.changePlexServer()">
        Changer
      </button>
    </p>

    <!-- action / result -->
    <div v-if="!choosingServer" class="flex items-center gap-2 flex-wrap">
      <!-- interactive sign-in: no key to paste, the server or plex.tv approves -->
      <template v-if="isInteractive && !connected">
        <button
          v-if="!pairing?.active"
          type="button"
          class="self-start px-3.5 py-2 rounded-xl bg-accent text-accent-ink text-[12.5px] font-semibold flex items-center gap-1.5 active:scale-95 transition"
          @click="connect"
        >
          <Link :size="14" />
          {{ auth === "plexauth" ? "Se connecter à Plex" : "Quick Connect" }}
        </button>
        <button
          v-else
          type="button"
          class="self-start px-3.5 py-2 rounded-xl bg-chip text-sub text-[12.5px] font-semibold border border-border active:scale-95 transition"
          @click="cancel"
        >
          Annuler
        </button>
      </template>

      <button
        v-else-if="svc.status !== 'ok'"
        type="button"
        :disabled="testing || !!addressError"
        class="self-start px-3.5 py-2 rounded-xl bg-chip text-surface-text text-[12.5px] font-semibold border border-border flex items-center gap-1.5 active:scale-95 transition disabled:opacity-40"
        @click="test"
      >
        <LoaderCircle v-if="testing" :size="14" class="animate-spin" />
        {{ testing ? "Test en cours…" : "Tester la connexion" }}
      </button>
      <button
        v-else
        type="button"
        class="self-start px-3.5 py-2 rounded-xl text-[12.5px] font-semibold flex items-center gap-1.5 text-ok"
        style="background: color-mix(in srgb, var(--ok) 16%, transparent)"
        @click="test"
      >
        <Check :size="14" :stroke-width="2.6" />
        Testé{{ svc.version ? ` · ${id === "proxmox" ? "PVE " : "v"}${svc.version}` : "" }}
      </button>

      <button
        v-if="isInteractive && connected"
        type="button"
        class="self-start px-3.5 py-2 rounded-xl bg-chip text-sub text-[12.5px] font-semibold border border-border flex items-center gap-1.5 active:scale-95 transition"
        @click="disconnect"
      >
        <Unplug :size="14" />
        Déconnecter
      </button>
    </div>


    <p v-if="svc.status === 'error' && svc.error" class="text-xs text-danger px-1">
      {{ svc.error }}
    </p>
  </div>
</template>
