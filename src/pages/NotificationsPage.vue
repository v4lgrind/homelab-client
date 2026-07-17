<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { ChevronLeft, CheckCheck, RefreshCw, BellOff, LoaderCircle, AlertCircle } from "@lucide/vue";
import SourceBadge from "@/components/SourceBadge.vue";
import { useNotificationsStore } from "@/store/notifications-store";
import { dayKey, dayLabel, timeShort } from "@/lib/format";
import type { HubNotification, NotificationLevel } from "@/types/notification";

const router = useRouter();
const notif = useNotificationsStore();

const LEVEL: Partial<Record<NotificationLevel, { label: string; cls: string }>> = {
  success: { label: "Succès", cls: "text-ok" },
  warning: { label: "Alerte", cls: "text-warn" },
  error: { label: "Erreur", cls: "text-danger" },
};
const LEVEL_BG: Record<string, string> = {
  "text-ok": "color-mix(in srgb, var(--ok) 15%, transparent)",
  "text-warn": "color-mix(in srgb, var(--warn) 15%, transparent)",
  "text-danger": "color-mix(in srgb, var(--danger) 15%, transparent)",
};

/** all · unread · a specific source. */
const filter = ref<string>("all");

const sources = computed(() => [...new Set(notif.notifications.map((n) => n.source))]);

const visible = computed(() => {
  if (filter.value === "all") return notif.notifications;
  if (filter.value === "unread") return notif.notifications.filter((n) => notif.isUnread(n));
  return notif.notifications.filter((n) => n.source === filter.value);
});

/** Group the visible notifications by calendar day, newest first. */
const groups = computed(() => {
  const out: { key: string; label: string; items: HubNotification[] }[] = [];
  for (const n of visible.value) {
    const key = dayKey(n.ts);
    const last = out[out.length - 1];
    if (last && last.key === key) last.items.push(n);
    else out.push({ key, label: dayLabel(n.ts), items: [n] });
  }
  return out;
});

function load() {
  notif.fetch();
}

onMounted(() => {
  if (!notif.tokenLoaded) notif.loadToken().then(load);
  else load();
});
</script>

<template>
  <div class="min-h-dvh pb-10 max-w-md mx-auto px-5 pt-14">
    <header class="flex items-center gap-2 mb-1">
      <button class="text-sub -ml-1 active:scale-90 transition" aria-label="Retour" @click="router.back()">
        <ChevronLeft :size="26" />
      </button>
      <h1 class="text-[26px] font-bold -tracking-[0.02em]">Notifications</h1>
      <div class="ml-auto flex items-center gap-2">
        <button
          class="size-10 rounded-[13px] bg-surface border border-border grid place-items-center text-sub active:scale-95 transition disabled:opacity-50"
          :disabled="notif.state === 'loading'"
          aria-label="Rafraîchir"
          @click="load"
        >
          <RefreshCw :size="17" :class="{ 'animate-spin': notif.state === 'loading' }" />
        </button>
        <button
          v-if="notif.unreadCount > 0"
          class="size-10 rounded-[13px] bg-surface border border-border grid place-items-center text-sub active:scale-95 transition"
          aria-label="Tout marquer comme lu"
          @click="notif.markAllRead()"
        >
          <CheckCheck :size="18" />
        </button>
      </div>
    </header>

    <!-- not configured -->
    <div v-if="!notif.configured" class="flex flex-col items-center text-center pt-24 gap-3.5 text-muted">
      <BellOff :size="34" />
      <p class="text-[13.5px] px-6 leading-relaxed">
        <b class="text-surface-text">Hub non configuré.</b><br />
        Renseigne l'URL et le jeton du récepteur dans les réglages pour recevoir tes notifications ici.
      </p>
      <button
        class="px-4 py-2 rounded-xl bg-surface border border-border text-sm font-semibold text-sub"
        @click="router.push('/settings')"
      >
        Configurer le hub
      </button>
    </div>

    <template v-else>
      <!-- live indicator -->
      <div class="flex items-center gap-1.5 text-[11.5px] font-bold px-0.5 -mt-1 mb-1" :class="notif.connected ? 'text-ok' : 'text-muted'">
        <span
          class="size-[7px] rounded-full"
          :style="
            notif.connected
              ? { background: 'var(--ok)', boxShadow: '0 0 0 4px color-mix(in srgb, var(--ok) 22%, transparent)' }
              : { background: 'var(--muted)' }
          "
        />
        {{ notif.connected ? "En direct" : "Hors ligne" }}
      </div>

      <!-- filter chips -->
      <div class="flex gap-2 overflow-x-auto py-3 -mx-1 px-1">
        <button
          v-for="f in [
            { key: 'all', label: 'Tout' },
            { key: 'unread', label: `Non lus${notif.unreadCount ? ' · ' + notif.unreadCount : ''}` },
            ...sources.map((s) => ({ key: s, label: s })),
          ]"
          :key="f.key"
          type="button"
          class="shrink-0 px-3.5 py-1.5 rounded-xl text-[12.5px] font-semibold border transition"
          :class="
            filter === f.key
              ? 'bg-accent text-accent-ink border-transparent'
              : 'bg-chip text-sub border-border active:scale-95'
          "
          @click="filter = f.key"
        >
          {{ f.label }}
        </button>
      </div>

      <!-- loading (first load, nothing cached) -->
      <div
        v-if="notif.state === 'loading' && !notif.notifications.length"
        class="flex flex-col items-center pt-20 gap-3 text-muted"
      >
        <LoaderCircle :size="26" class="animate-spin" />
        <p class="text-[13px]">Chargement…</p>
      </div>

      <!-- error (nothing cached) -->
      <div
        v-else-if="notif.state === 'error' && !notif.notifications.length"
        class="flex flex-col items-center text-center pt-20 gap-3"
      >
        <AlertCircle :size="30" class="text-danger" />
        <p class="text-sub text-sm px-6">{{ notif.error }}</p>
        <button class="px-4 py-2 rounded-xl bg-surface border border-border text-sm font-semibold" @click="load">
          Réessayer
        </button>
      </div>

      <!-- empty -->
      <div
        v-else-if="!visible.length"
        class="flex flex-col items-center text-center pt-20 gap-3 text-muted"
      >
        <BellOff :size="30" />
        <p class="text-[13px]">
          {{ filter === "all" ? "Aucune notification." : "Rien dans ce filtre." }}
        </p>
      </div>

      <!-- grouped list -->
      <template v-else>
        <section v-for="g in groups" :key="g.key">
          <p class="text-[11.5px] font-bold tracking-[0.1em] uppercase text-muted pt-3 pb-1.5">
            {{ g.label }}
          </p>
          <div
            v-for="n in g.items"
            :key="n.id"
            class="flex gap-3 py-3 border-t border-border first:border-0 -mx-5 px-5"
            :class="{ 'bg-accent/[0.06]': notif.isUnread(n) }"
          >
            <SourceBadge :source="n.source" />
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 mb-0.5">
                <span class="text-[11px] font-extrabold uppercase tracking-[0.02em] text-sub truncate">
                  {{ n.source }}
                </span>
                <span
                  v-if="LEVEL[n.level]"
                  class="text-[9.5px] font-extrabold px-1.5 py-0.5 rounded-[5px] shrink-0"
                  :class="LEVEL[n.level]!.cls"
                  :style="{ background: LEVEL_BG[LEVEL[n.level]!.cls] }"
                >
                  {{ LEVEL[n.level]!.label }}
                </span>
                <span class="text-[10.5px] text-muted font-semibold ml-auto whitespace-nowrap">
                  {{ timeShort(n.ts) }}
                </span>
              </div>
              <p class="text-[14px] font-bold leading-tight">{{ n.title }}</p>
              <p v-if="n.body" class="text-[12.5px] text-sub mt-0.5 leading-snug">{{ n.body }}</p>
            </div>
          </div>
        </section>
      </template>
    </template>
  </div>
</template>
