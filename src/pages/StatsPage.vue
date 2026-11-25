<script setup lang="ts">
import { computed, onMounted, onUnmounted, watch } from "vue";
import { useStorage } from "@vueuse/core";
import { useRouter } from "vue-router";
import { RefreshCw, LoaderCircle, AlertCircle, ArrowDown, ArrowUp, HardDrive, Monitor, Server } from "@lucide/vue";
import BottomNav from "@/components/BottomNav.vue";
import SessionCard from "@/components/SessionCard.vue";
import ServiceLogo from "@/components/ServiceLogo.vue";
import ProxmoxPanel from "@/components/proxmox/ProxmoxPanel.vue";
import { STORAGE_KEYS } from "@/constants";
import { useConnectionStore } from "@/store/connection-store";
import { useGlancesStore } from "@/store/glances-store";
import { useProxmoxStore } from "@/store/proxmox-store";
import { useMediaServersStore } from "@/store/mediaservers-store";
import { formatSize, formatRate } from "@/lib/format";
import { RING, dashOffset, sparkPoints, threshColor } from "@/lib/gauge";

const router = useRouter();
const conn = useConnectionStore();
const g = useGlancesStore();
const pve = useProxmoxStore();
const ms = useMediaServersStore();
let timer: ReturnType<typeof setInterval> | undefined;
let mediaTimer: ReturnType<typeof setInterval> | undefined;

const SERVER_LABEL = { jellyfin: "Jellyfin", plex: "Plex" } as const;

/** Streams per server, to annotate the health cards. */
function streamCount(server: "jellyfin" | "plex"): number {
  return ms.sessions.filter((s) => s.server === server).length;
}

function tempColor(v: number): string {
  return v >= 85 ? "var(--danger)" : v >= 70 ? "var(--warn)" : "var(--text)";
}

const uptime = computed(() => {
  const u = g.stats?.uptime;
  if (!u) return undefined;
  return "up " + u.split(",")[0].replace(/days?/, "j").trim();
});
const topNet = computed(() => g.stats?.net[0]);

type StatsTab = "machine" | "proxmox";
const glancesOn = computed(() => !!conn.urlOf("glances"));
const proxmoxOn = computed(
  () => !!conn.urlOf("proxmox") && !!conn.services.proxmox?.username?.trim() && !!conn.passwords.proxmox,
);
/** Machine / Proxmox picker: only offered when both are set up. */
const showTabs = computed(() => glancesOn.value && proxmoxOn.value);
const pickedTab = useStorage<StatsTab>(STORAGE_KEYS.statsTab, "machine");
const tab = computed<StatsTab>(() =>
  showTabs.value ? pickedTab.value : proxmoxOn.value && !glancesOn.value ? "proxmox" : "machine",
);

/** Refreshes the visible tab only: Glances every 3 s, Proxmox every 5 s. */
function startPolling() {
  if (timer) clearInterval(timer);
  timer =
    tab.value === "proxmox" ? setInterval(() => pve.fetch(), 5000) : setInterval(() => g.fetch(), 3000);
}

function load(force = false) {
  if (tab.value === "proxmox") pve.fetch(force);
  else g.fetch(force);
  if (ms.anyConfigured) ms.fetchAll();
}

const refreshing = computed(
  () => (tab.value === "proxmox" ? pve.state === "loading" : g.state === "loading") || ms.loading,
);

watch(tab, () => {
  load(true);
  startPolling();
});

onMounted(() => {
  load(true);
  startPolling();
  // Sessions move far slower than CPU: polling two media servers every 3s would
  // be wasteful for a progress bar that advances a pixel.
  mediaTimer = setInterval(() => ms.anyConfigured && ms.fetchAll(), 8000);
});
onUnmounted(() => {
  if (timer) clearInterval(timer);
  if (mediaTimer) clearInterval(mediaTimer);
});
</script>

<template>
  <div class="min-h-dvh pb-28 max-w-md mx-auto px-5 pt-safe">
    <!-- header -->
    <header class="flex items-start justify-between mb-4">
      <div class="min-w-0">
        <h1 class="text-[26px] font-bold -tracking-[0.02em]">Serveur</h1>
        <p v-if="tab === 'machine' && g.stats" class="text-xs text-sub flex items-center gap-1.5 flex-wrap mt-0.5">
          <span v-if="g.stats.hostname">{{ g.stats.hostname }}</span>
          <span v-if="g.stats.os" class="size-[3px] rounded-full bg-muted" />
          <span v-if="g.stats.os">{{ g.stats.os }}</span>
          <span v-if="uptime" class="size-[3px] rounded-full bg-muted" />
          <span v-if="uptime">{{ uptime }}</span>
        </p>
      </div>
      <button class="size-10 rounded-[13px] bg-surface border border-border grid place-items-center text-sub active:scale-95 transition disabled:opacity-50 shrink-0" :disabled="refreshing" aria-label="Rafraîchir" @click="load(true)">
        <RefreshCw :size="18" :class="{ 'animate-spin': refreshing }" />
      </button>
    </header>

    <!-- ===== media servers ===== -->
    <template v-if="ms.anyConfigured">
      <p class="text-xs font-bold tracking-[0.1em] uppercase text-muted mb-2.5">
        Lecture en cours{{ ms.sessions.length ? ` · ${ms.sessions.length}` : "" }}
      </p>

      <div v-if="!ms.loadedOnce" class="flex items-center justify-center gap-2 text-muted text-[12.5px] py-6">
        <LoaderCircle :size="16" class="animate-spin" />
        Chargement des sessions…
      </div>
      <div
        v-else-if="!ms.sessions.length"
        class="text-center text-muted text-[12.5px] py-[22px] border border-dashed border-border rounded-2xl"
      >
        Personne ne regarde.
      </div>
      <div v-else class="flex flex-col gap-2.5">
        <SessionCard v-for="s in ms.sessions" :key="s.id" :session="s" />
      </div>

      <template v-if="ms.health.length">
        <p class="text-xs font-bold tracking-[0.1em] uppercase text-muted mt-5 mb-2.5">Serveurs média</p>
        <div class="flex gap-2.5">
          <div v-for="h in ms.health" :key="h.server" class="flex-1 min-w-0 bg-surface border border-border rounded-2xl p-3">
            <div class="flex items-center gap-2 text-[13.5px] font-bold">
              <ServiceLogo :id="h.server" :size="22" />
              {{ SERVER_LABEL[h.server] }}
            </div>
            <p class="text-[10.5px] text-muted mt-1 truncate">
              {{ h.online ? (h.version ? `v${h.version}` : (h.name ?? "en ligne")) : (h.error ?? "injoignable") }}
            </p>
            <p class="text-[11px] font-bold mt-1.5" :class="h.online ? 'text-ok' : 'text-danger'">
              ● {{ h.online ? "En ligne" : "Hors ligne"
              }}{{ h.online && streamCount(h.server) ? ` · ${streamCount(h.server)} flux` : "" }}
            </p>
          </div>
        </div>
      </template>

      <p v-if="!showTabs" class="text-xs font-bold tracking-[0.1em] uppercase text-muted mt-5 mb-2.5">
        {{ tab === "proxmox" ? "Proxmox" : "Machine" }}
      </p>
    </template>

    <!-- Machine (Glances) / Proxmox -->
    <div
      v-if="showTabs"
      data-test="stats-tabs"
      role="tablist"
      class="flex gap-1 p-1 rounded-[14px] bg-surface border border-border mb-3.5"
      :class="ms.anyConfigured ? 'mt-5' : ''"
    >
      <button
        v-for="t in [
          { id: 'machine', label: 'Machine', icon: Monitor },
          { id: 'proxmox', label: 'Proxmox', icon: Server },
        ] as const"
        :key="t.id"
        type="button"
        role="tab"
        :data-test="`tab-${t.id}`"
        :aria-selected="tab === t.id"
        class="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-[10px] text-[13px] font-semibold transition"
        :class="tab === t.id ? 'bg-accent text-accent-ink' : 'text-sub'"
        @click="pickedTab = t.id"
      >
        <component :is="t.icon" :size="15" />
        {{ t.label }}
      </button>
    </div>

    <ProxmoxPanel v-if="tab === 'proxmox'" @retry="load(true)" />

    <template v-else>

    <!-- loading -->
    <div
      v-if="g.state === 'loading' && !g.stats"
      class="flex flex-col items-center text-center gap-3 text-muted"
      :class="ms.anyConfigured ? 'py-8' : 'pt-24'"
    >
      <LoaderCircle :size="30" class="animate-spin" />
      <p class="text-sm">Connexion à Glances…</p>
    </div>

    <!-- error -->
    <div
      v-else-if="g.state === 'error' && !g.stats"
      class="flex flex-col items-center text-center gap-3"
      :class="ms.anyConfigured ? 'py-8' : 'pt-24'"
    >
      <AlertCircle :size="34" class="text-danger" />
      <p class="text-sub text-sm px-6">{{ g.error }}</p>
      <div class="flex gap-2">
        <button class="px-4 py-2 rounded-xl bg-surface border border-border text-sm font-semibold" @click="load(true)">Réessayer</button>
        <button class="px-4 py-2 rounded-xl bg-surface border border-border text-sm font-semibold text-sub" @click="router.push('/settings')">Réglages</button>
      </div>
    </div>

    <!-- dashboard -->
    <template v-else-if="g.stats">
      <!-- gauges -->
      <div class="grid grid-cols-2 gap-3">
        <div class="bg-surface border border-border rounded-[22px] p-4 pb-3.5 flex flex-col items-center">
          <div class="relative size-[118px]">
            <svg width="118" height="118" viewBox="0 0 118 118">
              <circle cx="59" cy="59" r="50" fill="none" stroke="var(--surface-2)" stroke-width="10" />
              <circle cx="59" cy="59" r="50" fill="none" :stroke="threshColor(g.stats.cpu)" stroke-width="10" stroke-linecap="round" :stroke-dasharray="RING" :stroke-dashoffset="dashOffset(g.stats.cpu)" transform="rotate(-90 59 59)" />
            </svg>
            <div class="absolute inset-0 flex flex-col items-center justify-center">
              <div class="text-[27px] font-bold -tracking-[0.02em] leading-none" :style="{ color: threshColor(g.stats.cpu) }">{{ g.stats.cpu }}<span class="text-[15px]">%</span></div>
              <div v-if="g.stats.cpuCores" class="text-xs text-sub font-semibold mt-1">{{ g.stats.cpuCores }} cœurs</div>
            </div>
          </div>
          <div class="text-[13px] font-bold mt-2.5">CPU</div>
          <svg class="w-full h-[26px] mt-2" viewBox="0 0 120 26" preserveAspectRatio="none">
            <polyline fill="none" :stroke="threshColor(g.stats.cpu)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" :points="sparkPoints(g.cpuHistory)" />
          </svg>
        </div>

        <div class="bg-surface border border-border rounded-[22px] p-4 pb-3.5 flex flex-col items-center">
          <div class="relative size-[118px]">
            <svg width="118" height="118" viewBox="0 0 118 118">
              <circle cx="59" cy="59" r="50" fill="none" stroke="var(--surface-2)" stroke-width="10" />
              <circle cx="59" cy="59" r="50" fill="none" :stroke="threshColor(g.stats.memPercent)" stroke-width="10" stroke-linecap="round" :stroke-dasharray="RING" :stroke-dashoffset="dashOffset(g.stats.memPercent)" transform="rotate(-90 59 59)" />
            </svg>
            <div class="absolute inset-0 flex flex-col items-center justify-center">
              <div class="text-[27px] font-bold -tracking-[0.02em] leading-none" :style="{ color: threshColor(g.stats.memPercent) }">{{ g.stats.memPercent }}<span class="text-[15px]">%</span></div>
              <div v-if="g.stats.memTotal" class="text-xs text-sub font-semibold mt-1">{{ formatSize(g.stats.memUsed) }}/{{ formatSize(g.stats.memTotal) }}</div>
            </div>
          </div>
          <div class="text-[13px] font-bold mt-2.5">Mémoire</div>
          <svg class="w-full h-[26px] mt-2" viewBox="0 0 120 26" preserveAspectRatio="none">
            <polyline fill="none" :stroke="threshColor(g.stats.memPercent)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" :points="sparkPoints(g.memHistory)" />
          </svg>
        </div>
      </div>

      <!-- load / swap / procs -->
      <div class="grid grid-cols-3 gap-2.5 mt-3">
        <div class="bg-surface border border-border rounded-2xl py-3 px-2.5 text-center">
          <div class="text-[17px] font-bold -tracking-[0.01em]">{{ g.stats.load1?.toFixed(2) ?? "—" }}</div>
          <div class="text-[10.5px] text-muted font-semibold uppercase tracking-[0.08em] mt-0.5">Charge 1m</div>
        </div>
        <div class="bg-surface border border-border rounded-2xl py-3 px-2.5 text-center">
          <div class="text-[17px] font-bold -tracking-[0.01em]">{{ g.stats.swapPercent != null ? g.stats.swapPercent + "%" : "—" }}</div>
          <div class="text-[10.5px] text-muted font-semibold uppercase tracking-[0.08em] mt-0.5">Swap</div>
        </div>
        <div class="bg-surface border border-border rounded-2xl py-3 px-2.5 text-center">
          <div class="text-[17px] font-bold -tracking-[0.01em]">{{ g.stats.procs ?? "—" }}</div>
          <div class="text-[10.5px] text-muted font-semibold uppercase tracking-[0.08em] mt-0.5">Procs</div>
        </div>
      </div>

      <!-- Temperatures (important — high up) -->
      <template v-if="g.stats.temps.length">
        <p class="text-xs font-bold tracking-[0.1em] uppercase text-muted mt-5 mb-2.5">Températures</p>
        <div class="flex gap-2 flex-wrap">
          <div v-for="t in g.stats.temps" :key="t.label" class="flex items-center gap-2 bg-surface border border-border rounded-xl px-3 py-2.5 text-[12.5px] font-semibold">
            <span class="text-sub">{{ t.label }}</span>
            <span class="font-bold" :style="{ color: tempColor(t.value) }">{{ t.value }}{{ t.unit }}</span>
          </div>
        </div>
      </template>

      <!-- Disks -->
      <template v-if="g.stats.disks.length">
        <p class="text-xs font-bold tracking-[0.1em] uppercase text-muted mt-5 mb-2.5">Disques</p>
        <div class="flex flex-col gap-2.5">
          <div v-for="d in g.stats.disks" :key="d.mount" class="bg-surface border border-border rounded-2xl px-3.5 py-3">
            <div class="flex items-center justify-between gap-2">
              <div class="flex items-center gap-2 min-w-0 text-[13.5px] font-bold">
                <HardDrive :size="15" :style="{ color: threshColor(d.percent) }" class="shrink-0" />
                <span class="truncate">{{ d.mount }}</span>
                <span v-if="d.fstype" class="text-[11px] text-muted font-medium">{{ d.fstype }}</span>
              </div>
              <div class="text-[12px] font-semibold whitespace-nowrap" :style="d.percent >= 90 ? { color: 'var(--danger)' } : d.percent >= 70 ? { color: 'var(--warn)' } : { color: 'var(--sub)' }">
                {{ formatSize(d.used) }} / {{ formatSize(d.total) }} · {{ d.percent }}%
              </div>
            </div>
            <div class="h-[7px] rounded bg-surface-2 mt-2.5 overflow-hidden">
              <div class="h-full rounded" :style="{ width: d.percent + '%', background: threshColor(d.percent) }" />
            </div>
          </div>
        </div>
      </template>

      <!-- Network -->
      <template v-if="topNet">
        <p class="text-xs font-bold tracking-[0.1em] uppercase text-muted mt-5 mb-2.5">Réseau · {{ topNet.iface }}</p>
        <div class="flex gap-2.5">
          <div class="flex-1 bg-surface border border-border rounded-2xl px-3.5 py-3">
            <div class="flex items-center gap-1.5 text-[11.5px] text-muted font-semibold"><ArrowDown :size="14" class="text-ok" />Download</div>
            <div class="text-[18px] font-bold -tracking-[0.01em] mt-1">{{ formatRate(topNet.rx) }}</div>
          </div>
          <div class="flex-1 bg-surface border border-border rounded-2xl px-3.5 py-3">
            <div class="flex items-center gap-1.5 text-[11.5px] text-muted font-semibold"><ArrowUp :size="14" class="text-accent" />Upload</div>
            <div class="text-[18px] font-bold -tracking-[0.01em] mt-1">{{ formatRate(topNet.tx) }}</div>
          </div>
        </div>
      </template>
    </template>

    </template>

    <BottomNav />
  </div>
</template>
