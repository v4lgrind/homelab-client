<script setup lang="ts">
import { computed } from "vue";
import { Film, Pause } from "@lucide/vue";
import LazyImg from "@/components/LazyImg.vue";
import ServiceLogo from "@/components/ServiceLogo.vue";
import { formatBitrate, formatClock } from "@/lib/format";
import type { MediaSession } from "@/types/media";

const props = defineProps<{ session: MediaSession }>();

const SERVER_NAMES = { jellyfin: "Jellyfin", plex: "Plex" } as const;

const serverColor = computed(() => `var(--${props.session.server})`);
const serverName = computed(() => SERVER_NAMES[props.session.server]);

const progress = computed(() => {
  const { positionMs, durationMs } = props.session;
  if (!durationMs) return 0;
  return Math.min(100, Math.max(0, (positionMs / durationMs) * 100));
});

/** The subtitle line carries the "why", so append the transcode target to it. */
const detail = computed(() => {
  const parts = [props.session.subtitle];
  if (props.session.paused) parts.push("En pause");
  else if (props.session.transcodeDetail) parts.push(`vers ${props.session.transcodeDetail}`);
  return parts.filter(Boolean).join(" · ");
});

const bitrate = computed(() => formatBitrate(props.session.bitrateKbps));
</script>

<template>
  <div
    class="flex gap-3 bg-surface border border-border rounded-[18px] p-3 session-card"
    :class="{ 'opacity-60': session.paused }"
  >
    <div class="relative w-[68px] h-[102px] rounded-[10px] overflow-hidden shrink-0">
      <LazyImg :src="session.posterUrl" :alt="session.title" class="w-full h-full rounded-[10px]">
        <template #fallback><Film :size="20" /></template>
      </LazyImg>
      <!-- Server accent, so a glance attributes the stream without reading. -->
      <span class="absolute inset-x-0 bottom-0 h-[3px]" :style="{ background: serverColor }" />
    </div>

    <div class="flex-1 min-w-0">
      <!-- Logo and name both: the mark alone assumes you know it, and the name
           alone is a wall of text to scan. Colour stays the scanning aid it is
           good at being — Plex's yellow is unreadable as text on a light card. -->
      <div class="flex items-center gap-1.5 mb-0.5 min-w-0">
        <ServiceLogo :id="session.server" :size="14" />
        <span class="text-[10.5px] font-bold text-surface-text shrink-0">{{ serverName }}</span>
        <span class="text-[10.5px] font-bold text-muted truncate">
          {{ session.user }} · {{ session.device }}
        </span>
      </div>

      <p class="text-[13.5px] font-bold leading-tight truncate">{{ session.title }}</p>
      <p v-if="detail" class="text-[11px] text-muted mt-px truncate">{{ detail }}</p>

      <div class="h-1 rounded bg-chip my-2 overflow-hidden">
        <div
          class="h-full rounded"
          :style="{
            width: progress + '%',
            background: session.paused ? 'var(--muted)' : 'var(--accent)',
          }"
        />
      </div>

      <div class="flex items-center gap-1.5 flex-wrap">
        <span
          v-if="session.paused"
          class="text-[9.5px] font-bold px-1.5 py-0.5 rounded-[5px] text-muted bg-chip flex items-center gap-1"
        >
          <Pause :size="9" :fill="'currentColor'" :stroke-width="0" />En pause
        </span>
        <span
          v-else-if="session.transcoding"
          class="text-[9.5px] font-bold px-1.5 py-0.5 rounded-[5px] text-warn"
          style="background: color-mix(in srgb, var(--warn) 15%, transparent)"
        >
          Transcodage
        </span>
        <span
          v-else
          class="text-[9.5px] font-bold px-1.5 py-0.5 rounded-[5px] text-ok"
          style="background: color-mix(in srgb, var(--ok) 15%, transparent)"
        >
          Direct Play
        </span>

        <span
          v-if="bitrate"
          class="text-[9.5px] font-bold px-1.5 py-0.5 rounded-[5px] text-muted bg-chip"
        >
          {{ bitrate }}
        </span>

        <span class="text-[10px] text-muted font-semibold ml-auto whitespace-nowrap">
          {{ formatClock(session.positionMs) }} / {{ formatClock(session.durationMs) }}
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Same trick as PosterCard: skip layout/paint for cards scrolled out of view. */
.session-card {
  content-visibility: auto;
  contain-intrinsic-size: auto 126px;
}
</style>
