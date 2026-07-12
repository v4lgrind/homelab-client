<script setup lang="ts">
import { computed } from "vue";
import { useRouter } from "vue-router";
import { Film, Tv, ArrowDownToLine, Activity, Settings, type LucideIcon } from "@lucide/vue";
import BrandHeader from "@/components/BrandHeader.vue";
import { SERVICES } from "@/constants";
import type { ServiceId } from "@/types/service";
import { useConnectionStore } from "@/store/connection-store";

const conn = useConnectionStore();
const router = useRouter();

const ICONS: Record<ServiceId, LucideIcon> = {
  radarr: Film,
  sonarr: Tv,
  qbittorrent: ArrowDownToLine,
  glances: Activity,
};

const tiles = computed(() =>
  SERVICES.map((s) => ({
    ...s,
    icon: ICONS[s.id],
    configured: !!conn.apiKeys[s.id]?.trim(),
    status: conn.services[s.id].status,
    version: conn.services[s.id].version,
  })),
);
</script>

<template>
  <main class="min-h-dvh px-[22px] pt-14 pb-10 max-w-md mx-auto">
    <header class="flex items-start justify-between mb-8">
      <BrandHeader />
      <button
        class="size-11 rounded-2xl bg-surface border border-border grid place-items-center text-sub active:scale-95 transition"
        aria-label="Réglages"
        @click="router.push({ name: 'settings' })"
      >
        <Settings :size="20" />
      </button>
    </header>

    <div class="grid grid-cols-2 gap-3">
      <article
        v-for="t in tiles"
        :key="t.id"
        class="rounded-3xl bg-surface border border-border p-4 h-32 flex flex-col justify-between"
        :class="{ 'opacity-50': !t.available }"
      >
        <div class="flex items-start justify-between">
          <div class="size-11 rounded-2xl bg-chip grid place-items-center text-accent">
            <component :is="t.icon" :size="22" />
          </div>
          <span
            v-if="t.available && t.configured"
            class="size-2.5 rounded-full mt-1"
            :class="t.status === 'ok' ? 'bg-ok' : t.status === 'error' ? 'bg-danger' : 'bg-muted'"
          />
          <span
            v-else-if="!t.available"
            class="text-[10px] font-semibold text-muted bg-chip px-2 py-0.5 rounded-md mt-1"
          >
            À venir
          </span>
        </div>
        <div>
          <p class="font-semibold leading-tight">{{ t.name }}</p>
          <p class="text-xs text-sub">
            {{ t.available && t.version ? `v${t.version}` : t.desc }}
          </p>
        </div>
      </article>
    </div>

    <p class="text-center text-xs text-muted mt-8">
      Dashboard Radarr/Sonarr · Phase 2 à venir
    </p>
  </main>
</template>
