<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { RefreshCw, CalendarDays, AlertCircle } from "@lucide/vue";
import BottomNav from "@/components/BottomNav.vue";
import PosterCard from "@/components/PosterCard.vue";
import { useLibraryStore } from "@/store/library-store";
import type { MediaItem } from "@/types/arr";

type Tab = "movie" | "series";
type Filter = "all" | "missing" | "monitored";

const lib = useLibraryStore();
const router = useRouter();

const tab = ref<Tab>("movie");
const filter = ref<Filter>("all");

const items = computed(() => (tab.value === "movie" ? lib.movies : lib.series));
const state = computed(() => (tab.value === "movie" ? lib.moviesState : lib.seriesState));
const error = computed(() => (tab.value === "movie" ? lib.moviesError : lib.seriesError));

const filtered = computed<MediaItem[]>(() => {
  if (filter.value === "missing") return items.value.filter((i) => !i.complete);
  if (filter.value === "monitored") return items.value.filter((i) => i.monitored);
  return items.value;
});

function load(force = false) {
  if (tab.value === "movie") lib.fetchMovies(force);
  else lib.fetchSeries(force);
}

watch(tab, () => load());
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
        v-for="t in (['movie', 'series'] as Tab[])"
        :key="t"
        class="h-10 rounded-xl text-sm font-semibold transition"
        :class="tab === t ? 'bg-accent text-accent-ink' : 'text-sub'"
        @click="tab = t"
      >
        {{ t === "movie" ? "Films" : "Séries" }}
        <span v-if="(t === 'movie' ? lib.movies.length : lib.series.length)" class="opacity-70">
          {{ t === "movie" ? lib.movies.length : lib.series.length }}
        </span>
      </button>
    </div>

    <!-- filter chips -->
    <div class="flex gap-2 px-5 pb-3.5 overflow-x-auto">
      <button
        v-for="f in (['all', 'missing', 'monitored'] as Filter[])"
        :key="f"
        class="shrink-0 px-3.5 py-2 rounded-xl text-[13px] font-semibold border transition"
        :class="filter === f ? 'bg-accent text-accent-ink border-transparent' : 'bg-chip text-sub border-border'"
        @click="filter = f"
      >
        {{ f === "all" ? "Tout" : f === "missing" ? "Manquants" : "Surveillés" }}
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
      {{ filter === "all" ? "Rien à afficher." : "Aucun élément pour ce filtre." }}
    </div>

    <!-- grid -->
    <div v-else class="grid grid-cols-3 gap-3 px-5">
      <PosterCard v-for="item in filtered" :key="item.id" :item="item" @select="select" />
    </div>

    <BottomNav />
  </div>
</template>
