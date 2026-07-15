<script setup lang="ts">
import { RouterLink, useRoute } from "vue-router";
import { LayoutGrid, Search, ArrowDownToLine, ArrowDownUp, Server, Settings, type LucideIcon } from "@lucide/vue";

const route = useRoute();

const items: { name: string; to: string; label: string; icon: LucideIcon }[] = [
  { name: "library", to: "/", label: "Biblio", icon: LayoutGrid },
  { name: "search", to: "/search", label: "Recherche", icon: Search },
  { name: "activity", to: "/activity", label: "Activité", icon: ArrowDownToLine },
  { name: "torrents", to: "/torrents", label: "Torrents", icon: ArrowDownUp },
  { name: "stats", to: "/stats", label: "Serveur", icon: Server },
  { name: "settings", to: "/settings", label: "Réglages", icon: Settings },
];
</script>

<template>
  <nav
    class="fixed inset-x-3.5 bottom-[18px] h-[62px] rounded-[22px] border border-border flex items-center justify-around px-1 z-40 max-w-md mx-auto backdrop-blur-xl"
    style="background: var(--nav-bg)"
  >
    <RouterLink
      v-for="it in items"
      :key="it.name"
      :to="it.to"
      class="flex flex-col items-center gap-0.5 text-[8.5px] font-medium px-0.5 whitespace-nowrap"
      :class="route.name === it.name ? 'text-accent font-bold' : 'text-muted'"
    >
      <component :is="it.icon" :size="19" :stroke-width="route.name === it.name ? 2.4 : 2" />
      {{ it.label }}
    </RouterLink>
  </nav>
</template>
