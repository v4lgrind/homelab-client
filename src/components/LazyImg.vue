<script setup lang="ts">
import { ref, watch } from "vue";

const props = defineProps<{ src?: string; alt?: string }>();

const loaded = ref(false);
const errored = ref(false);

watch(
  () => props.src,
  () => {
    loaded.value = false;
    errored.value = false;
  },
);
</script>

<template>
  <div class="relative overflow-hidden bg-surface-2">
    <img
      v-if="src && !errored"
      :src="src"
      :alt="alt"
      loading="lazy"
      decoding="async"
      class="w-full h-full object-cover transition-opacity duration-300"
      :class="loaded ? 'opacity-100' : 'opacity-0'"
      @load="loaded = true"
      @error="errored = true"
    />
    <div
      v-if="!src || errored"
      class="absolute inset-0 grid place-items-center text-muted"
    >
      <slot name="fallback" />
    </div>
  </div>
</template>
