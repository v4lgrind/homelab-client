<script setup lang="ts">
import { computed, ref } from "vue";
import {
  Film,
  Tv,
  ArrowDownToLine,
  Activity,
  KeyRound,
  User,
  Check,
  LoaderCircle,
  Eye,
  EyeOff,
  type LucideIcon,
} from "@lucide/vue";
import { SERVICES } from "@/constants";
import type { ServiceId } from "@/types/service";
import { useConnectionStore } from "@/store/connection-store";

const props = defineProps<{ id: ServiceId }>();

const conn = useConnectionStore();
const meta = computed(() => SERVICES.find((s) => s.id === props.id)!);
const svc = computed(() => conn.services[props.id]);

const ICONS: Record<ServiceId, LucideIcon> = {
  radarr: Film,
  sonarr: Tv,
  qbittorrent: ArrowDownToLine,
  glances: Activity,
};

const subdomain = computed({
  get: () => svc.value.subdomain,
  set: (v: string) => conn.setSubdomain(props.id, v),
});
const apiKey = computed({
  get: () => conn.apiKeys[props.id] ?? "",
  set: (v: string) => conn.setApiKey(props.id, v),
});
const username = computed({
  get: () => svc.value.username ?? "",
  set: (v: string) => conn.setUsername(props.id, v),
});

const showKey = ref(false);
const testing = computed(() => svc.value.status === "testing");

function test() {
  if (!testing.value) conn.testService(props.id);
}
</script>

<template>
  <!-- Unavailable module: compact "coming soon" card -->
  <div
    v-if="!meta.available"
    class="flex items-center gap-3 rounded-[20px] bg-surface border border-border p-3.5 opacity-50"
  >
    <div class="size-10 rounded-xl bg-chip grid place-items-center text-accent shrink-0">
      <component :is="ICONS[id]" :size="20" />
    </div>
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
      <div class="size-10 rounded-xl bg-chip grid place-items-center text-accent shrink-0">
        <component :is="ICONS[id]" :size="20" />
      </div>
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

    <!-- subdomain -->
    <div class="flex items-center gap-2 h-11 rounded-[14px] bg-field border border-field-border px-3">
      <input
        v-model="subdomain"
        class="flex-1 min-w-0 bg-transparent outline-none text-[15px] text-right"
        placeholder="sous-domaine"
        autocapitalize="none"
        autocorrect="off"
        spellcheck="false"
      />
      <span class="text-[13px] font-semibold text-muted whitespace-nowrap">
        .{{ conn.rootDomain || "mondomaine.com" }}
      </span>
    </div>

    <!-- api key (only for services authenticated by key) -->
    <div v-if="meta.authType === 'apikey'" class="flex items-center gap-2 h-11 rounded-[14px] bg-field border border-field-border px-3">
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

    <!-- username + password (userpass services, e.g. qBittorrent) -->
    <template v-if="meta.authType === 'userpass'">
      <div class="flex items-center gap-2 h-11 rounded-[14px] bg-field border border-field-border px-3">
        <User :size="16" class="text-muted shrink-0" />
        <input
          v-model="username"
          class="flex-1 min-w-0 bg-transparent outline-none text-[15px]"
          placeholder="Utilisateur"
          autocapitalize="none"
          autocorrect="off"
          spellcheck="false"
        />
      </div>
      <div class="flex items-center gap-2 h-11 rounded-[14px] bg-field border border-field-border px-3">
        <KeyRound :size="16" class="text-muted shrink-0" />
        <input
          v-model="apiKey"
          :type="showKey ? 'text' : 'password'"
          class="flex-1 min-w-0 bg-transparent outline-none text-[15px]"
          placeholder="Mot de passe"
          autocapitalize="none"
          autocorrect="off"
          spellcheck="false"
        />
        <button class="text-muted shrink-0" type="button" @click="showKey = !showKey">
          <component :is="showKey ? EyeOff : Eye" :size="18" />
        </button>
      </div>
    </template>

    <!-- action / result -->
    <div class="flex items-center gap-2 flex-wrap">
      <button
        v-if="svc.status !== 'ok'"
        type="button"
        :disabled="testing"
        class="self-start px-3.5 py-2 rounded-xl bg-chip text-surface-text text-[12.5px] font-semibold border border-border flex items-center gap-1.5 active:scale-95 transition disabled:opacity-60"
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
        Testé{{ svc.version ? ` · v${svc.version}` : "" }}
      </button>
    </div>

    <p v-if="svc.status === 'error' && svc.error" class="text-xs text-danger px-1">
      {{ svc.error }}
    </p>
  </div>
</template>
