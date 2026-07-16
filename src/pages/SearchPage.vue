<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from "vue";
import { useRouter } from "vue-router";
import {
  Search,
  X,
  Plus,
  Check,
  Film,
  Tv,
  LoaderCircle,
  AlertCircle,
  ChevronDown,
} from "@lucide/vue";
import BottomNav from "@/components/BottomNav.vue";
import BottomSheet from "@/components/BottomSheet.vue";
import LazyImg from "@/components/LazyImg.vue";
import { useConnectionStore } from "@/store/connection-store";
import { useDiscoverStore } from "@/store/discover-store";
import { formatRuntime } from "@/lib/format";
import type { AddOptions, MediaKind, SearchResult } from "@/types/arr";

const router = useRouter();
const conn = useConnectionStore();
const disc = useDiscoverStore();

/** Only offer a kind whose service is actually configured. */
const kinds = computed(() =>
  [
    { kind: "movie" as MediaKind, label: "Films", icon: Film, ok: conn.hasKey("radarr") },
    { kind: "series" as MediaKind, label: "Séries", icon: Tv, ok: conn.hasKey("sonarr") },
  ].filter((k) => k.ok),
);
const anyConfigured = computed(() => kinds.value.length > 0);

// Default the active kind to the first configured one.
if (kinds.value.length && !kinds.value.some((k) => k.kind === disc.kind)) {
  disc.setKind(kinds.value[0].kind);
}

const query = ref(disc.term);
let debounce: ReturnType<typeof setTimeout> | undefined;

watch(query, (q) => {
  if (debounce) clearTimeout(debounce);
  // Lookups hit TMDB/TheTVDB server-side; wait for a pause before firing.
  debounce = setTimeout(() => disc.search(q), 400);
});
onBeforeUnmount(() => debounce && clearTimeout(debounce));

function selectKind(kind: MediaKind) {
  disc.setKind(kind);
  if (query.value.trim().length >= 2) disc.search(query.value);
}

function clearQuery() {
  query.value = "";
  disc.search("");
}

/* ---------- add sheet ---------- */

const sheetOpen = ref(false);
const target = ref<SearchResult | null>(null);
const metaLoading = ref(false);
const metaError = ref<string | undefined>();
const form = reactive<AddOptions>({
  qualityProfileId: 0,
  rootFolderPath: "",
  monitored: true,
  searchOnAdd: true,
});

const profiles = computed(() => (target.value ? disc.meta[target.value.kind]?.profiles ?? [] : []));
const rootFolders = computed(() =>
  target.value ? disc.meta[target.value.kind]?.rootFolders ?? [] : [],
);

async function openAdd(result: SearchResult) {
  target.value = result;
  metaError.value = undefined;
  sheetOpen.value = true;
  metaLoading.value = true;
  try {
    const meta = await disc.loadMeta(result.kind);
    // Seed with the first profile and root folder, so it is one tap to add.
    form.qualityProfileId = meta.profiles[0]?.id ?? 0;
    form.rootFolderPath = meta.rootFolders[0]?.path ?? "";
    form.monitored = true;
    form.searchOnAdd = true;
  } catch {
    metaError.value = "Impossible de charger les profils du service";
  } finally {
    metaLoading.value = false;
  }
}

const toast = ref<string | undefined>();
let toastTimer: ReturnType<typeof setTimeout> | undefined;

async function confirmAdd() {
  if (!target.value) return;
  const t = target.value;
  const ok = await disc.add(t, { ...form });
  if (ok) {
    sheetOpen.value = false;
    toast.value = `${t.title} ajouté${form.searchOnAdd ? " · recherche lancée" : ""}`;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (toast.value = undefined), 3500);
  }
}
onBeforeUnmount(() => toastTimer && clearTimeout(toastTimer));

const addLabel = computed(() =>
  target.value?.kind === "series" ? "Ajouter à Sonarr" : "Ajouter à Radarr",
);
</script>

<template>
  <div class="min-h-dvh pb-28 max-w-md mx-auto px-5 pt-14">
    <h1 class="text-[26px] font-bold -tracking-[0.02em] mb-4">Recherche</h1>

    <!-- nothing configured -->
    <div v-if="!anyConfigured" class="flex flex-col items-center text-center pt-20 gap-3 text-muted">
      <Search :size="34" />
      <p class="text-sm px-6">Configure Radarr ou Sonarr pour chercher et ajouter.</p>
      <button
        class="px-4 py-2 rounded-xl bg-surface border border-border text-sm font-semibold text-sub"
        @click="router.push('/settings')"
      >
        Réglages
      </button>
    </div>

    <template v-else>
      <!-- kind toggle: two distinct lookups (Radarr vs Sonarr) -->
      <div v-if="kinds.length > 1" class="flex gap-1 p-1 rounded-[14px] bg-field border border-field-border mb-3">
        <button
          v-for="k in kinds"
          :key="k.kind"
          type="button"
          class="flex-1 py-2 rounded-[10px] text-[13.5px] font-bold flex items-center justify-center gap-1.5 transition"
          :class="disc.kind === k.kind ? 'bg-accent text-accent-ink' : 'text-sub active:scale-95'"
          @click="selectKind(k.kind)"
        >
          <component :is="k.icon" :size="15" />
          {{ k.label }}
        </button>
      </div>

      <!-- search field -->
      <div class="flex items-center gap-2.5 h-12 rounded-[15px] bg-field border border-field-border px-3.5 mb-4">
        <Search :size="18" class="text-muted shrink-0" />
        <input
          v-model="query"
          class="flex-1 min-w-0 bg-transparent outline-none text-[15px]"
          :placeholder="disc.kind === 'movie' ? 'Chercher un film' : 'Chercher une série'"
          autocapitalize="none"
          autocorrect="off"
          spellcheck="false"
        />
        <button v-if="query" class="text-muted shrink-0" type="button" @click="clearQuery">
          <X :size="17" />
        </button>
      </div>

      <!-- states -->
      <div v-if="disc.state === 'loading'" class="flex flex-col items-center text-center pt-16 gap-3 text-muted">
        <LoaderCircle :size="26" class="animate-spin" />
        <p class="text-[13px]">Recherche…</p>
      </div>

      <div v-else-if="disc.state === 'error'" class="flex flex-col items-center text-center pt-16 gap-3">
        <AlertCircle :size="30" class="text-danger" />
        <p class="text-sub text-sm px-6">{{ disc.error }}</p>
      </div>

      <div
        v-else-if="disc.state === 'ready' && !disc.results.length"
        class="flex flex-col items-center text-center pt-16 gap-3 text-muted"
      >
        <Search :size="30" />
        <p class="text-[13px] px-6">Aucun résultat pour « {{ disc.term }} ».</p>
      </div>

      <div v-else-if="disc.state === 'idle'" class="flex flex-col items-center text-center pt-16 gap-3 text-muted">
        <component :is="disc.kind === 'movie' ? Film : Tv" :size="30" />
        <p class="text-[13px] px-6">
          Cherche un {{ disc.kind === "movie" ? "film" : "série" }} à ajouter à ta bibliothèque.
        </p>
      </div>

      <!-- results -->
      <div v-else class="flex flex-col">
        <div
          v-for="r in disc.results"
          :key="`${r.kind}-${r.externalId}`"
          class="flex gap-3 items-center py-2.5 border-b border-border last:border-0"
        >
          <div class="w-[52px] h-[78px] rounded-[9px] overflow-hidden shrink-0">
            <LazyImg :src="r.poster" :alt="r.title" class="w-full h-full">
              <template #fallback>
                <component :is="r.kind === 'movie' ? Film : Tv" :size="18" />
              </template>
            </LazyImg>
          </div>

          <div class="flex-1 min-w-0">
            <p class="text-[14.5px] font-bold leading-tight">{{ r.title }}</p>
            <div class="flex items-center gap-1.5 flex-wrap text-[12px] text-sub mt-0.5">
              <span v-if="r.year">{{ r.year }}</span>
              <span v-if="r.runtime" class="size-[3px] rounded-full bg-muted" />
              <span v-if="r.runtime">{{ formatRuntime(r.runtime) }}</span>
              <span v-if="r.network" class="size-[3px] rounded-full bg-muted" />
              <span v-if="r.network">{{ r.network }}</span>
              <span v-if="r.rating" class="size-[3px] rounded-full bg-muted" />
              <span v-if="r.rating" class="text-warn font-bold">★ {{ r.rating.toFixed(1) }}</span>
            </div>
            <p v-if="r.overview" class="text-[11.5px] text-muted mt-1 line-clamp-2 leading-snug">
              {{ r.overview }}
            </p>
          </div>

          <!-- already in library, being added, or addable -->
          <span
            v-if="r.libraryId > 0 || disc.isAdded(r.externalId)"
            class="size-[38px] rounded-xl grid place-items-center text-ok shrink-0"
            style="background: color-mix(in srgb, var(--ok) 16%, transparent)"
            aria-label="Déjà dans la bibliothèque"
          >
            <Check :size="18" :stroke-width="2.6" />
          </span>
          <span
            v-else-if="disc.isAdding(r.externalId)"
            class="size-[38px] rounded-xl grid place-items-center text-muted bg-chip shrink-0"
          >
            <LoaderCircle :size="17" class="animate-spin" />
          </span>
          <button
            v-else
            type="button"
            class="size-[38px] rounded-xl grid place-items-center bg-accent text-accent-ink shrink-0 active:scale-95 transition"
            aria-label="Ajouter"
            @click="openAdd(r)"
          >
            <Plus :size="20" :stroke-width="2.4" />
          </button>
        </div>
      </div>
    </template>

    <!-- add sheet -->
    <BottomSheet :open="sheetOpen" @close="sheetOpen = false">
      <template v-if="target">
        <div class="flex gap-3 items-center mb-4">
          <div class="w-[54px] h-[81px] rounded-[10px] overflow-hidden shrink-0">
            <LazyImg :src="target.poster" :alt="target.title" class="w-full h-full">
              <template #fallback>
                <component :is="target.kind === 'movie' ? Film : Tv" :size="18" />
              </template>
            </LazyImg>
          </div>
          <div class="min-w-0">
            <p class="text-[17px] font-bold leading-tight">{{ target.title }}</p>
            <div class="flex items-center gap-1.5 flex-wrap text-[12.5px] text-sub mt-1">
              <span v-if="target.year">{{ target.year }}</span>
              <span v-if="target.runtime" class="size-[3px] rounded-full bg-muted" />
              <span v-if="target.runtime">{{ formatRuntime(target.runtime) }}</span>
              <span v-if="target.rating" class="size-[3px] rounded-full bg-muted" />
              <span v-if="target.rating" class="text-warn font-bold">★ {{ target.rating.toFixed(1) }}</span>
            </div>
          </div>
        </div>

        <div v-if="metaLoading" class="flex items-center justify-center gap-2 text-muted text-[13px] py-8">
          <LoaderCircle :size="16" class="animate-spin" />
          Chargement des profils…
        </div>
        <div v-else-if="metaError" class="text-danger text-[13px] text-center py-6">{{ metaError }}</div>

        <template v-else>
          <!-- quality profile -->
          <div class="relative flex items-center justify-between px-4 h-[54px] rounded-[14px] bg-field border border-field-border mb-2.5">
            <div class="flex flex-col">
              <span class="text-[13.5px] font-semibold">Profil de qualité</span>
              <span class="text-[11.5px] text-muted">Quelle version chercher</span>
            </div>
            <div class="flex items-center gap-2 text-[14px] font-bold text-surface-text">
              <span>{{ profiles.find((p) => p.id === form.qualityProfileId)?.name ?? "—" }}</span>
              <ChevronDown :size="16" class="text-muted" />
            </div>
            <select
              v-model.number="form.qualityProfileId"
              class="absolute inset-0 opacity-0"
              aria-label="Profil de qualité"
            >
              <option v-for="p in profiles" :key="p.id" :value="p.id">{{ p.name }}</option>
            </select>
          </div>

          <!-- root folder -->
          <div class="relative flex items-center justify-between px-4 h-[54px] rounded-[14px] bg-field border border-field-border mb-2.5">
            <div class="flex flex-col min-w-0">
              <span class="text-[13.5px] font-semibold">Dossier</span>
              <span class="text-[11.5px] text-muted">Où ranger le fichier</span>
            </div>
            <div class="flex items-center gap-2 text-[14px] font-bold text-surface-text min-w-0">
              <span class="truncate">{{ form.rootFolderPath || "—" }}</span>
              <ChevronDown :size="16" class="text-muted shrink-0" />
            </div>
            <select
              v-model="form.rootFolderPath"
              class="absolute inset-0 opacity-0"
              aria-label="Dossier de destination"
            >
              <option v-for="f in rootFolders" :key="f.path" :value="f.path">{{ f.path }}</option>
            </select>
          </div>

          <!-- monitored -->
          <button
            type="button"
            class="w-full flex items-center justify-between px-4 h-[54px] rounded-[14px] bg-field border border-field-border mb-2.5"
            @click="form.monitored = !form.monitored"
          >
            <div class="flex flex-col items-start">
              <span class="text-[13.5px] font-semibold">Surveillé</span>
              <span class="text-[11.5px] text-muted">Traquer les sorties</span>
            </div>
            <span
              class="w-[44px] h-[26px] rounded-full relative transition-colors shrink-0"
              :style="{ background: form.monitored ? 'var(--accent)' : 'var(--chip-bg)' }"
            >
              <span
                class="absolute top-[3px] size-5 rounded-full bg-white transition-all"
                :style="{ left: form.monitored ? '21px' : '3px' }"
              />
            </span>
          </button>

          <!-- search on add -->
          <button
            type="button"
            class="w-full flex items-center justify-between px-4 h-[54px] rounded-[14px] bg-field border border-field-border mb-2.5"
            @click="form.searchOnAdd = !form.searchOnAdd"
          >
            <div class="flex flex-col items-start">
              <span class="text-[13.5px] font-semibold">Chercher maintenant</span>
              <span class="text-[11.5px] text-muted">Lancer une recherche à l'ajout</span>
            </div>
            <span
              class="w-[44px] h-[26px] rounded-full relative transition-colors shrink-0"
              :style="{ background: form.searchOnAdd ? 'var(--accent)' : 'var(--chip-bg)' }"
            >
              <span
                class="absolute top-[3px] size-5 rounded-full bg-white transition-all"
                :style="{ left: form.searchOnAdd ? '21px' : '3px' }"
              />
            </span>
          </button>

          <p v-if="disc.addError" class="text-danger text-[12.5px] px-1 mb-2">{{ disc.addError }}</p>

          <button
            type="button"
            :disabled="disc.isAdding(target.externalId) || !form.rootFolderPath"
            class="w-full h-[52px] rounded-2xl bg-accent text-accent-ink font-bold text-[15px] flex items-center justify-center gap-2 active:scale-[0.98] transition disabled:opacity-60 mt-1"
            @click="confirmAdd"
          >
            <LoaderCircle v-if="disc.isAdding(target.externalId)" :size="18" class="animate-spin" />
            <Plus v-else :size="19" :stroke-width="2.4" />
            {{ addLabel }}
          </button>
        </template>
      </template>
    </BottomSheet>

    <!-- toast -->
    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="opacity-0 translate-y-2"
      leave-active-class="transition duration-150 ease-in"
      leave-to-class="opacity-0"
    >
      <div
        v-if="toast"
        class="fixed inset-x-5 bottom-[100px] max-w-md mx-auto z-40 bg-surface border border-border rounded-2xl px-4 py-3 flex items-center gap-3 shadow-xl"
      >
        <span
          class="size-8 rounded-[10px] grid place-items-center text-ok shrink-0"
          style="background: color-mix(in srgb, var(--ok) 16%, transparent)"
        >
          <Check :size="17" :stroke-width="2.6" />
        </span>
        <p class="text-[13.5px] font-semibold">{{ toast }}</p>
      </div>
    </Transition>

    <BottomNav />
  </div>
</template>
