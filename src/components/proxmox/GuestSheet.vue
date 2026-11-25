<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Box, Monitor } from "@lucide/vue";
import BottomSheet from "@/components/BottomSheet.vue";
import { useProxmoxStore } from "@/store/proxmox-store";
import { formatDuration, formatRate, formatSize } from "@/lib/format";
import { percent, threshColor } from "@/lib/gauge";

const props = defineProps<{ vmid: number | null }>();
const emit = defineEmits<{ (e: "close"): void }>();

const pve = useProxmoxStore();
// Read live from the store so the sheet follows each 5 s refresh.
const guest = computed(() => pve.snapshot?.guests.find((g) => g.vmid === props.vmid));
const rate = computed(() => (props.vmid != null ? pve.rates[props.vmid] : undefined));

const ip = ref<string | undefined>();
const ipLoading = ref(false);
watch(
  () => props.vmid,
  async (vmid) => {
    ip.value = undefined;
    if (vmid == null || !guest.value?.running) return;
    ipLoading.value = true;
    const found = await pve.guestIp(vmid);
    // The sheet may have moved on to another guest meanwhile.
    if (props.vmid === vmid) ip.value = found;
    ipLoading.value = false;
  },
  { immediate: true },
);

const memPct = computed(() => (guest.value ? percent(guest.value.memUsed, guest.value.memTotal) : 0));
const diskPct = computed(() =>
  guest.value?.diskUsed != null ? percent(guest.value.diskUsed, guest.value.diskTotal) : 0,
);
</script>

<template>
  <BottomSheet :open="vmid != null && !!guest" @close="emit('close')">
    <template v-if="guest">
      <div class="flex items-center gap-3 mb-3.5">
        <div class="size-[46px] rounded-[14px] bg-chip grid place-items-center text-accent shrink-0">
          <component :is="guest.type === 'lxc' ? Box : Monitor" :size="22" />
        </div>
        <div class="flex-1 min-w-0">
          <p class="text-xl font-bold -tracking-[0.01em] truncate">{{ guest.name }}</p>
          <p class="text-xs text-sub mt-0.5">
            {{ guest.type === "lxc" ? "Conteneur LXC" : "Machine virtuelle" }} · {{ guest.vmid }}
          </p>
        </div>
        <span
          class="text-[11.5px] font-bold px-2.5 py-1 rounded-lg shrink-0"
          :class="guest.running ? 'text-ok' : 'text-muted bg-chip'"
          :style="guest.running ? { background: 'color-mix(in srgb, var(--ok) 15%, transparent)' } : undefined"
        >
          ● {{ guest.running ? "En marche" : "Éteinte" }}
        </span>
      </div>

      <div class="grid grid-cols-2 gap-2.5">
        <div class="bg-surface-2 border border-border rounded-2xl px-3 py-2.5">
          <p class="text-[11px] text-muted font-semibold uppercase tracking-[0.08em]">CPU</p>
          <p class="text-[17px] font-bold mt-0.5">
            {{ guest.running ? `${guest.cpu}%` : "—" }}
            <span class="text-xs text-sub font-semibold">· {{ guest.cores }} cœurs</span>
          </p>
        </div>
        <div class="bg-surface-2 border border-border rounded-2xl px-3 py-2.5">
          <p class="text-[11px] text-muted font-semibold uppercase tracking-[0.08em]">Uptime</p>
          <p class="text-[17px] font-bold mt-0.5">{{ guest.running ? (formatDuration(guest.uptime) ?? "—") : "—" }}</p>
        </div>
        <div class="bg-surface-2 border border-border rounded-2xl px-3 py-2.5">
          <p class="text-[11px] text-muted font-semibold uppercase tracking-[0.08em]">Mémoire</p>
          <p class="text-[17px] font-bold mt-0.5">
            {{ guest.running ? (formatSize(guest.memUsed) ?? "0") : "—" }}
            <span class="text-xs text-sub font-semibold">/ {{ formatSize(guest.memTotal) ?? "—" }}</span>
          </p>
          <div v-if="guest.running" class="h-1 rounded bg-surface mt-1.5 overflow-hidden">
            <div class="h-full rounded" :style="{ width: memPct + '%', background: threshColor(memPct) }" />
          </div>
        </div>
        <div class="bg-surface-2 border border-border rounded-2xl px-3 py-2.5">
          <p class="text-[11px] text-muted font-semibold uppercase tracking-[0.08em]">Disque</p>
          <template v-if="guest.diskUsed != null">
            <p class="text-[17px] font-bold mt-0.5">
              {{ formatSize(guest.diskUsed) ?? "0" }}
              <span class="text-xs text-sub font-semibold">/ {{ formatSize(guest.diskTotal) ?? "—" }}</span>
            </p>
            <div class="h-1 rounded bg-surface mt-1.5 overflow-hidden">
              <div class="h-full rounded" :style="{ width: diskPct + '%', background: threshColor(diskPct) }" />
            </div>
          </template>
          <p v-else class="text-[17px] font-bold mt-0.5">
            {{ formatSize(guest.diskTotal) ?? "—" }} <span class="text-xs text-sub font-semibold">alloués</span>
          </p>
        </div>
        <div class="bg-surface-2 border border-border rounded-2xl px-3 py-2.5">
          <p class="text-[11px] text-muted font-semibold uppercase tracking-[0.08em]">Réseau ↓</p>
          <p class="text-[17px] font-bold mt-0.5">{{ rate ? formatRate(rate.rx) : "—" }}</p>
        </div>
        <div class="bg-surface-2 border border-border rounded-2xl px-3 py-2.5">
          <p class="text-[11px] text-muted font-semibold uppercase tracking-[0.08em]">Réseau ↑</p>
          <p class="text-[17px] font-bold mt-0.5">{{ rate ? formatRate(rate.tx) : "—" }}</p>
        </div>
        <div class="col-span-2 bg-surface-2 border border-border rounded-2xl px-3 py-2.5">
          <p class="text-[11px] text-muted font-semibold uppercase tracking-[0.08em]">Adresse IP</p>
          <p class="text-[15px] font-bold font-mono mt-0.5">{{ ipLoading ? "…" : (ip ?? "—") }}</p>
        </div>
      </div>

      <div v-if="guest.tags.length" class="flex gap-1.5 flex-wrap mt-3">
        <span
          v-for="t in guest.tags"
          :key="t"
          class="text-[11.5px] font-semibold px-2.5 py-1 rounded-[9px] bg-chip text-surface-text border border-border"
        >
          {{ t }}
        </span>
      </div>
    </template>
  </BottomSheet>
</template>
