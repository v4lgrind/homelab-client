<script setup lang="ts">
import { useConfirmState } from "@/composables/useConfirm";

const { state, accept, cancel } = useConfirmState();
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition duration-150 ease-out"
      enter-from-class="opacity-0"
      leave-active-class="transition duration-100 ease-in"
      leave-to-class="opacity-0"
    >
      <div v-if="state.open" class="fixed inset-0 z-[60] flex items-center justify-center px-8">
        <div class="absolute inset-0 bg-black/55" @click="cancel" />
        <Transition
          enter-active-class="transition duration-150 ease-out"
          enter-from-class="opacity-0 scale-95"
          appear
        >
          <div
            v-if="state.open"
            class="relative w-full max-w-[340px] bg-surface border border-border rounded-3xl p-6 text-center shadow-2xl"
            role="alertdialog"
            aria-modal="true"
          >
            <p class="text-[17px] font-bold leading-snug">{{ state.title }}</p>
            <p v-if="state.message" class="text-[13.5px] text-sub mt-2 leading-relaxed whitespace-pre-line">
              {{ state.message }}
            </p>

            <div class="flex flex-col gap-2.5 mt-6">
              <button
                type="button"
                class="h-12 rounded-2xl font-bold text-[15px] active:scale-[0.98] transition"
                :class="state.danger ? 'text-white' : 'bg-accent text-accent-ink'"
                :style="state.danger ? { background: 'var(--danger)' } : undefined"
                @click="accept"
              >
                {{ state.confirmText }}
              </button>
              <button
                v-if="state.cancelText"
                type="button"
                class="h-12 rounded-2xl font-semibold text-[15px] bg-chip text-surface-text border border-border active:scale-[0.98] transition"
                @click="cancel"
              >
                {{ state.cancelText }}
              </button>
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>
