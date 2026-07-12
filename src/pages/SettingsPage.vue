<script setup lang="ts">
import { computed } from "vue";
import { useRouter } from "vue-router";
import {
  ChevronLeft,
  Globe,
  SunMedium,
  Moon,
  MonitorSmartphone,
  Trash2,
} from "@lucide/vue";
import ServiceCard from "@/components/ServiceCard.vue";
import { SERVICES } from "@/constants";
import { useConnectionStore } from "@/store/connection-store";
import { useTheme } from "@/composables/useTheme";

const conn = useConnectionStore();
const router = useRouter();
const { theme, cycleTheme } = useTheme();

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

async function reset() {
  if (!confirm("Réinitialiser toute la configuration ?")) return;
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
