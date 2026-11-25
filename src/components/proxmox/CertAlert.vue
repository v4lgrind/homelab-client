<script setup lang="ts">
import { useRouter } from "vue-router";
import { ShieldAlert } from "@lucide/vue";
import { useProxmoxStore } from "@/store/proxmox-store";
import { shortFingerprint } from "@/lib/format";

const pve = useProxmoxStore();
const router = useRouter();
</script>

<template>
  <div
    v-if="pve.certMismatch"
    class="rounded-[22px] border p-4"
    style="
      background: color-mix(in srgb, var(--danger) 9%, var(--surface));
      border-color: color-mix(in srgb, var(--danger) 35%, transparent);
    "
  >
    <div class="flex items-center gap-2 text-danger mb-2">
      <ShieldAlert :size="22" class="shrink-0" />
      <h3 class="text-lg font-bold -tracking-[0.01em] text-text">Certificat changé</h3>
    </div>
    <p class="text-[13px] text-sub leading-relaxed mb-3.5">
      Proxmox présente un certificat différent de celui mémorisé. C'est normal après une réinstallation ou un
      renouvellement du certificat. Sinon, quelqu'un intercepte peut-être la connexion : ne fais pas confiance.
    </p>
    <div class="flex flex-col gap-1 bg-field border border-field-border rounded-xl px-3 py-2 mb-2">
      <span class="text-[11px] text-muted font-semibold uppercase tracking-[0.08em]">Mémorisé</span>
      <span class="font-mono text-[12.5px] text-surface-text break-all">{{ shortFingerprint(pve.certMismatch.expected) }}</span>
    </div>
    <div class="flex flex-col gap-1 bg-field border border-field-border rounded-xl px-3 py-2">
      <span class="text-[11px] text-muted font-semibold uppercase tracking-[0.08em]">Reçu</span>
      <span class="font-mono text-[12.5px] text-danger break-all">{{ shortFingerprint(pve.certMismatch.received) }}</span>
    </div>
    <div class="flex gap-2 mt-3.5 flex-wrap">
      <button
        type="button"
        class="px-3.5 py-2 rounded-xl text-[12.5px] font-semibold text-danger active:scale-95 transition"
        style="background: color-mix(in srgb, var(--danger) 14%, transparent)"
        @click="pve.trustNewCert()"
      >
        Faire confiance au nouveau
      </button>
      <button
        type="button"
        class="px-3.5 py-2 rounded-xl bg-chip text-surface-text text-[12.5px] font-semibold border border-border active:scale-95 transition"
        @click="router.push('/settings')"
      >
        Réglages
      </button>
    </div>
  </div>
</template>
