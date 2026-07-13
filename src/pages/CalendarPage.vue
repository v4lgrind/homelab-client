<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { ChevronLeft, ChevronRight, AlertCircle, LoaderCircle, CalendarDays, Film, Tv } from "@lucide/vue";
import LazyImg from "@/components/LazyImg.vue";
import { useCalendarStore } from "@/store/calendar-store";
import type { CalendarEntry } from "@/types/arr";

const router = useRouter();
const cal = useCalendarStore();

type View = "agenda" | "month";
const view = ref<View>("agenda");

// ---- date helpers ----
function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function keyOf(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}
function sameDay(a: Date, b: Date) {
  return keyOf(a) === keyOf(b);
}

const today = new Date();
const monthCursor = ref(startOfMonth(today));
const selectedKey = ref<string | null>(null);

// ---- month grid (6 weeks, Monday-first) ----
const gridDays = computed<Date[]>(() => {
  const first = startOfMonth(monthCursor.value);
  const offset = (first.getDay() + 6) % 7; // 0 = Monday
  const start = new Date(first);
  start.setDate(first.getDate() - offset);
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
});
const gridRange = computed(() => {
  const start = gridDays.value[0];
  const endExcl = new Date(gridDays.value[41]);
  endExcl.setDate(endExcl.getDate() + 1);
  return { startISO: start.toISOString(), endISO: endExcl.toISOString() };
});

const byDay = computed(() => {
  const map = new Map<string, CalendarEntry[]>();
  for (const e of cal.entries) {
    const k = keyOf(new Date(e.date));
    (map.get(k) ?? map.set(k, []).get(k)!).push(e);
  }
  return map;
});

const monthLabel = computed(() =>
  new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" }).format(monthCursor.value),
);
const weekdays = ["L", "M", "M", "J", "V", "S", "D"];

const selectedEntries = computed(() => (selectedKey.value ? byDay.value.get(selectedKey.value) ?? [] : []));
const selectedLabel = computed(() => {
  if (!selectedKey.value) return "";
  const d = gridDays.value.find((g) => keyOf(g) === selectedKey.value) ?? new Date();
  return new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" }).format(d);
});

// ---- agenda grouping ----
function dayLabel(iso: string): string {
  const d = new Date(iso);
  const target = new Date(d);
  target.setHours(0, 0, 0, 0);
  const t0 = new Date();
  t0.setHours(0, 0, 0, 0);
  const diff = Math.round((target.getTime() - t0.getTime()) / 86400000);
  if (diff === 0) return "Aujourd'hui";
  if (diff === 1) return "Demain";
  return new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" }).format(d);
}
const agendaGroups = computed(() => {
  const map = new Map<string, { label: string; items: CalendarEntry[] }>();
  for (const e of cal.entries) {
    const k = keyOf(new Date(e.date));
    if (!map.has(k)) map.set(k, { label: dayLabel(e.date), items: [] });
    map.get(k)!.items.push(e);
  }
  return [...map.values()];
});

function timeOf(iso: string): string {
  return new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}
function open(e: CalendarEntry) {
  router.push(`/${e.kind}/${e.id}`);
}
function dotColor(e: CalendarEntry) {
  return e.kind === "movie" ? "var(--accent)" : "#8b7cf6";
}

// ---- data loading ----
function load(force = false) {
  if (view.value === "agenda") cal.fetchAgenda(28, force);
  else cal.fetchRange(gridRange.value.startISO, gridRange.value.endISO, force);
}
function prevMonth() {
  monthCursor.value = new Date(monthCursor.value.getFullYear(), monthCursor.value.getMonth() - 1, 1);
  selectedKey.value = null;
}
function nextMonth() {
  monthCursor.value = new Date(monthCursor.value.getFullYear(), monthCursor.value.getMonth() + 1, 1);
  selectedKey.value = null;
}

watch([view, monthCursor], () => {
  load();
  if (view.value === "month" && !selectedKey.value && sameDay(startOfMonth(today), monthCursor.value)) {
    selectedKey.value = keyOf(today);
  }
});
onMounted(() => load());
</script>

<template>
  <div class="min-h-dvh max-w-md mx-auto px-5 pt-14 pb-10">
    <header class="flex items-center gap-2 mb-4">
      <button class="size-10 -ml-2 grid place-items-center text-sub active:scale-95 transition" aria-label="Retour" @click="router.back()">
        <ChevronLeft :size="24" />
      </button>
      <h1 class="text-2xl font-bold -tracking-[0.02em]">Calendrier</h1>
    </header>

    <!-- view toggle -->
    <div class="mb-4 p-1 rounded-2xl bg-surface border border-border grid grid-cols-2 gap-1">
      <button class="h-9 rounded-xl text-[13px] font-semibold transition" :class="view === 'agenda' ? 'bg-accent text-accent-ink' : 'text-sub'" @click="view = 'agenda'">Agenda</button>
      <button class="h-9 rounded-xl text-[13px] font-semibold transition" :class="view === 'month' ? 'bg-accent text-accent-ink' : 'text-sub'" @click="view = 'month'">Mois</button>
    </div>

    <!-- loading -->
    <div v-if="cal.state === 'loading' && !cal.entries.length" class="flex flex-col items-center text-center pt-20 gap-3 text-muted">
      <LoaderCircle :size="30" class="animate-spin" />
      <p class="text-sm">Chargement…</p>
    </div>
    <div v-else-if="cal.state === 'error'" class="flex flex-col items-center text-center pt-20 gap-3">
      <AlertCircle :size="34" class="text-danger" />
      <p class="text-sub text-sm">{{ cal.error }}</p>
      <button class="px-4 py-2 rounded-xl bg-surface border border-border text-sm font-semibold" @click="load(true)">Réessayer</button>
    </div>

    <!-- ===== AGENDA ===== -->
    <template v-else-if="view === 'agenda'">
      <div v-if="!cal.entries.length" class="flex flex-col items-center text-center pt-20 gap-3 text-muted">
        <CalendarDays :size="34" />
        <p class="text-sm">Aucune sortie à venir (4 semaines).</p>
      </div>
      <div v-else class="flex flex-col gap-5">
        <section v-for="(g, gi) in agendaGroups" :key="gi">
          <p class="text-xs font-semibold tracking-[0.1em] uppercase text-muted mb-2.5 first-letter:capitalize">{{ g.label }}</p>
          <div class="flex flex-col gap-2.5">
            <button v-for="(e, i) in g.items" :key="`${e.kind}-${e.id}-${i}`" type="button" class="flex items-center gap-3 text-left rounded-2xl bg-surface border border-border p-2.5 active:scale-[0.99] transition" @click="open(e)">
              <div class="w-11 h-16 rounded-lg overflow-hidden shrink-0">
                <LazyImg :src="e.poster" :alt="e.title" class="w-full h-full">
                  <template #fallback><component :is="e.kind === 'movie' ? Film : Tv" :size="18" /></template>
                </LazyImg>
              </div>
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-1.5">
                  <component :is="e.kind === 'movie' ? Film : Tv" :size="12" class="text-accent shrink-0" />
                  <p class="text-[14px] font-bold leading-tight truncate">{{ e.title }}</p>
                </div>
                <p v-if="e.subtitle" class="text-[12px] text-sub truncate mt-0.5">{{ e.subtitle }}</p>
              </div>
              <span v-if="e.kind === 'series'" class="shrink-0 text-[11px] text-muted font-semibold">{{ timeOf(e.date) }}</span>
            </button>
          </div>
        </section>
      </div>
    </template>

    <!-- ===== MONTH ===== -->
    <template v-else>
      <div class="flex items-center justify-between mb-3">
        <button class="size-9 rounded-xl bg-surface border border-border grid place-items-center text-sub active:scale-95 transition" aria-label="Mois précédent" @click="prevMonth"><ChevronLeft :size="18" /></button>
        <p class="text-[15px] font-bold first-letter:capitalize">{{ monthLabel }}</p>
        <button class="size-9 rounded-xl bg-surface border border-border grid place-items-center text-sub active:scale-95 transition" aria-label="Mois suivant" @click="nextMonth"><ChevronRight :size="18" /></button>
      </div>

      <div class="grid grid-cols-7 mb-1">
        <span v-for="(w, i) in weekdays" :key="i" class="text-center text-[11px] font-semibold text-muted py-1">{{ w }}</span>
      </div>
      <div class="grid grid-cols-7 gap-1">
        <button
          v-for="d in gridDays"
          :key="keyOf(d)"
          type="button"
          class="aspect-square rounded-xl flex flex-col items-center justify-center gap-1 border transition"
          :class="[
            selectedKey === keyOf(d) ? 'border-accent bg-accent/10' : 'border-transparent',
            d.getMonth() === monthCursor.getMonth() ? '' : 'opacity-35',
          ]"
          @click="selectedKey = keyOf(d)"
        >
          <span
            class="text-[13px] font-semibold size-6 grid place-items-center rounded-full"
            :class="sameDay(d, today) ? 'bg-accent text-accent-ink' : 'text-text'"
          >{{ d.getDate() }}</span>
          <span class="flex gap-0.5 h-1.5">
            <span
              v-for="(e, i) in (byDay.get(keyOf(d)) || []).slice(0, 3)"
              :key="i"
              class="size-1.5 rounded-full"
              :style="{ background: dotColor(e) }"
            />
          </span>
        </button>
      </div>

      <!-- selected day -->
      <div v-if="selectedKey" class="mt-5">
        <p class="text-xs font-semibold tracking-[0.1em] uppercase text-muted mb-2.5 first-letter:capitalize">{{ selectedLabel }}</p>
        <div v-if="selectedEntries.length" class="flex flex-col gap-2.5">
          <button v-for="(e, i) in selectedEntries" :key="`${e.kind}-${e.id}-${i}`" type="button" class="flex items-center gap-3 text-left rounded-2xl bg-surface border border-border p-2.5 active:scale-[0.99] transition" @click="open(e)">
            <div class="w-10 h-[58px] rounded-lg overflow-hidden shrink-0">
              <LazyImg :src="e.poster" :alt="e.title" class="w-full h-full">
                <template #fallback><component :is="e.kind === 'movie' ? Film : Tv" :size="16" /></template>
              </LazyImg>
            </div>
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-1.5">
                <component :is="e.kind === 'movie' ? Film : Tv" :size="12" class="text-accent shrink-0" />
                <p class="text-[13.5px] font-bold leading-tight truncate">{{ e.title }}</p>
              </div>
              <p v-if="e.subtitle" class="text-[11.5px] text-sub truncate mt-0.5">{{ e.subtitle }}</p>
            </div>
            <span v-if="e.kind === 'series'" class="shrink-0 text-[11px] text-muted font-semibold">{{ timeOf(e.date) }}</span>
          </button>
        </div>
        <p v-else class="text-sm text-muted text-center py-6">Rien ce jour-là.</p>
      </div>
    </template>
  </div>
</template>
