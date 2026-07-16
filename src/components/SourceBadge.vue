<script setup lang="ts">
import { computed } from "vue";
import ServiceLogo from "@/components/ServiceLogo.vue";
import type { ServiceId } from "@/types/service";

const props = withDefaults(defineProps<{ source: string; size?: number }>(), { size: 38 });

/** Reuse a real service logo when the source is one we know. */
function toServiceId(source: string): ServiceId | null {
  const s = source.toLowerCase();
  if (s.includes("radarr")) return "radarr";
  if (s.includes("sonarr")) return "sonarr";
  if (s.includes("qbit")) return "qbittorrent";
  if (s.includes("jellyfin")) return "jellyfin";
  if (s.includes("plex")) return "plex";
  if (s.includes("glance")) return "glances";
  return null;
}

const serviceId = computed(() => toServiceId(props.source));

/** Deterministic hue per source, so an unknown source keeps a stable colour. */
const fallbackHue = computed(() => {
  let h = 0;
  for (const ch of props.source) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
});
const initial = computed(() => props.source.trim().charAt(0).toUpperCase() || "?");
</script>

<template>
  <ServiceLogo v-if="serviceId" :id="serviceId" :size="size" />
  <div
    v-else
    class="rounded-xl grid place-items-center shrink-0 font-bold text-white"
    :style="{
      width: `${size}px`,
      height: `${size}px`,
      fontSize: `${Math.round(size * 0.42)}px`,
      background: `hsl(${fallbackHue} 52% 46%)`,
    }"
  >
    {{ initial }}
  </div>
</template>
