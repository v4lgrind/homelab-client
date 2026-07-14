<script setup lang="ts">
import { APP_NAME } from "@/constants";
</script>

<template>
  <div class="flex items-center gap-3">
    <div
      class="size-11 rounded-[14px] grid place-items-center shrink-0"
      style="
        background: linear-gradient(150deg, #3aa0ff, #1560d0);
        box-shadow: 0 8px 22px -8px var(--accent);
      "
    >
      <!-- Hub glyph — matches the app launcher icon -->
      <svg width="27" height="27" viewBox="0 0 96 96" fill="none" aria-hidden="true">
        <g stroke="#fff" stroke-width="6" stroke-linecap="round" opacity="0.92">
          <line x1="48" y1="48" x2="32" y2="32" /><line x1="48" y1="48" x2="64" y2="32" />
          <line x1="48" y1="48" x2="32" y2="64" /><line x1="48" y1="48" x2="64" y2="64" />
        </g>
        <g fill="#fff">
          <circle cx="32" cy="32" r="8" /><circle cx="64" cy="32" r="8" />
          <circle cx="32" cy="64" r="8" /><circle cx="64" cy="64" r="8" />
        </g>
        <circle cx="48" cy="48" r="12.5" fill="#fff" />
        <circle cx="48" cy="48" r="5.5" fill="#1f78e6" />
      </svg>
    </div>
    <div>
      <p class="font-bold text-[17px] leading-tight -tracking-[0.01em]">{{ APP_NAME }}</p>
      <p class="text-[11px] font-medium tracking-[0.14em] uppercase text-muted">Console</p>
    </div>
  </div>
</template>
