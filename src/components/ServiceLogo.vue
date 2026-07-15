<script setup lang="ts">
import { computed, type Component } from "vue";
import type { ServiceId } from "@/types/service";
import RadarrLogo from "@/components/logos/RadarrLogo.vue";
import SonarrLogo from "@/components/logos/SonarrLogo.vue";
import QbittorrentLogo from "@/components/logos/QbittorrentLogo.vue";
import GlancesLogo from "@/components/logos/GlancesLogo.vue";
import JellyfinLogo from "@/components/logos/JellyfinLogo.vue";
import PlexLogo from "@/components/logos/PlexLogo.vue";

const props = withDefaults(defineProps<{ id: ServiceId; size?: number }>(), { size: 40 });

const LOGOS: Record<ServiceId, Component> = {
  radarr: RadarrLogo,
  sonarr: SonarrLogo,
  qbittorrent: QbittorrentLogo,
  glances: GlancesLogo,
  jellyfin: JellyfinLogo,
  plex: PlexLogo,
};

const logo = computed(() => LOGOS[props.id]);
/** Mark inset, so the tile reads as an app icon rather than a cropped sticker. */
const inner = computed(() => Math.round(props.size * 0.6));
</script>

<template>
  <!--
    Every mark sits on the same fixed dark tile, in both themes.

    These are app icons, drawn to sit on a neutral background, and each one loses
    a part against the wrong one: on white, Sonarr's #eee disc and Glances' light
    greys vanish; on dark, only Radarr's near-black swoosh does. Dark loses the
    least and matches the rest of the app. The tile does not follow the theme,
    because the logos' own colours do not either.
  -->
  <div
    class="rounded-xl grid place-items-center shrink-0"
    :style="{ width: `${size}px`, height: `${size}px`, background: 'var(--logo-tile)' }"
  >
    <component :is="logo" :style="{ width: `${inner}px`, height: `${inner}px` }" />
  </div>
</template>
