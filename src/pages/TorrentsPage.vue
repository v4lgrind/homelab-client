<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useRouter } from "vue-router";
import {
  Plus,
  ArrowDown,
  ArrowUp,
  Pause,
  Play,
  Zap,
  Trash2,
  AlertCircle,
  LoaderCircle,
  Settings,
} from "@lucide/vue";
import BottomNav from "@/components/BottomNav.vue";
import BottomSheet from "@/components/BottomSheet.vue";
import { useQbitStore } from "@/store/qbittorrent-store";
import { useConnectionStore } from "@/store/connection-store";
import { formatSize, formatSpeed, formatDuration } from "@/lib/format";
import type { Torrent, TorrentFilter, TorrentStatus } from "@/types/qbittorrent";

const router = useRouter();
const qbit = useQbitStore();
const conn = useConnectionStore();

const configured = computed(() => !!conn.apiKeys.qbittorrent?.trim());

const FILTERS: { key: TorrentFilter; label: string }[] = [
  { key: "all", label: "Tous" },
  { key: "active", label: "Actifs" },
  { key: "downloading", label: "Téléch." },
  { key: "completed", label: "Terminés" },
  { key: "paused", label: "En pause" },
];

const BADGE: Record<TorrentStatus, { label: string; color: string }> = {
  downloading: { label: "Téléchargement", color: "var(--accent)" },
  seeding: { label: "Partage", color: "var(--ok)" },
  stalled: { label: "Bloqué", color: "var(--warn)" },
  paused: { label: "En pause", color: "var(--muted)" },
  checking: { label: "Vérification", color: "var(--muted)" },
  error: { label: "Erreur", color: "var(--danger)" },
};

// --- add sheet ---
const addOpen = ref(false);
const addUrls = ref("");
const addCategory = ref("");
const addPaused = ref(false);
async function submitAdd() {
  const ok = await qbit.add(addUrls.value, {
    category: addCategory.value || undefined,
    paused: addPaused.value,
  });
  if (ok) {
    addUrls.value = "";
    addCategory.value = "";
    addPaused.value = false;
    addOpen.value = false;
  } else {
    alert("Ajout échoué.");
  }
}

// --- actions sheet ---
const selected = ref<Torrent | null>(null);
const busy = computed(() => qbit.actionHash !== null);

async function doPauseResume() {
  const t = selected.value;
  if (!t) return;
  await (t.status === "paused" ? qbit.resume(t) : qbit.pause(t));
  selected.value = null;
}
async function doForce() {
  const t = selected.value;
  if (!t) return;
  await qbit.forceResume(t);
  selected.value = null;
}
async function doCategory(cat: string) {
  const t = selected.value;
  if (!t) return;
  await qbit.setCategory(t, cat);
  selected.value = null;
}
const delFiles = ref(false);
async function doRemove() {
  const t = selected.value;
  if (!t) return;
  const msg = delFiles.value
    ? `Supprimer « ${t.name} » ET ses fichiers ?`
    : `Retirer « ${t.name} » (fichiers conservés) ?`;
  if (!confirm(msg)) return;
  const ok = await qbit.remove(t, delFiles.value);
  selected.value = null;
  delFiles.value = false;
  if (!ok) alert("Suppression échouée.");
}

function meta(t: Torrent): string {
  const parts: string[] = [];
  if (t.progress >= 1) parts.push(formatSize(t.size) ?? "");
  else parts.push(`${Math.round(t.progress * 100)}% · ${formatSize(t.size * t.progress)}/${formatSize(t.size)}`);
  if (t.dlspeed > 0) parts.push(`↓ ${formatSpeed(t.dlspeed)}`);
  if (t.upspeed > 0) parts.push(`↑ ${formatSpeed(t.upspeed)}`);
  const eta = formatDuration(t.eta);
  if (t.status === "downloading" && eta) parts.push(eta);
  if (t.status === "seeding") parts.push(`Ratio ${t.ratio.toFixed(2)}`);
  return parts.filter(Boolean).join("  ·  ");
}

let timer: ReturnType<typeof setInterval> | undefined;
onMounted(() => {
  if (!configured.value) return;
  qbit.fetch(true);
  timer = setInterval(() => {
    if (!busy.value && !selected.value && !addOpen.value) qbit.fetch();
  }, 4000);
});
onUnmounted(() => timer && clearInterval(timer));
</script>

<template>
  <div class="min-h-dvh pb-28 max-w-md mx-auto px-[18px] pt-14">
    <header class="flex items-center justify-between mb-3 px-0.5">
      <h1 class="text-[26px] font-bold -tracking-[0.02em]">Torrents</h1>
      <button
        v-if="configured"
        class="size-10 rounded-[13px] bg-accent text-accent-ink grid place-items-center active:scale-95 transition"
        style="box-shadow: 0 8px 20px -10px var(--accent)"
        aria-label="Ajouter"
        @click="addOpen = true"
      >
        <Plus :size="22" :stroke-width="2.4" />
      </button>
    </header>

    <!-- not configured -->
    <div v-if="!configured" class="flex flex-col items-center text-center pt-24 gap-3 text-muted">
      <Settings :size="34" />
      <p class="text-sm px-6">Configure qBittorrent (URL du proxy qui) dans les Réglages.</p>
      <button class="px-4 py-2 rounded-xl bg-accent text-accent-ink text-sm font-semibold" @click="router.push('/settings')">
        Ouvrir les Réglages
      </button>
    </div>

    <template v-else>
      <!-- global speeds -->
      <div class="flex items-center gap-4 bg-surface border border-border rounded-2xl px-4 py-2.5 mb-3">
        <span class="flex items-center gap-1.5 text-[14px] font-bold text-ok"><ArrowDown :size="15" :stroke-width="2.4" />{{ formatSpeed(qbit.dl) }}</span>
        <span class="w-px self-stretch bg-border" />
        <span class="flex items-center gap-1.5 text-[14px] font-bold text-accent"><ArrowUp :size="15" :stroke-width="2.4" />{{ formatSpeed(qbit.up) }}</span>
        <span class="w-px self-stretch bg-border" />
        <span class="text-[13px] font-semibold text-sub">{{ qbit.torrents.length }} torrents</span>
      </div>

      <!-- filters -->
      <div class="flex gap-2 pb-3 overflow-x-auto">
        <button
          v-for="f in FILTERS"
          :key="f.key"
          class="shrink-0 px-3.5 py-2 rounded-xl text-[13px] font-semibold border transition"
          :class="qbit.filter === f.key ? 'bg-accent text-accent-ink border-transparent' : 'bg-chip text-sub border-border'"
          @click="qbit.filter = f.key"
        >
          {{ f.label }}
        </button>
      </div>

      <!-- states -->
      <div v-if="qbit.state === 'loading'" class="flex flex-col items-center pt-20 gap-3 text-muted">
        <LoaderCircle :size="30" class="animate-spin" />
      </div>
      <div v-else-if="qbit.state === 'error'" class="flex flex-col items-center text-center pt-20 gap-3">
        <AlertCircle :size="34" class="text-danger" />
        <p class="text-sub text-sm">{{ qbit.error }}</p>
        <button class="px-4 py-2 rounded-xl bg-surface border border-border text-sm font-semibold" @click="qbit.fetch(true)">Réessayer</button>
      </div>
      <div v-else-if="!qbit.filtered.length" class="text-center pt-20 text-muted text-sm">Aucun torrent.</div>

      <!-- list -->
      <div v-else class="flex flex-col gap-2.5">
        <button
          v-for="t in qbit.filtered"
          :key="t.hash"
          type="button"
          class="text-left rounded-[18px] bg-surface border border-border p-3.5 active:scale-[0.99] transition"
          @click="selected = t"
        >
          <span
            class="inline-flex items-center gap-1.5 text-[10.5px] font-bold px-2 py-[3px] rounded-md mb-1.5"
            :style="{ color: BADGE[t.status].color, background: `color-mix(in srgb, ${BADGE[t.status].color} 16%, transparent)` }"
          >
            {{ BADGE[t.status].label }}
          </span>
          <p class="text-[13.5px] font-bold leading-[1.3] line-clamp-2">{{ t.name }}</p>
          <div class="h-1.5 rounded bg-chip my-2.5 overflow-hidden">
            <div class="h-full rounded" :style="{ width: Math.round(t.progress * 100) + '%', background: BADGE[t.status].color }" />
          </div>
          <p class="text-[11px] text-muted font-semibold">{{ meta(t) }}</p>
        </button>
      </div>
    </template>

    <BottomNav />

    <!-- add sheet -->
    <BottomSheet :open="addOpen" title="Ajouter un torrent" @close="addOpen = false">
      <div class="flex flex-col gap-3">
        <textarea
          v-model="addUrls"
          class="w-full bg-field border border-border rounded-[14px] p-3 text-[14px] outline-none resize-none min-h-[80px]"
          placeholder="magnet:?xt=urn:btih:… (une URL par ligne)"
        />
        <div v-if="qbit.categories.length" class="flex gap-2 overflow-x-auto">
          <button
            class="shrink-0 px-3 py-1.5 rounded-lg text-[12.5px] font-semibold border transition"
            :class="addCategory === '' ? 'bg-accent text-accent-ink border-transparent' : 'bg-chip text-sub border-border'"
            @click="addCategory = ''"
          >Sans catégorie</button>
          <button
            v-for="c in qbit.categories"
            :key="c"
            class="shrink-0 px-3 py-1.5 rounded-lg text-[12.5px] font-semibold border transition"
            :class="addCategory === c ? 'bg-accent text-accent-ink border-transparent' : 'bg-chip text-sub border-border'"
            @click="addCategory = c"
          >{{ c }}</button>
        </div>
        <label class="flex items-center justify-between py-1">
          <span class="text-[14px]">Démarrer en pause</span>
          <input v-model="addPaused" type="checkbox" class="size-5 accent-[var(--accent)]" />
        </label>
        <button class="h-12 rounded-[14px] bg-accent text-accent-ink font-bold text-[15px] flex items-center justify-center gap-2 disabled:opacity-60" :disabled="!addUrls.trim()" @click="submitAdd">
          <Plus :size="18" :stroke-width="2.4" /> Ajouter
        </button>
      </div>
    </BottomSheet>

    <!-- actions sheet -->
    <BottomSheet :open="!!selected" :title="selected?.name" @close="selected = null">
      <div class="flex flex-col gap-2">
        <button class="h-12 rounded-[14px] bg-accent text-accent-ink font-semibold text-[14px] flex items-center justify-center gap-2 disabled:opacity-60" :disabled="busy" @click="doPauseResume">
          <component :is="selected?.status === 'paused' ? Play : Pause" :size="17" />
          {{ selected?.status === "paused" ? "Reprendre" : "Mettre en pause" }}
        </button>
        <button class="h-12 rounded-[14px] bg-surface border border-border text-surface-text font-semibold text-[14px] flex items-center justify-center gap-2 disabled:opacity-60" :disabled="busy" @click="doForce">
          <Zap :size="17" /> Forcer la reprise
        </button>

        <div v-if="qbit.categories.length" class="pt-1">
          <p class="text-[11px] font-semibold uppercase tracking-wide text-muted mb-2 px-1">Catégorie</p>
          <div class="flex gap-2 overflow-x-auto pb-1">
            <button
              v-for="c in qbit.categories"
              :key="c"
              class="shrink-0 px-3 py-1.5 rounded-lg text-[12.5px] font-semibold border transition disabled:opacity-60"
              :class="selected?.category === c ? 'bg-accent text-accent-ink border-transparent' : 'bg-chip text-sub border-border'"
              :disabled="busy"
              @click="doCategory(c)"
            >{{ c }}</button>
          </div>
        </div>

        <button class="h-12 rounded-[14px] bg-surface border border-border text-danger font-semibold text-[14px] flex items-center justify-center gap-2 disabled:opacity-60 mt-1" :disabled="busy" @click="doRemove">
          <Trash2 :size="17" /> Supprimer
        </button>
        <label class="flex items-center justify-between px-1 pt-1">
          <span class="text-[13px] text-sub">Supprimer aussi les fichiers</span>
          <input v-model="delFiles" type="checkbox" class="size-5 accent-[var(--danger)]" />
        </label>
      </div>
    </BottomSheet>
  </div>
</template>
