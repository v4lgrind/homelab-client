<script setup lang="ts">
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import {
  ChevronLeft,
  Globe,
  SunMedium,
  Moon,
  MonitorSmartphone,
  Trash2,
  Bell,
  Link as LinkIcon,
  KeyRound,
  Check,
  LoaderCircle,
  Eye,
  EyeOff,
} from "@lucide/vue";
import ServiceCard from "@/components/ServiceCard.vue";
import { SERVICES } from "@/constants";
import { useConnectionStore } from "@/store/connection-store";
import { useLibraryStore } from "@/store/library-store";
import { useNotificationsStore } from "@/store/notifications-store";
import { useTheme } from "@/composables/useTheme";
import { useConfirm } from "@/composables/useConfirm";
import { formatSize } from "@/lib/format";

const { confirm } = useConfirm();

const conn = useConnectionStore();
const lib = useLibraryStore();
const notif = useNotificationsStore();
const router = useRouter();
const { theme, cycleTheme } = useTheme();

const cacheLabel = computed(() => {
  const bytes = lib.cacheBytes;
  if (!bytes) return "Vide — sera rempli au prochain chargement";
  const count = lib.movies.length + lib.series.length;
  return `${count} titres · ${formatSize(bytes)}`;
});

function purge() {
  lib.clearCache();
}

const rootDomain = computed({
  get: () => conn.rootDomain,
  set: (v: string) => conn.setRootDomain(v),
});

const themeIcon = computed(() =>
  theme.value === "light" ? SunMedium : theme.value === "dark" ? Moon : MonitorSmartphone,
);
const themeLabel = computed(() =>
  theme.value === "light" ? "Clair" : theme.value === "dark" ? "Sombre" : "Auto",
);

const hubUrl = computed({
  get: () => notif.hubUrl,
  set: (v: string) => notif.setHubUrl(v),
});
const hubToken = ref(notif.token);
const showHubToken = ref(false);
const hubStatus = ref<"idle" | "testing" | "ok" | "error">("idle");
const hubError = ref<string | undefined>();

async function onHubTokenLoaded() {
  if (!notif.tokenLoaded) await notif.loadToken();
  hubToken.value = notif.token;
}
onHubTokenLoaded();

async function testHub() {
  await notif.setToken(hubToken.value);
  hubStatus.value = "testing";
  hubError.value = undefined;
  const ok = await notif.test();
  hubStatus.value = ok ? "ok" : "error";
  if (ok) notif.reconnect(); // pick up the new URL/token on the live stream
  else hubError.value = notif.error;
}

async function reset() {
  const ok = await confirm({
    title: "Réinitialiser toute la configuration ?",
    message: "Tous les services, clés et réglages seront effacés de l'appareil.",
    confirmText: "Réinitialiser",
    danger: true,
  });
  if (!ok) return;
  await conn.resetAll();
  router.push({ name: "onboarding" });
}
</script>

<template>
  <main class="min-h-dvh px-[22px] pt-14 pb-10 max-w-md mx-auto">
    <header class="flex items-center gap-2 mb-6">
      <button
        class="size-10 -ml-2 grid place-items-center text-sub active:scale-95 transition"
        aria-label="Retour"
        @click="router.back()"
      >
        <ChevronLeft :size="24" />
      </button>
      <h1 class="text-2xl font-bold -tracking-[0.02em]">Réglages</h1>
    </header>

    <!-- Apparence -->
    <section class="rounded-[22px] bg-surface border border-border p-4 mb-3.5">
      <p class="text-xs font-semibold tracking-[0.12em] uppercase text-muted mb-3">Apparence</p>
      <button
        class="w-full flex items-center justify-between h-12 rounded-[14px] bg-field border border-field-border px-3.5 active:scale-[0.99] transition"
        @click="cycleTheme"
      >
        <span class="text-[15px] font-medium">Thème</span>
        <span class="flex items-center gap-2 text-sub text-sm font-semibold">
          {{ themeLabel }}
          <component :is="themeIcon" :size="18" />
        </span>
      </button>
    </section>

    <!-- Serveur -->
    <section class="rounded-[22px] bg-surface border border-border p-4 mb-3.5">
      <p class="flex items-center gap-2 text-xs font-semibold tracking-[0.12em] uppercase text-muted mb-3">
        <Globe :size="14" /> Serveur
      </p>
      <label class="block text-[12.5px] font-semibold text-sub mb-1.5 ml-1">Domaine racine</label>
      <div class="flex items-center gap-2 h-[50px] rounded-[14px] bg-field border border-field-border px-3">
        <span class="text-[15px] text-muted">https://</span>
        <input
          v-model="rootDomain"
          class="flex-1 min-w-0 bg-transparent outline-none text-[15px]"
          placeholder="mondomaine.com"
          autocapitalize="none"
          autocorrect="off"
          spellcheck="false"
          inputmode="url"
        />
      </div>
    </section>

    <!-- Services -->
    <p class="text-xs font-semibold tracking-[0.12em] uppercase text-muted mb-2.5 ml-1">Services</p>
    <div class="flex flex-col gap-3">
      <ServiceCard v-for="s in SERVICES" :key="s.id" :id="s.id" />
    </div>

    <!-- Notifications hub -->
    <p class="flex items-center gap-2 text-xs font-semibold tracking-[0.12em] uppercase text-muted mb-2.5 ml-1 mt-6">
      <Bell :size="13" /> Notifications
    </p>
    <section class="rounded-[22px] bg-surface border border-border p-4 flex flex-col gap-2.5">
      <p class="text-[12px] text-sub leading-snug -mt-0.5">
        Récepteur de webhooks self-hosté. Colle son URL et son jeton d'app.
      </p>
      <div class="flex items-center gap-2 h-11 rounded-[14px] bg-field border border-field-border px-3">
        <LinkIcon :size="16" class="text-muted shrink-0" />
        <input
          v-model="hubUrl"
          class="flex-1 min-w-0 bg-transparent outline-none text-[14px]"
          placeholder="https://hub.mondomaine.com"
          autocapitalize="none"
          autocorrect="off"
          spellcheck="false"
        />
      </div>
      <div class="flex items-center gap-2 h-11 rounded-[14px] bg-field border border-field-border px-3">
        <KeyRound :size="16" class="text-muted shrink-0" />
        <input
          v-model="hubToken"
          :type="showHubToken ? 'text' : 'password'"
          class="flex-1 min-w-0 bg-transparent outline-none text-[15px]"
          placeholder="Jeton d'app"
          autocapitalize="none"
          autocorrect="off"
          spellcheck="false"
        />
        <button class="text-muted shrink-0" type="button" @click="showHubToken = !showHubToken">
          <component :is="showHubToken ? EyeOff : Eye" :size="18" />
        </button>
      </div>
      <div class="flex items-center gap-2">
        <button
          type="button"
          :disabled="hubStatus === 'testing' || !hubUrl.trim() || !hubToken.trim()"
          class="self-start px-3.5 py-2 rounded-xl bg-chip text-surface-text text-[12.5px] font-semibold border border-border flex items-center gap-1.5 active:scale-95 transition disabled:opacity-60"
          @click="testHub"
        >
          <LoaderCircle v-if="hubStatus === 'testing'" :size="14" class="animate-spin" />
          <Check v-else-if="hubStatus === 'ok'" :size="14" class="text-ok" :stroke-width="2.6" />
          {{ hubStatus === "ok" ? "Connecté" : hubStatus === "testing" ? "Test…" : "Tester le hub" }}
        </button>
      </div>
      <p v-if="hubStatus === 'error' && hubError" class="text-xs text-danger px-1">{{ hubError }}</p>
    </section>

    <!-- Cache -->
    <p class="text-xs font-semibold tracking-[0.12em] uppercase text-muted mb-2.5 ml-1 mt-6">Cache</p>
    <section class="rounded-[22px] bg-surface border border-border p-4">
      <div class="flex items-center justify-between gap-3">
        <div>
          <p class="text-[15px] font-semibold leading-tight">Bibliothèque en cache</p>
          <p class="text-xs text-sub mt-0.5">
            {{ cacheLabel }}
          </p>
        </div>
        <button
          type="button"
          class="shrink-0 px-3.5 py-2 rounded-xl bg-chip border border-border text-[12.5px] font-semibold text-surface-text flex items-center gap-1.5 active:scale-95 transition disabled:opacity-50"
          :disabled="!lib.cacheBytes"
          @click="purge"
        >
          <Trash2 :size="14" />
          Vider
        </button>
      </div>
      <p class="text-[11px] text-muted mt-2.5 leading-snug">
        Les listes sont affichées immédiatement puis rafraîchies en arrière-plan.
        Les jaquettes, elles, sont gérées par le cache du système.
      </p>
    </section>

    <!-- Reset -->
    <button
      type="button"
      class="w-full h-12 mt-6 rounded-2xl bg-surface border border-border text-danger font-semibold text-[15px] flex items-center justify-center gap-2 active:scale-[0.98] transition"
      @click="reset"
    >
      <Trash2 :size="18" />
      Réinitialiser la configuration
    </button>
  </main>
</template>
