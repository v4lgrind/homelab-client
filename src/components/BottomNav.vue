<script setup lang="ts">
import { RouterLink, useRoute } from "vue-router";
import { LayoutGrid, Search, ArrowDownToLine, Gauge, Settings, type LucideIcon } from "@lucide/vue";

const route = useRoute();

const items: { name: string; to: string; label: string; icon: LucideIcon }[] = [
  { name: "library", to: "/", label: "Bibliothèque", icon: LayoutGrid },
  { name: "search", to: "/search", label: "Recherche", icon: Search },
  { name: "activity", to: "/activity", label: "Activité", icon: ArrowDownToLine },
  { name: "stats", to: "/stats", label: "Stats", icon: Gauge },
  { name: "settings", to: "/settings", label: "Réglages", icon: Settings },
];
</script>

<template>
  <nav
    class="fixed inset-x-4 bottom-[18px] h-16 rounded-[22px] border border-border flex items-center justify-around px-1.5 z-40 max-w-md mx-auto backdrop-blur-xl"
    style="background: var(--nav-bg)"
  >
    <RouterLink
      v-for="it in items"
      :key="it.name"
      :to="it.to"
      class="flex flex-col items-center gap-1 text-[9px] font-medium px-1 whitespace-nowrap"
      :class="route.name === it.name ? 'text-accent font-bold' : 'text-muted'"
    >
      <component :is="it.icon" :size="20" :stroke-width="route.name === it.name ? 2.4 : 2" />
      {{ it.label }}
    </RouterLink>
  </nav>
</template>
