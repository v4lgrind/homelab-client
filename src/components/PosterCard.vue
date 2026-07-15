<script setup lang="ts">
import { Film, Tv, Check, AlertCircle } from "@lucide/vue";
import LazyImg from "@/components/LazyImg.vue";
import type { MediaItem } from "@/types/arr";

defineProps<{ item: MediaItem }>();
defineEmits<{ (e: "select", item: MediaItem): void }>();
</script>

<template>
  <button
    type="button"
    class="poster-card text-left active:scale-[0.97] transition"
    @click="$emit('select', item)"
  >
    <div class="relative rounded-[14px] overflow-hidden aspect-[2/3] shadow-[0_6px_16px_-8px_rgba(0,0,0,0.6)]">
      <LazyImg :src="item.poster" :alt="item.title" class="w-full h-full">
        <template #fallback>
          <component :is="item.kind === 'movie' ? Film : Tv" :size="30" />
        </template>
      </LazyImg>

      <!-- status badge — opaque on purpose: a backdrop-filter here would add one
           compositing layer per card across the whole grid. -->
      <span
        class="absolute top-1.5 right-1.5 size-5 rounded-[7px] grid place-items-center"
        :class="item.complete ? 'bg-ok text-black' : 'bg-danger text-white'"
      >
        <component :is="item.complete ? Check : AlertCircle" :size="12" :stroke-width="item.complete ? 3 : 2.4" />
      </span>

      <!-- gradient + meta -->
      <div class="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/85 to-transparent">
        <p class="text-[11.5px] font-bold leading-[1.15] text-white line-clamp-2 [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]">
          {{ item.title }}
        </p>
        <p class="text-[10px] text-white/70 mt-0.5">
          {{ item.subtitle ?? item.year }}
        </p>
      </div>
    </div>
  </button>
</template>

<style scoped>
/* The library grid renders every item (no virtualisation), so off-screen cards
   still cost layout + paint on the main thread. content-visibility lets the
   engine skip that work until a card approaches the viewport; the `auto`
   intrinsic size keeps the last measured height so the scrollbar stays stable. */
.poster-card {
  content-visibility: auto;
  contain-intrinsic-size: auto 165px;
}
</style>
