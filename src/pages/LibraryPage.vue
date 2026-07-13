<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { RefreshCw, CalendarDays, AlertCircle, ArrowUpDown, ArrowUp, ArrowDown, Check } from "@lucide/vue";
import BottomNav from "@/components/BottomNav.vue";
import PosterCard from "@/components/PosterCard.vue";
import BottomSheet from "@/components/BottomSheet.vue";
import { useLibraryStore, type LibTab, type LibFilter, type SortKey } from "@/store/library-store";
import type { MediaItem } from "@/types/arr";

const lib = useLibraryStore();
const router = useRouter();

// Local-only UI state (the sheet open flag); tab/filter/sort live in the store
// so they persist across navigation and restarts.
const sortOpen = ref(false);

const SORT_OPTIONS: { key: SortKey; label: string; defaultDir: "asc" | "desc" }[] = [
  { key: "title", label: "Titre", defaultDir: "asc" },
  { key: "added", label: "Date d'ajout", defaultDir: "desc" },
  { key: "year", label: "Année", defaultDir: "desc" },
  { key: "size", label: "Taille", defaultDir: "desc" },
];

const sortLabel = computed(() => SORT_OPTIONS.find((o) => o.key === lib.sortKey)!.label);

function pickSort(key: SortKey) {
  if (lib.sortKey === key) {
    lib.sortDir = lib.sortDir === "asc" ? "desc" : "asc";
  } else {
    lib.sortKey = key;
    lib.sortDir = SORT_OPTIONS.find((o) => o.key === key)!.defaultDir;
  }
}

function cmp(a: MediaItem, b: MediaItem): number {
  switch (lib.sortKey) {
    case "added":
      return (a.added ? Date.parse(a.added) : 0) - (b.added ? Date.parse(b.added) : 0);
    case "year":
      return (a.year ?? 0) - (b.year ?? 0);
    case "size":
      return (a.size ?? 0) - (b.size ?? 0);
    default:
      return a.title.localeCompare(b.title);
  }
}

const items = computed(() => (lib.tab === "movie" ? lib.movies : lib.series));
const state = computed(() => (lib.tab === "movie" ? lib.moviesState : lib.seriesState));
const error = computed(() => (lib.tab === "movie" ? lib.moviesError : lib.seriesError));

const filtered = computed<MediaItem[]>(() => {
  let list = items.value;
  if (lib.filter === "missing") list = list.filter((i) => !i.complete);
  else if (lib.filter === "monitored") list = list.filter((i) => i.monitored);
  const sorted = [...list].sort(cmp);
  return lib.sortDir === "desc" ? sorted.reverse() : sorted;
});

function load(force = false) {
  if (lib.tab === "movie") lib.fetchMovies(force);
  else lib.fetchSeries(force);
}

watch(() => lib.tab, () => load());
onMounted(() => load());

function select(item: MediaItem) {
  router.push(`/${item.kind}/${item.id}`);
}
</script>

<template>
  <div class="min-h-dvh pb-28 max-w-md mx-auto">
    <!-- header -->
    <header class="flex items-center justify-between px-5 pt-14 pb-3">
      <h1 class="text-[26px] font-bold -tracking-[0.02em]">Bibliothèque</h1>
      <div class="flex gap-2">
        <button class="size-10 rounded-[13px] bg-surface border border-border grid place-items-center text-sub active:scale-95 transition" aria-label="Trier" @click="sortOpen = true">
          <ArrowUpDown :size="18" />
        </button>
        <button class="size-10 rounded-[13px] bg-surface border border-border grid place-items-center text-sub active:scale-95 transition" aria-label="Calendrier" @click="router.push('/calendar')">
          <CalendarDays :size="19" />
        </button>
        <button class="size-10 rounded-[13px] bg-surface border border-border grid place-items-center text-sub active:scale-95 transition disabled:opacity-50" :disabled="state === 'loading'" aria-label="Rafraîchir" @click="load(true)">
          <RefreshCw :size="18" :class="{ 'animate-spin': state === 'loading' }" />
        </button>
      </div>
    </header>

    <!-- Films / Séries segmented -->
    <div class="mx-5 mb-3 p-1 rounded-2xl bg-surface border border-border grid grid-cols-2 gap-1">
      <button
        v-for="t in (['movie', 'series'] as LibTab[])"
        :key="t"
        class="h-10 rounded-xl text-sm font-semibold transition"
        :class="lib.tab === t ? 'bg-accent text-accent-ink' : 'text-sub'"
        @click="lib.tab = t"
      >
        {{ t === "movie" ? "Films" : "Séries" }}
        <span v-if="(t === 'movie' ? lib.movies.length : lib.series.length)" class="opacity-70">
          {{ t === "movie" ? lib.movies.length : lib.series.length }}
        </span>
      </button>
    </div>

    <!-- filter chips + active sort -->
    <div class="flex items-center gap-2 px-5 pb-3.5 overflow-x-auto">
      <button
        v-for="f in (['all', 'missing', 'monitored'] as LibFilter[])"
        :key="f"
        class="shrink-0 px-3.5 py-2 rounded-xl text-[13px] font-semibold border transition"
        :class="lib.filter === f ? 'bg-accent text-accent-ink border-transparent' : 'bg-chip text-sub border-border'"
        @click="lib.filter = f"
      >
        {{ f === "all" ? "Tout" : f === "missing" ? "Manquants" : "Surveillés" }}
      </button>
      <button class="shrink-0 ml-auto flex items-center gap-1 px-3 py-2 rounded-xl text-[12.5px] font-semibold text-sub bg-chip border border-border" @click="sortOpen = true">
        <component :is="lib.sortDir === 'asc' ? ArrowUp : ArrowDown" :size="13" />
        {{ sortLabel }}
      </button>
    </div>

    <!-- loading skeleton -->
    <div v-if="state === 'loading' && !items.length" class="grid grid-cols-3 gap-3 px-5">
      <div v-for="n in 9" :key="n" class="aspect-[2/3] rounded-[14px] bg-surface-2 animate-pulse" />
    </div>

    <!-- error -->
    <div v-else-if="state === 'error'" class="flex flex-col items-center text-center px-8 pt-16 gap-3">
      <AlertCircle :size="34" class="text-danger" />
      <p class="text-sub text-sm">{{ error }}</p>
      <button class="px-4 py-2 rounded-xl bg-surface border border-border text-sm font-semibold" @click="load(true)">
        Réessayer
      </button>
    </div>

    <!-- empty -->
    <div v-else-if="!filtered.length" class="text-center px-8 pt-20 text-muted text-sm">
      {{ lib.filter === "all" ? "Rien à afficher." : "Aucun élément pour ce filtre." }}
    </div>

    <!-- grid -->
    <div v-else class="grid grid-cols-3 gap-3 px-5">
      <PosterCard v-for="item in filtered" :key="item.id" :item="item" @select="select" />
    </div>

    <BottomNav />

    <!-- sort sheet -->
    <BottomSheet :open="sortOpen" title="Trier par" @close="sortOpen = false">
      <div class="flex flex-col">
        <button
          v-for="o in SORT_OPTIONS"
          :key="o.key"
          class="flex items-center justify-between py-3.5 px-1 text-left border-b border-border last:border-0"
          @click="pickSort(o.key)"
        >
          <span class="text-[15px] font-medium" :class="lib.sortKey === o.key ? 'text-text' : 'text-sub'">
            {{ o.label }}
          </span>
          <span v-if="lib.sortKey === o.key" class="flex items-center gap-2 text-accent">
            <component :is="lib.sortDir === 'asc' ? ArrowUp : ArrowDown" :size="16" />
            <Check :size="18" :stroke-width="2.6" />
          </span>
        </button>
      </div>
    </BottomSheet>
  </div>
</template>
