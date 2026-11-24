<script setup lang="ts">
import { useRouter } from "vue-router";
import { ShieldCheck, ArrowRight } from "@lucide/vue";
import BrandHeader from "@/components/BrandHeader.vue";
import ServiceCard from "@/components/ServiceCard.vue";
import { SERVICES } from "@/constants";
import { useConnectionStore } from "@/store/connection-store";

const conn = useConnectionStore();
const router = useRouter();

function finish() {
  if (conn.isConfigured) router.push({ name: "library" });
}
</script>

<template>
  <main class="min-h-dvh px-[22px] pt-safe pb-10 max-w-md mx-auto">
    <BrandHeader class="mb-6" />

    <h1 class="text-[27px] font-bold -tracking-[0.02em] mb-1.5">Configuration</h1>
    <p class="text-sm text-sub leading-snug mb-5">
      Renseigne l'adresse de chaque service et connecte-le. Chaque appli est protégée par sa clé API.
    </p>


    <!-- Services -->
    <div class="flex flex-col gap-3">
      <ServiceCard v-for="s in SERVICES" :key="s.id" :id="s.id" />
    </div>

    <!-- note -->
    <p class="flex items-start gap-2 text-xs text-muted mt-4 mx-1 leading-snug">
      <ShieldCheck :size="15" class="shrink-0 mt-px" />
      <span>
        Clés stockées chiffrées sur l'appareil. Hors de chez toi, active le VPN pour
        joindre les adresses locales.
      </span>
    </p>

    <!-- CTA -->
    <button
      type="button"
      :disabled="!conn.isConfigured"
      class="w-full h-[54px] mt-5 rounded-2xl bg-accent text-accent-ink font-bold text-base flex items-center justify-center gap-2 active:scale-[0.98] transition disabled:opacity-40 disabled:active:scale-100"
      style="box-shadow: 0 10px 26px -12px var(--accent)"
      @click="finish"
    >
      Accéder au dashboard
      <ArrowRight :size="18" :stroke-width="2.4" />
    </button>
  </main>
</template>
