<script setup lang="ts">
import { useRouter } from "vue-router";
import { ChevronLeft, CalendarDays } from "@lucide/vue";

const router = useRouter();
</script>

<template>
  <div class="min-h-dvh max-w-md mx-auto px-5 pt-14">
    <header class="flex items-center gap-2 mb-6">
      <button class="size-10 -ml-2 grid place-items-center text-sub active:scale-95 transition" aria-label="Retour" @click="router.back()">
        <ChevronLeft :size="24" />
      </button>
      <h1 class="text-2xl font-bold -tracking-[0.02em]">Calendrier</h1>
    </header>
    <div class="flex flex-col items-center text-center pt-20 gap-3 text-muted">
      <CalendarDays :size="34" />
      <p class="text-sm">Sorties à venir — bientôt.</p>
    </div>
  </div>
</template>
