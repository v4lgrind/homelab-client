<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  ChevronLeft,
  Trash2,
  Search,
  Check,
  AlertCircle,
  LoaderCircle,
  Film,
  Tv,
} from "@lucide/vue";
import LazyImg from "@/components/LazyImg.vue";
import { useLibraryStore } from "@/store/library-store";
import { useConnectionStore } from "@/store/connection-store";
import { createArrClient } from "@/services/arr";
import { formatRuntime, formatSize } from "@/lib/format";
import type { MediaKind, Movie, Series } from "@/types/arr";

const route = useRoute();
const router = useRouter();
const lib = useLibraryStore();
const conn = useConnectionStore();

const kind = computed(() => route.params.kind as MediaKind);
const id = computed(() => Number(route.params.id));

const client = computed(() => {
  const svc = kind.value === "movie" ? "radarr" : "sonarr";
  return createArrClient(svc, conn.services[svc].subdomain, conn.rootDomain, conn.apiKeys[svc] ?? "");
});

const d = computed(() => lib.detail);
const asMovie = computed(() => (kind.value === "movie" ? (lib.detail as Movie | null) : null));
const asSeries = computed(() => (kind.value === "series" ? (lib.detail as Series | null) : null));

const poster = computed(() => (d.value ? client.value.posterUrl(d.value.images, d.value.id) : undefined));
const fanart = computed(() => (d.value ? client.value.fanartUrl(d.value.images, d.value.id) : undefined));

const rating = computed(() => {
  const r = asMovie.value?.ratings;
  const v = r?.tmdb?.value ?? r?.imdb?.value ?? Object.values(r ?? {})[0]?.value;
  return v ? v.toFixed(1) : undefined;
});

const complete = computed(() => {
  if (asMovie.value) return asMovie.value.hasFile;
  const st = asSeries.value?.statistics;
  return !!st && st.episodeCount > 0 && st.percentOfEpisodes >= 100;
});

const tags = computed<string[]>(() => {
  const out: string[] = [];
  if (asMovie.value) {
    const q = asMovie.value.movieFile?.quality?.quality?.name;
    const size = formatSize(asMovie.value.movieFile?.size ?? asMovie.value.sizeOnDisk);
    if (asMovie.value.hasFile) {
      if (q) out.push(q);
      if (size) out.push(size);
    }
  } else if (asSeries.value?.statistics) {
    const st = asSeries.value.statistics;
    out.push(`${st.episodeFileCount}/${st.episodeCount} épisodes`);
    const size = formatSize(st.sizeOnDisk);
    if (size) out.push(size);
  }
  return out;
});

const metaBits = computed(() => {
  const bits: string[] = [];
  if (d.value?.year) bits.push(String(d.value.year));
  const rt = formatRuntime(asMovie.value?.runtime ?? asSeries.value?.runtime);
  if (rt) bits.push(rt);
  if (asSeries.value?.network) bits.push(asSeries.value.network);
  return bits;
});

function goBack() {
  router.back();
}

async function onDelete() {
  if (!d.value) return;
  const msg = `Supprimer « ${d.value.title} » ?\n\nLes fichiers sur le disque seront également supprimés.`;
  if (!confirm(msg)) return;
  const ok = await lib.deleteItem(true);
  if (ok) router.replace("/");
  else alert("La suppression a échoué.");
}

// transient "search launched" feedback
const justSearched = ref(false);
watch(
  () => lib.searchTriggered,
  (v) => {
    if (v) {
      justSearched.value = true;
      setTimeout(() => (justSearched.value = false), 2500);
    }
  },
);

onMounted(() => lib.fetchDetail(kind.value, id.value));
</script>

<template>
  <div class="min-h-dvh max-w-md mx-auto pb-10">
    <!-- loading -->
    <div v-if="lib.detailState === 'loading' && !d" class="pt-40 grid place-items-center text-muted">
      <LoaderCircle :size="30" class="animate-spin" />
    </div>

    <!-- error -->
    <div v-else-if="lib.detailState === 'error'" class="flex flex-col items-center text-center px-8 pt-40 gap-3">
      <AlertCircle :size="34" class="text-danger" />
      <p class="text-sub text-sm">{{ lib.detailError }}</p>
      <button class="px-4 py-2 rounded-xl bg-surface border border-border text-sm font-semibold" @click="lib.fetchDetail(kind, id, true)">
        Réessayer
      </button>
    </div>

    <template v-else-if="d">
      <!-- backdrop -->
      <div class="relative h-[230px]">
        <LazyImg :src="fanart" :alt="d.title" class="absolute inset-0 w-full h-full">
          <template #fallback>
            <div class="w-full h-full" style="background: linear-gradient(140deg, var(--surface-2), var(--bg))" />
          </template>
        </LazyImg>
        <div class="absolute inset-0" style="background: linear-gradient(to top, var(--bg) 3%, transparent 60%)" />
        <div class="absolute top-[52px] inset-x-4 flex justify-between">
          <button class="size-9 rounded-xl grid place-items-center text-white border border-white/15 backdrop-blur-sm bg-black/40 active:scale-95 transition" aria-label="Retour" @click="goBack">
            <ChevronLeft :size="20" />
          </button>
        </div>
      </div>

      <!-- head -->
      <div class="flex gap-3.5 px-5 -mt-[52px] relative z-[3]">
        <div class="w-24 h-36 rounded-xl overflow-hidden shrink-0 shadow-[0_10px_24px_-10px_rgba(0,0,0,0.7)]">
          <LazyImg :src="poster" :alt="d.title" class="w-full h-full">
            <template #fallback>
              <component :is="kind === 'movie' ? Film : Tv" :size="28" />
            </template>
          </LazyImg>
        </div>
        <div class="pt-14">
          <h1 class="text-xl font-bold -tracking-[0.01em] leading-tight mb-1">{{ d.title }}</h1>
          <div class="text-[12.5px] text-sub flex items-center gap-2 flex-wrap">
            <template v-for="(b, i) in metaBits" :key="b">
              <span v-if="i > 0" class="size-[3px] rounded-full bg-muted" />
              <span>{{ b }}</span>
            </template>
            <template v-if="rating">
              <span class="size-[3px] rounded-full bg-muted" />
              <span class="text-warn font-bold">★ {{ rating }}</span>
            </template>
          </div>
        </div>
      </div>

      <!-- status tags -->
      <div class="flex gap-2 px-5 pt-4 flex-wrap">
        <span
          class="px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5"
          :class="complete ? 'text-ok' : 'text-danger'"
          :style="`background: color-mix(in srgb, var(--${complete ? 'ok' : 'danger'}) 15%, transparent)`"
        >
          <component :is="complete ? Check : AlertCircle" :size="13" :stroke-width="complete ? 2.6 : 2.4" />
          {{ complete ? "Complet" : "Manquant" }}
        </span>
        <span v-for="t in tags" :key="t" class="px-3 py-1.5 rounded-xl text-xs font-semibold border border-border bg-surface text-surface-text">
          {{ t }}
        </span>
      </div>

      <!-- monitored -->
      <div class="flex items-center justify-between mx-5 mt-4 px-4 py-3 bg-surface border border-border rounded-2xl">
        <div>
          <div class="text-sm font-semibold">Surveillé</div>
          <div class="text-xs text-sub">
            {{ kind === "movie" ? "Radarr" : "Sonarr" }} cherche les meilleures versions
          </div>
        </div>
        <button
          class="w-[42px] h-[25px] rounded-full relative shrink-0 transition disabled:opacity-60"
          :class="d.monitored ? 'bg-accent' : 'bg-chip border border-border'"
          :disabled="lib.actionBusy"
          role="switch"
          :aria-checked="d.monitored"
          @click="lib.toggleMonitored()"
        >
          <span class="absolute top-[3px] size-[19px] rounded-full bg-white transition-all" :class="d.monitored ? 'left-[20px]' : 'left-[3px]'" />
        </button>
      </div>

      <!-- overview -->
      <p v-if="d.overview" class="px-5 pt-4 text-[13.5px] leading-relaxed text-surface-text">
        {{ d.overview }}
      </p>

      <!-- genres -->
      <div v-if="(asMovie?.genres || asSeries?.genres)?.length" class="flex gap-2 px-5 pt-3 flex-wrap">
        <span v-for="g in (asMovie?.genres || asSeries?.genres)" :key="g" class="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-chip text-sub">
          {{ g }}
        </span>
      </div>

      <!-- actions -->
      <div class="flex gap-2.5 px-5 pt-5">
        <button
          class="flex-1 h-12 rounded-[14px] font-bold text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition disabled:opacity-70"
          :class="justSearched ? 'bg-ok text-black' : 'bg-accent text-accent-ink'"
          :disabled="lib.actionBusy"
          @click="lib.searchRelease()"
        >
          <LoaderCircle v-if="lib.actionBusy && !justSearched" :size="17" class="animate-spin" />
          <component v-else :is="justSearched ? Check : Search" :size="17" :stroke-width="justSearched ? 2.6 : 2.2" />
          {{ justSearched ? "Recherche lancée" : "Rechercher" }}
        </button>
        <button class="w-[52px] h-12 rounded-[14px] bg-surface border border-border grid place-items-center text-danger active:scale-95 transition disabled:opacity-60" :disabled="lib.actionBusy" aria-label="Supprimer" @click="onDelete">
          <Trash2 :size="18" />
        </button>
      </div>
    </template>
  </div>
</template>
