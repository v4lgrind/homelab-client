<script setup lang="ts">
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { ChevronLeft } from "@lucide/vue";

const route = useRoute();
const router = useRouter();

const kind = computed(() => route.params.kind as string);
const id = computed(() => route.params.id as string);
</script>

<template>
  <div class="min-h-dvh max-w-md mx-auto px-5 pt-14">
    <header class="flex items-center gap-2 mb-6">
      <button class="size-10 -ml-2 grid place-items-center text-sub active:scale-95 transition" aria-label="Retour" @click="router.back()">
        <ChevronLeft :size="24" />
      </button>
      <h1 class="text-2xl font-bold -tracking-[0.02em]">Détail</h1>
    </header>
    <div class="text-center pt-20 text-muted text-sm">
      Fiche {{ kind === "movie" ? "film" : "série" }} #{{ id }} — bientôt.
    </div>
  </div>
</template>
