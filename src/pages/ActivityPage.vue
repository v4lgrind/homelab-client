<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useRouter } from "vue-router";
import {
  RefreshCw,
  AlertCircle,
  LoaderCircle,
  ArrowDownToLine,
  Check,
  Film,
  Tv,
  TriangleAlert,
  Wrench,
  Import,
  Trash2,
  Ban,
} from "@lucide/vue";
import BottomNav from "@/components/BottomNav.vue";
import BottomSheet from "@/components/BottomSheet.vue";
import LazyImg from "@/components/LazyImg.vue";
import { useActivityStore } from "@/store/activity-store";
import { useConfirm } from "@/composables/useConfirm";
import { formatSize, formatEta, formatAge } from "@/lib/format";
import type { HistoryItem, QueueItem } from "@/types/arr";

const { confirm } = useConfirm();
const router = useRouter();
const act = useActivityStore();

let timer: ReturnType<typeof setInterval> | undefined;
const selected = ref<QueueItem | null>(null);
const busy = computed(() => act.actionBusyKey !== null);

function pct(q: QueueItem) {
  return Math.round(q.progress * 100);
}
function downloaded(q: QueueItem) {
  if (q.size == null || q.sizeleft == null) return undefined;
  return formatSize(q.size - q.sizeleft);
}
function ago(iso: string): string {
  const min = (Date.now() - Date.parse(iso)) / 60000;
  const a = formatAge(undefined, min);
  return a ? `il y a ${a}` : "à l'instant";
}
function open(item: QueueItem | HistoryItem) {
  router.push(`/${item.kind}/${item.mediaId}`);
}

async function doForce() {
  const it = selected.value;
  if (!it) return;
  if (!(await confirm({ title: `Forcer l'import de « ${it.title} » ?`, confirmText: "Forcer" }))) return;
  const ok = await act.forceImport(it);
  selected.value = null;
  if (!ok)
    await confirm({
      title: "Import impossible",
      message: "Aucun mapping utilisable pour cet élément.",
      confirmText: "OK",
      cancelText: null,
    });
}
async function doRemove(blocklist: boolean) {
  const it = selected.value;
  if (!it) return;
  const ok = await confirm({
    title: blocklist ? "Retirer et blocklister ?" : "Retirer de la file ?",
    message: blocklist
      ? `« ${it.title} » sera retiré, blocklisté, et une nouvelle recherche relancée.`
      : `« ${it.title} » sera retiré de la file.`,
    confirmText: "Retirer",
    danger: true,
  });
  if (!ok) return;
  const removed = await act.removeFromQueue(it, blocklist);
  selected.value = null;
  if (!removed) await confirm({ title: "Action échouée.", confirmText: "OK", cancelText: null });
}

onMounted(() => {
  act.fetch(true);
  timer = setInterval(() => {
    if (!busy.value && !selected.value) act.fetch();
  }, 5000);
});
onUnmounted(() => timer && clearInterval(timer));

const empty = computed(() => act.state === "ready" && !act.queue.length && !act.recent.length);
</script>

<template>
  <div class="min-h-dvh pb-28 max-w-md mx-auto px-5 pt-14">
    <header class="flex items-center justify-between mb-4">
      <h1 class="text-[26px] font-bold -tracking-[0.02em]">Activité</h1>
      <button class="size-10 rounded-[13px] bg-surface border border-border grid place-items-center text-sub active:scale-95 transition disabled:opacity-50" :disabled="act.state === 'loading'" aria-label="Rafraîchir" @click="act.fetch(true)">
        <RefreshCw :size="18" :class="{ 'animate-spin': act.state === 'loading' }" />
      </button>
    </header>

    <div v-if="act.state === 'loading'" class="flex flex-col items-center text-center pt-24 gap-3 text-muted">
      <LoaderCircle :size="30" class="animate-spin" />
      <p class="text-sm">Chargement…</p>
    </div>

    <div v-else-if="act.state === 'error'" class="flex flex-col items-center text-center pt-24 gap-3">
      <AlertCircle :size="34" class="text-danger" />
      <p class="text-sub text-sm">{{ act.error }}</p>
      <button class="px-4 py-2 rounded-xl bg-surface border border-border text-sm font-semibold" @click="act.fetch(true)">
        Réessayer
      </button>
    </div>

    <div v-else-if="empty" class="flex flex-col items-center text-center pt-24 gap-3 text-muted">
      <ArrowDownToLine :size="34" />
      <p class="text-sm">Aucun téléchargement en cours.</p>
    </div>

    <template v-else>
      <!-- En cours -->
      <template v-if="act.queue.length">
        <p class="text-xs font-semibold tracking-[0.1em] uppercase text-muted mb-2.5">
          En cours · {{ act.queue.length }}
        </p>
        <div class="flex flex-col gap-2.5 mb-6">
          <div
            v-for="q in act.queue"
            :key="q.key"
            class="rounded-2xl bg-surface border p-3.5"
            :class="q.blocked ? 'border-warn/40' : 'border-border'"
          >
            <div class="flex gap-3 cursor-pointer" @click="open(q)">
              <div class="w-11 h-16 rounded-lg overflow-hidden shrink-0">
                <LazyImg :src="q.poster" :alt="q.title" class="w-full h-full">
                  <template #fallback>
                    <component :is="q.kind === 'movie' ? Film : Tv" :size="18" />
                  </template>
                </LazyImg>
              </div>
              <div class="min-w-0 flex-1">
                <p class="text-[14px] font-bold leading-tight truncate">{{ q.title }}</p>
                <p v-if="q.subtitle" class="text-[11.5px] text-sub truncate mt-0.5">{{ q.subtitle }}</p>
                <div class="h-1.5 rounded bg-chip mt-2.5 overflow-hidden">
                  <div class="h-full rounded transition-all" :class="q.blocked ? 'bg-warn' : 'bg-accent'" :style="{ width: pct(q) + '%' }" />
                </div>
                <div class="flex justify-between text-[11px] text-muted font-semibold mt-1.5">
                  <span>{{ pct(q) }}%<template v-if="downloaded(q) && formatSize(q.size)"> · {{ downloaded(q) }}/{{ formatSize(q.size) }}</template></span>
                  <span :class="{ 'text-warn': q.blocked }">
                    {{ q.blocked ? "Bloqué" : q.statusLabel ?? (formatEta(q.timeleft) ? "≈ " + formatEta(q.timeleft) : "") }}
                  </span>
                </div>
              </div>
            </div>

            <!-- blocked: reasons + manage -->
            <div v-if="q.blocked" class="mt-2.5 pt-2.5 border-t border-border">
              <p v-if="q.messages.length" class="flex items-start gap-1.5 text-[11.5px] text-warn leading-snug">
                <TriangleAlert :size="13" class="shrink-0 mt-px" />
                <span class="line-clamp-3">{{ q.messages.join(" · ") }}</span>
              </p>
              <button
                class="mt-2 w-full h-9 rounded-xl text-[12.5px] font-semibold flex items-center justify-center gap-1.5 text-warn"
                style="background: color-mix(in srgb, var(--warn) 15%, transparent)"
                @click="selected = q"
              >
                <Wrench :size="14" /> Gérer le blocage
              </button>
            </div>
          </div>
        </div>
      </template>

      <!-- Récent -->
      <template v-if="act.recent.length">
        <p class="text-xs font-semibold tracking-[0.1em] uppercase text-muted mb-2.5">Récent</p>
        <div class="flex flex-col gap-2.5">
          <button
            v-for="h in act.recent"
            :key="h.key"
            type="button"
            class="flex items-center gap-3 text-left rounded-2xl bg-surface border border-border p-2.5 active:scale-[0.99] transition"
            @click="open(h)"
          >
            <div class="w-9 h-[52px] rounded-md overflow-hidden shrink-0">
              <LazyImg :src="h.poster" :alt="h.title" class="w-full h-full">
                <template #fallback>
                  <component :is="h.kind === 'movie' ? Film : Tv" :size="16" />
                </template>
              </LazyImg>
            </div>
            <div class="min-w-0 flex-1">
              <p class="text-[13.5px] font-bold leading-tight truncate">{{ h.title }}</p>
              <p v-if="h.subtitle" class="text-[11.5px] text-sub truncate mt-0.5">{{ h.subtitle }}</p>
            </div>
            <div class="shrink-0 flex items-center gap-2">
              <span class="text-[11px] text-muted font-medium">{{ ago(h.date) }}</span>
              <span class="text-ok"><Check :size="15" :stroke-width="2.6" /></span>
            </div>
          </button>
        </div>
      </template>
    </template>

    <BottomNav />

    <!-- blocked-import actions -->
    <BottomSheet :open="!!selected" :title="selected?.title" @close="selected = null">
      <p v-if="selected?.messages.length" class="flex items-start gap-1.5 text-[12px] text-warn leading-snug mb-3 px-1">
        <TriangleAlert :size="13" class="shrink-0 mt-px" />
        <span>{{ selected.messages.join(" · ") }}</span>
      </p>
      <div class="flex flex-col gap-2">
        <button class="h-12 rounded-xl bg-accent text-accent-ink font-semibold text-[14px] flex items-center justify-center gap-2 disabled:opacity-60" :disabled="busy" @click="doForce">
          <LoaderCircle v-if="busy" :size="16" class="animate-spin" />
          <Import v-else :size="17" />
          Forcer l'import
        </button>
        <button class="h-12 rounded-xl bg-surface border border-border text-surface-text font-semibold text-[14px] flex items-center justify-center gap-2 disabled:opacity-60" :disabled="busy" @click="doRemove(false)">
          <Trash2 :size="17" /> Retirer de la file
        </button>
        <button class="h-12 rounded-xl bg-surface border border-border text-danger font-semibold text-[14px] flex items-center justify-center gap-2 disabled:opacity-60" :disabled="busy" @click="doRemove(true)">
          <Ban :size="17" /> Retirer + blocklister &amp; rechercher
        </button>
      </div>
    </BottomSheet>
  </div>
</template>
