<script setup lang="ts">
defineProps<{ open: boolean; title?: string }>();
const emit = defineEmits<{ (e: "close"): void }>();
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="opacity-0"
      leave-active-class="transition duration-150 ease-in"
      leave-to-class="opacity-0"
    >
      <div v-if="open" class="fixed inset-0 z-50" @click.self="emit('close')">
        <div class="absolute inset-0 bg-black/50" @click="emit('close')" />
        <div
          class="absolute inset-x-0 bottom-0 max-w-md mx-auto bg-surface rounded-t-[26px] border-t border-border px-5 pt-3 pb-9"
        >
          <div class="w-10 h-1 rounded-full bg-border mx-auto mb-4" />
          <p v-if="title" class="text-xs font-semibold tracking-[0.12em] uppercase text-muted mb-2 px-1">
            {{ title }}
          </p>
          <slot />
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
