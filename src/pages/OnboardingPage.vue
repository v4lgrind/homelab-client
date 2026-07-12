<script setup lang="ts">
import { computed } from "vue";
import { useRouter } from "vue-router";
import { Globe, ShieldCheck, ArrowRight } from "@lucide/vue";
import BrandHeader from "@/components/BrandHeader.vue";
import ServiceCard from "@/components/ServiceCard.vue";
import { SERVICES } from "@/constants";
import { useConnectionStore } from "@/store/connection-store";

const conn = useConnectionStore();
const router = useRouter();

const rootDomain = computed({
  get: () => conn.rootDomain,
  set: (v: string) => conn.setRootDomain(v),
});

function finish() {
  if (conn.isConfigured) router.push({ name: "home" });
}
</script>

<template>
  <main class="min-h-dvh px-[22px] pt-14 pb-10 max-w-md mx-auto">
    <BrandHeader class="mb-6" />

    <h1 class="text-[27px] font-bold -tracking-[0.02em] mb-1.5">Configuration</h1>
    <p class="text-sm text-sub leading-snug mb-5">
      Renseigne ton domaine et connecte tes services. Chaque appli est protégée par sa clé API.
    </p>

    <!-- Serveur -->
    <section class="rounded-[22px] bg-surface border border-border p-4 mb-3.5">
      <p class="flex items-center gap-2 text-xs font-semibold tracking-[0.12em] uppercase text-muted mb-3">
        <Globe :size="14" /> Serveur
      </p>
      <label class="block text-[12.5px] font-semibold text-sub mb-1.5 ml-1">Domaine racine</label>
      <div class="flex items-center gap-2 h-[50px] rounded-[14px] bg-field border border-field-border px-3">
        <span class="text-[15px] text-muted">https://</span>
        <input
          v-model="rootDomain"
          class="flex-1 min-w-0 bg-transparent outline-none text-[15px]"
          placeholder="mondomaine.com"
          autocapitalize="none"
          autocorrect="off"
          spellcheck="false"
          inputmode="url"
        />
      </div>
    </section>

    <!-- Services -->
    <div class="flex flex-col gap-3">
      <ServiceCard v-for="s in SERVICES" :key="s.id" :id="s.id" />
    </div>

    <!-- note -->
    <p class="flex items-start gap-2 text-xs text-muted mt-4 mx-1 leading-snug">
      <ShieldCheck :size="15" class="shrink-0 mt-px" />
      <span>
        Clés stockées chiffrées sur l'appareil. Nécessite la règle bypass Authelia sur
        <code class="font-mono">/api</code>.
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
