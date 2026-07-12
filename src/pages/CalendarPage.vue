<script setup lang="ts">
import { computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import { ChevronLeft, CalendarDays, AlertCircle, LoaderCircle, Film, Tv, Check } from "@lucide/vue";
import LazyImg from "@/components/LazyImg.vue";
import { useCalendarStore } from "@/store/calendar-store";
import type { CalendarEntry } from "@/types/arr";

const router = useRouter();
const cal = useCalendarStore();

function dayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const target = new Date(d);
  target.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((target.getTime() - today.getTime()) / 86400000);
  if (diff === 0) return "Aujourd'hui";
  if (diff === 1) return "Demain";
  return new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" }).format(d);
}

function timeOf(iso: string): string {
  return new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

const groups = computed(() => {
  const map = new Map<string, { label: string; items: CalendarEntry[] }>();
  for (const e of cal.entries) {
    const k = dayKey(e.date);
    if (!map.has(k)) map.set(k, { label: dayLabel(e.date), items: [] });
    map.get(k)!.items.push(e);
  }
  return [...map.values()];
});

function open(e: CalendarEntry) {
  router.push(`/${e.kind}/${e.id}`);
}

onMounted(() => cal.fetch());
</script>

<template>
  <div class="min-h-dvh max-w-md mx-auto px-5 pt-14 pb-10">
    <header class="flex items-center gap-2 mb-5">
      <button class="size-10 -ml-2 grid place-items-center text-sub active:scale-95 transition" aria-label="Retour" @click="router.back()">
        <ChevronLeft :size="24" />
      </button>
      <h1 class="text-2xl font-bold -tracking-[0.02em]">Calendrier</h1>
    </header>

    <!-- loading -->
    <div v-if="cal.state === 'loading'" class="flex flex-col items-center text-center pt-24 gap-3 text-muted">
      <LoaderCircle :size="30" class="animate-spin" />
      <p class="text-sm">Chargement…</p>
    </div>

    <!-- error -->
    <div v-else-if="cal.state === 'error'" class="flex flex-col items-center text-center pt-24 gap-3">
      <AlertCircle :size="34" class="text-danger" />
      <p class="text-sub text-sm">{{ cal.error }}</p>
      <button class="px-4 py-2 rounded-xl bg-surface border border-border text-sm font-semibold" @click="cal.fetch(28, true)">
        Réessayer
      </button>
    </div>

    <!-- empty -->
    <div v-else-if="!cal.entries.length" class="flex flex-col items-center text-center pt-24 gap-3 text-muted">
      <CalendarDays :size="34" />
      <p class="text-sm">Aucune sortie à venir (4 semaines).</p>
    </div>

    <!-- grouped list -->
    <div v-else class="flex flex-col gap-5">
      <section v-for="(g, gi) in groups" :key="gi">
        <p class="text-xs font-semibold tracking-[0.1em] uppercase text-muted mb-2.5 first-letter:capitalize">
          {{ g.label }}
        </p>
        <div class="flex flex-col gap-2.5">
          <button
            v-for="(e, i) in g.items"
            :key="`${e.kind}-${e.id}-${i}`"
            type="button"
            class="flex items-center gap-3 text-left rounded-2xl bg-surface border border-border p-2.5 active:scale-[0.99] transition"
            @click="open(e)"
          >
            <div class="w-11 h-16 rounded-lg overflow-hidden shrink-0">
              <LazyImg :src="e.poster" :alt="e.title" class="w-full h-full">
                <template #fallback>
                  <component :is="e.kind === 'movie' ? Film : Tv" :size="18" />
                </template>
              </LazyImg>
            </div>
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-1.5">
                <component :is="e.kind === 'movie' ? Film : Tv" :size="12" class="text-accent shrink-0" />
                <p class="text-[14px] font-bold leading-tight truncate">{{ e.title }}</p>
              </div>
              <p v-if="e.subtitle" class="text-[12px] text-sub truncate mt-0.5">{{ e.subtitle }}</p>
            </div>
            <div class="shrink-0 flex flex-col items-end gap-1">
              <span v-if="e.kind === 'series'" class="text-[11px] text-muted font-semibold">{{ timeOf(e.date) }}</span>
              <span
                class="size-5 rounded-md grid place-items-center"
                :class="e.hasFile ? 'text-ok' : e.monitored ? 'text-muted' : 'text-muted/50'"
              >
                <Check v-if="e.hasFile" :size="14" :stroke-width="2.6" />
              </span>
            </div>
          </button>
        </div>
      </section>
    </div>
  </div>
</template>
