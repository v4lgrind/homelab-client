<script setup lang="ts">
import { ArrowDownToLine } from "@lucide/vue";
import BottomNav from "@/components/BottomNav.vue";
</script>

<template>
  <div class="min-h-dvh pb-28 max-w-md mx-auto px-5 pt-14">
    <h1 class="text-[26px] font-bold -tracking-[0.02em] mb-8">Activité</h1>
    <div class="flex flex-col items-center text-center pt-20 gap-3 text-muted">
      <ArrowDownToLine :size="34" />
      <p class="text-sm">File de téléchargement — bientôt.</p>
    </div>
    <BottomNav />
  </div>
</template>
