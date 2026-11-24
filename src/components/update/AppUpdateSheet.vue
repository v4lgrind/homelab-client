<script setup lang="ts">
import { computed } from "vue";
import BottomSheet from "@/components/BottomSheet.vue";
import AppUpdateAction from "@/components/update/AppUpdateAction.vue";
import { useAppUpdateStore } from "@/store/app-update-store";
import { formatSize } from "@/lib/format";

const store = useAppUpdateStore();
const details = computed(() =>
  [`Homelab ${store.update?.version ?? ""}`, formatSize(store.update?.size)].filter(Boolean).join(" · "),
);

/** Closing the sheet = "Plus tard" (not while downloading). */
function close() {
  if (store.status !== "downloading") store.dismiss();
}
</script>

<template>
  <BottomSheet :open="store.shouldPrompt" @close="close">
    <h2 class="text-xl font-bold -tracking-[0.01em] px-1">Mise à jour disponible</h2>
    <p class="text-[13px] text-muted mt-1 mb-4 px-1">{{ details }}</p>

    <template v-if="store.update?.notes.length && store.status !== 'downloading'">
      <p class="text-xs font-semibold tracking-[0.12em] uppercase text-muted mb-2 px-1">Nouveautés</p>
      <ul class="list-disc pl-5 mb-5 text-sm text-sub leading-relaxed">
        <li v-for="note in store.update.notes" :key="note">{{ note }}</li>
      </ul>
    </template>

    <AppUpdateAction />
    <button
      v-if="store.status !== 'downloading'"
      type="button"
      class="w-full mt-3.5 text-sm font-semibold text-muted"
      @click="close"
    >
      Plus tard
    </button>
  </BottomSheet>
</template>
