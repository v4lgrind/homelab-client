<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  ChevronLeft,
  LoaderCircle,
  AlertCircle,
  Download,
  Check,
  Magnet,
  Cloud,
  Users,
  Clock,
  Ban,
} from "@lucide/vue";
import { useSearchStore } from "@/store/search-store";
import { useLibraryStore } from "@/store/library-store";
import { useConfirm } from "@/composables/useConfirm";
import { formatSize, formatAge } from "@/lib/format";
import type { MediaKind, Release, Series } from "@/types/arr";

const { confirm } = useConfirm();

const route = useRoute();
const router = useRouter();
const search = useSearchStore();
const lib = useLibraryStore();

const kind = computed(() => route.params.kind as MediaKind);
const id = computed(() => Number(route.params.id));

const title = computed(() =>
  lib.detail && lib.detail.id === id.value ? lib.detail.title : "",
);

const seasons = computed<number[]>(() => {
  if (kind.value !== "series") return [];
  const d = lib.detail as Series | null;
  return (d?.seasons ?? [])
    .map((s) => s.seasonNumber)
    .filter((n) => n > 0)
    .sort((a, b) => b - a);
});
const season = ref<number | null>(null);

function runSearch() {
  if (kind.value === "movie") search.search("movie", { movieId: id.value });
  else if (season.value != null)
    search.search("series", { seriesId: id.value, seasonNumber: season.value });
}

async function ensureDetail() {
  if (!lib.detail || lib.detail.id !== id.value || lib.detailKind !== kind.value) {
    await lib.fetchDetail(kind.value, id.value);
  }
}

onMounted(async () => {
  if (kind.value === "series") {
    await ensureDetail();
    season.value = seasons.value[0] ?? null;
  }
  runSearch();
});

watch(season, (v, old) => {
  if (v != null && v !== old) runSearch();
});

function protoIcon(r: Release) {
  return r.protocol === "usenet" ? Cloud : Magnet;
}

async function grab(r: Release) {
  if (!r.indexerId) return;
  if (r.rejected) {
    const reasons = (r.rejections ?? []).join("\n");
    const ok = await confirm({
      title: "Release rejetée — forcer ?",
      message: reasons,
      confirmText: "Forcer",
      danger: true,
    });
    if (!ok) return;
  } else if (!(await confirm({ title: `Télécharger « ${r.title} » ?`, confirmText: "Télécharger" }))) {
    return;
  }
  const ok = await search.grab(kind.value, r);
  if (!ok && search.grabError)
    await confirm({ title: "Échec du téléchargement", message: search.grabError, confirmText: "OK", cancelText: null });
}

function grabbed(r: Release) {
  return search.grabbedGuids.includes(r.guid);
}
</script>

<template>
  <div class="min-h-dvh max-w-md mx-auto px-5 pt-14 pb-10">
    <header class="flex items-center gap-2 mb-4">
      <button class="size-10 -ml-2 grid place-items-center text-sub active:scale-95 transition" aria-label="Retour" @click="router.back()">
        <ChevronLeft :size="24" />
      </button>
      <div class="min-w-0">
        <h1 class="text-xl font-bold -tracking-[0.02em] leading-tight">Recherche interactive</h1>
        <p v-if="title" class="text-xs text-sub truncate">{{ title }}</p>
      </div>
    </header>

    <!-- season selector (series) -->
    <div v-if="kind === 'series' && seasons.length" class="flex gap-2 pb-3 overflow-x-auto">
      <button
        v-for="s in seasons"
        :key="s"
        class="shrink-0 px-3.5 py-2 rounded-xl text-[13px] font-semibold border transition"
        :class="season === s ? 'bg-accent text-accent-ink border-transparent' : 'bg-chip text-sub border-border'"
        @click="season = s"
      >
        Saison {{ s }}
      </button>
    </div>

    <!-- loading -->
    <div v-if="search.state === 'loading'" class="flex flex-col items-center text-center pt-24 gap-3 text-muted">
      <LoaderCircle :size="30" class="animate-spin" />
      <p class="text-sm">Interrogation des indexers…</p>
    </div>

    <!-- error -->
    <div v-else-if="search.state === 'error'" class="flex flex-col items-center text-center pt-24 gap-3">
      <AlertCircle :size="34" class="text-danger" />
      <p class="text-sub text-sm">{{ search.error }}</p>
      <button class="px-4 py-2 rounded-xl bg-surface border border-border text-sm font-semibold" @click="runSearch">
        Réessayer
      </button>
    </div>

    <!-- empty -->
    <div v-else-if="!search.releases.length" class="text-center pt-24 text-muted text-sm">
      Aucune release trouvée.
    </div>

    <!-- results -->
    <div v-else class="flex flex-col gap-2.5">
      <p class="text-xs font-semibold tracking-[0.1em] uppercase text-muted px-1">
        {{ search.releases.length }} releases
      </p>
      <div
        v-for="r in search.releases"
        :key="r.guid"
        class="flex items-start gap-3 rounded-2xl bg-surface border border-border p-3.5"
        :class="{ 'opacity-60': r.rejected }"
      >
        <div class="min-w-0 flex-1">
          <p class="text-[13px] font-semibold leading-snug line-clamp-2">{{ r.title }}</p>
          <div class="flex items-center gap-x-3 gap-y-1 flex-wrap mt-2 text-[11.5px] text-sub font-medium">
            <span class="text-accent font-semibold">{{ r.quality?.quality?.name ?? "?" }}</span>
            <span v-if="formatSize(r.size)">{{ formatSize(r.size) }}</span>
            <span class="inline-flex items-center gap-1">
              <component :is="protoIcon(r)" :size="12" />
              <template v-if="r.protocol === 'torrent'">{{ r.seeders ?? 0 }}</template>
              <Users v-if="r.protocol === 'torrent'" :size="12" />
            </span>
            <span v-if="formatAge(r.age, r.ageMinutes)" class="inline-flex items-center gap-1">
              <Clock :size="12" />{{ formatAge(r.age, r.ageMinutes) }}
            </span>
            <span class="truncate max-w-[110px]">{{ r.indexer }}</span>
          </div>
          <p v-if="r.rejected && r.rejections?.length" class="flex items-start gap-1 mt-1.5 text-[11px] text-danger">
            <Ban :size="12" class="shrink-0 mt-px" />
            <span class="line-clamp-2">{{ r.rejections.join(" · ") }}</span>
          </p>
        </div>

        <button
          class="size-10 rounded-xl grid place-items-center shrink-0 active:scale-95 transition disabled:opacity-60"
          :class="grabbed(r) ? 'bg-ok/20 text-ok' : 'bg-chip text-accent border border-border'"
          :disabled="search.grabbingGuid !== null || grabbed(r)"
          :aria-label="grabbed(r) ? 'Envoyé' : 'Télécharger'"
          @click="grab(r)"
        >
          <LoaderCircle v-if="search.grabbingGuid === r.guid" :size="18" class="animate-spin" />
          <Check v-else-if="grabbed(r)" :size="18" :stroke-width="2.6" />
          <Download v-else :size="18" />
        </button>
      </div>
    </div>
  </div>
</template>
