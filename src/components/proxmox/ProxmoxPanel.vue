<script setup lang="ts">
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import { AlertCircle, Box, Database, LoaderCircle, Monitor } from "@lucide/vue";
import CertAlert from "@/components/proxmox/CertAlert.vue";
import GuestSheet from "@/components/proxmox/GuestSheet.vue";
import { useProxmoxStore } from "@/store/proxmox-store";
import { sortGuests } from "@/services/proxmox";
import { formatDuration, formatSize } from "@/lib/format";
import { RING, dashOffset, percent, sparkPoints, threshColor } from "@/lib/gauge";

const emit = defineEmits<{ (e: "retry"): void }>();

const pve = useProxmoxStore();
const router = useRouter();

const snap = computed(() => pve.snapshot);
const node = computed(() => snap.value?.node);
const guests = computed(() => sortGuests(snap.value?.guests ?? []));
const runningCount = computed(() => guests.value.filter((g) => g.running).length);
const memPct = computed(() => (node.value ? percent(node.value.memUsed, node.value.memTotal) : 0));

const openVmid = ref<number | null>(null);
</script>

<template>
  <CertAlert v-if="pve.certMismatch" />

  <template v-else-if="!snap">
    <div v-if="pve.state === 'error'" class="flex flex-col items-center text-center gap-3 py-8">
      <AlertCircle :size="34" class="text-danger" />
      <p class="text-sub text-sm px-6">{{ pve.error }}</p>
      <div class="flex gap-2">
        <button class="px-4 py-2 rounded-xl bg-surface border border-border text-sm font-semibold" @click="emit('retry')">Réessayer</button>
        <button class="px-4 py-2 rounded-xl bg-surface border border-border text-sm font-semibold text-sub" @click="router.push('/settings')">Réglages</button>
      </div>
    </div>
    <div v-else class="flex flex-col items-center text-center gap-3 text-muted py-8">
      <LoaderCircle :size="30" class="animate-spin" />
      <p class="text-sm">Connexion à Proxmox…</p>
    </div>
  </template>

  <template v-else-if="node">
    <p class="text-xs text-sub flex items-center gap-1.5 flex-wrap mb-3 px-0.5">
      <span class="text-[13px] font-bold text-text">{{ node.node }}</span>
      <template v-if="node.version">
        <span class="size-[3px] rounded-full bg-muted" />
        <span>PVE {{ node.version }}</span>
      </template>
      <template v-if="formatDuration(node.uptime)">
        <span class="size-[3px] rounded-full bg-muted" />
        <span>up {{ formatDuration(node.uptime) }}</span>
      </template>
    </p>

    <!-- gauges -->
    <div class="grid grid-cols-2 gap-3">
      <div
        v-for="gauge in [
          { label: 'CPU', pct: node.cpu, sub: node.cores ? `${node.cores} cœurs` : '', hist: pve.cpuHistory },
          { label: 'Mémoire', pct: memPct, sub: `${formatSize(node.memUsed) ?? '0'}/${formatSize(node.memTotal) ?? '—'}`, hist: pve.memHistory },
        ]"
        :key="gauge.label"
        class="bg-surface border border-border rounded-[22px] p-4 pb-3.5 flex flex-col items-center"
      >
        <div class="relative size-[118px]">
          <svg width="118" height="118" viewBox="0 0 118 118">
            <circle cx="59" cy="59" r="50" fill="none" stroke="var(--surface-2)" stroke-width="10" />
            <circle cx="59" cy="59" r="50" fill="none" :stroke="threshColor(gauge.pct)" stroke-width="10" stroke-linecap="round" :stroke-dasharray="RING" :stroke-dashoffset="dashOffset(gauge.pct)" transform="rotate(-90 59 59)" />
          </svg>
          <div class="absolute inset-0 flex flex-col items-center justify-center">
            <div class="text-[27px] font-bold -tracking-[0.02em] leading-none" :style="{ color: threshColor(gauge.pct) }">{{ gauge.pct }}<span class="text-[15px]">%</span></div>
            <div v-if="gauge.sub" class="text-xs text-sub font-semibold mt-1">{{ gauge.sub }}</div>
          </div>
        </div>
        <div class="text-[13px] font-bold mt-2.5">{{ gauge.label }}</div>
        <svg class="w-full h-[26px] mt-2" viewBox="0 0 120 26" preserveAspectRatio="none">
          <polyline fill="none" :stroke="threshColor(gauge.pct)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" :points="sparkPoints(gauge.hist)" />
        </svg>
      </div>
    </div>

    <!-- load / running / swap -->
    <div class="grid grid-cols-3 gap-2.5 mt-3">
      <div class="bg-surface border border-border rounded-2xl py-3 px-2.5 text-center">
        <div class="text-[17px] font-bold -tracking-[0.01em]">{{ node.load1?.toFixed(2) ?? "—" }}</div>
        <div class="text-[11px] text-muted font-semibold uppercase tracking-[0.08em] mt-0.5">Charge 1m</div>
      </div>
      <div class="bg-surface border border-border rounded-2xl py-3 px-2.5 text-center">
        <div class="text-[17px] font-bold -tracking-[0.01em]">{{ runningCount }}<span class="text-xs text-sub font-semibold">/{{ guests.length }}</span></div>
        <div class="text-[11px] text-muted font-semibold uppercase tracking-[0.08em] mt-0.5">En marche</div>
      </div>
      <div class="bg-surface border border-border rounded-2xl py-3 px-2.5 text-center">
        <div class="text-[17px] font-bold -tracking-[0.01em]">{{ node.swapPercent != null ? node.swapPercent + "%" : "—" }}</div>
        <div class="text-[11px] text-muted font-semibold uppercase tracking-[0.08em] mt-0.5">Swap</div>
      </div>
    </div>

    <!-- guests -->
    <template v-if="guests.length">
      <p class="text-xs font-bold tracking-[0.1em] uppercase text-muted mt-5 mb-2.5 flex justify-between gap-2">
        <span>VM &amp; conteneurs</span>
        <span class="normal-case tracking-[0.02em] font-semibold">
          {{ runningCount }} en marche · {{ guests.length - runningCount }} éteints
        </span>
      </p>
      <div class="bg-surface border border-border rounded-[20px] overflow-hidden">
        <button
          v-for="g in guests"
          :key="g.vmid"
          type="button"
          class="w-full grid grid-cols-[auto_1fr_auto] items-center gap-3 px-3.5 py-3 text-left border-t border-border first:border-t-0 active:bg-surface-2 transition"
          :class="{ 'opacity-45': !g.running }"
          @click="openVmid = g.vmid"
        >
          <div class="relative size-[34px] rounded-[11px] bg-chip grid place-items-center text-accent">
            <component :is="g.type === 'lxc' ? Box : Monitor" :size="17" />
            <span
              class="absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full border-2 border-surface"
              :class="g.running ? 'bg-ok' : 'bg-muted'"
            />
          </div>
          <div class="min-w-0">
            <p class="text-sm font-bold flex items-center gap-1.5 min-w-0">
              <span class="truncate">{{ g.name }}</span>
              <span class="text-[11px] font-bold tracking-[0.06em] text-muted bg-chip px-1.5 py-px rounded-[5px] shrink-0">
                {{ g.type === "lxc" ? "LXC" : "VM" }} {{ g.vmid }}
              </span>
            </p>
            <template v-if="g.running">
              <p class="text-[11.5px] text-sub mt-0.5">RAM {{ formatSize(g.memUsed) ?? "0" }}/{{ formatSize(g.memTotal) ?? "—" }}</p>
              <div class="h-1 rounded bg-surface-2 mt-1.5 overflow-hidden">
                <div class="h-full rounded" :style="{ width: percent(g.memUsed, g.memTotal) + '%', background: threshColor(percent(g.memUsed, g.memTotal)) }" />
              </div>
            </template>
            <p v-else class="text-[11.5px] text-sub mt-0.5">
              {{ g.type === "lxc" ? "Éteint" : "Éteinte" }} · {{ formatSize(g.memTotal) ?? "—" }} alloués
            </p>
          </div>
          <div class="text-right">
            <template v-if="g.running">
              <p class="text-[15px] font-bold -tracking-[0.01em]">{{ g.cpu }}%</p>
              <p class="text-[11px] text-muted font-semibold uppercase tracking-[0.08em]">CPU</p>
            </template>
            <p v-else class="text-[15px] font-bold text-muted">—</p>
          </div>
        </button>
      </div>
    </template>

    <!-- storages -->
    <template v-if="snap.storages.length">
      <p class="text-xs font-bold tracking-[0.1em] uppercase text-muted mt-5 mb-2.5">Stockages</p>
      <div class="flex flex-col gap-2.5">
        <div v-for="s in snap.storages" :key="s.id" class="bg-surface border border-border rounded-2xl px-3.5 py-3">
          <div class="flex items-center justify-between gap-2">
            <div class="flex items-center gap-2 min-w-0 text-[13.5px] font-bold">
              <Database :size="15" :style="{ color: threshColor(s.percent) }" class="shrink-0" />
              <span class="truncate">{{ s.id }}</span>
              <span v-if="s.type" class="text-[11px] text-muted font-medium">{{ s.type }}</span>
            </div>
            <div
              class="text-[12px] font-semibold whitespace-nowrap"
              :style="s.percent >= 90 ? { color: 'var(--danger)' } : s.percent >= 70 ? { color: 'var(--warn)' } : { color: 'var(--sub)' }"
            >
              {{ formatSize(s.used) ?? "0" }} / {{ formatSize(s.total) }} · {{ s.percent }}%
            </div>
          </div>
          <div class="h-[7px] rounded bg-surface-2 mt-2.5 overflow-hidden">
            <div class="h-full rounded" :style="{ width: s.percent + '%', background: threshColor(s.percent) }" />
          </div>
        </div>
      </div>
    </template>

    <GuestSheet :vmid="openVmid" @close="openVmid = null" />
  </template>
</template>
