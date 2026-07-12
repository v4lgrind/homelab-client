<script setup lang="ts">
import { Server } from "@lucide/vue";
import { APP_NAME } from "@/constants";
</script>

<template>
  <div class="flex items-center gap-3">
    <div
      class="size-11 rounded-[14px] grid place-items-center text-white shrink-0"
      style="
        background: linear-gradient(150deg, var(--accent), color-mix(in srgb, var(--accent) 55%, #7c3aed));
        box-shadow: 0 8px 22px -8px var(--accent);
      "
    >
      <Server :size="24" />
    </div>
    <div>
      <p class="font-bold text-[17px] leading-tight -tracking-[0.01em]">{{ APP_NAME }}</p>
      <p class="text-[11px] font-medium tracking-[0.14em] uppercase text-muted">Console</p>
    </div>
  </div>
</template>
