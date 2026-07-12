<script setup lang="ts">
import { computed } from "vue";
import {
  Film,
  Tv,
  Download,
  Activity,
  SunMedium,
  Moon,
  MonitorSmartphone,
} from "@lucide/vue";
import { useTheme } from "@/composables/useTheme";
import { APP_NAME } from "@/constants";

const { theme, cycleTheme } = useTheme();

const themeIcon = computed(() =>
  theme.value === "light" ? SunMedium : theme.value === "dark" ? Moon : MonitorSmartphone,
);

const services = [
  { name: "Radarr", desc: "Films", icon: Film, ready: false },
  { name: "Sonarr", desc: "Séries", icon: Tv, ready: false },
  { name: "qBittorrent", desc: "Torrents", icon: Download, ready: false },
  { name: "Glances", desc: "Stats serveur", icon: Activity, ready: false },
];
</script>

<template>
  <main class="min-h-dvh px-5 pt-14 pb-10 max-w-md mx-auto">
    <header class="flex items-start justify-between mb-8">
      <div>
        <p class="text-[11px] tracking-[0.22em] uppercase text-muted font-semibold mb-1">
          Homelab
        </p>
        <h1 class="text-3xl font-bold tracking-tight">{{ APP_NAME }}</h1>
      </div>
      <button
        class="size-11 rounded-2xl bg-surface border border-border grid place-items-center text-sub active:scale-95 transition"
        aria-label="Changer de thème"
        @click="cycleTheme"
      >
        <component :is="themeIcon" :size="20" />
      </button>
    </header>

    <div class="grid grid-cols-2 gap-3">
      <article
        v-for="s in services"
        :key="s.name"
        class="rounded-3xl bg-surface border border-border p-4 h-32 flex flex-col justify-between"
      >
        <div
          class="size-11 rounded-2xl bg-chip grid place-items-center text-accent"
        >
          <component :is="s.icon" :size="22" />
        </div>
        <div>
          <p class="font-semibold leading-tight">{{ s.name }}</p>
          <p class="text-xs text-sub">{{ s.desc }}</p>
        </div>
      </article>
    </div>

    <p class="text-center text-xs text-muted mt-8">
      Squelette prêt · connexion Authelia à venir
    </p>
  </main>
</template>
