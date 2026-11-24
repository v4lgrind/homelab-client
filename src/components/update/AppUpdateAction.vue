<script setup lang="ts">
import { computed } from "vue";
import { Download, LoaderCircle } from "@lucide/vue";
import { useAppUpdateStore } from "@/store/app-update-store";

const ERRORS: Record<string, string> = {
  check_failed: "Impossible de vérifier les mises à jour. Réessaie plus tard.",
  download_failed: "Le téléchargement a échoué. Réessaie.",
  invalid_apk: "Le fichier téléchargé est invalide.",
  wrong_package: "Le fichier téléchargé n'est pas Homelab : mise à jour refusée.",
  not_newer: "Cette version est déjà installée.",
  insecure_url: "Adresse de téléchargement refusée (https obligatoire).",
};

const store = useAppUpdateStore();
const percent = computed(() => Math.round(store.progress * 100));
const error = computed(() => (store.error ? (ERRORS[store.error] ?? ERRORS.download_failed) : null));
const label = computed(() => {
  if (store.status === "installing") return "Installation…";
  if (store.status === "error") return "Réessayer";
  return "Mettre à jour";
});
</script>

<template>
  <div class="flex flex-col gap-2">
    <div v-if="store.status === 'downloading'" class="flex flex-col gap-2">
      <div
        class="h-2 overflow-hidden rounded-full bg-field border border-field-border"
        role="progressbar"
        :aria-valuenow="percent"
        aria-valuemin="0"
        aria-valuemax="100"
      >
        <div class="h-full rounded-full bg-accent transition-[width] duration-200" :style="{ width: `${percent}%` }" />
      </div>
      <div class="flex items-center justify-between text-[12.5px] text-muted">
        <span>Téléchargement… {{ percent }} %</span>
        <button type="button" class="font-semibold" @click="store.cancel()">Annuler</button>
      </div>
      <p class="text-xs text-muted leading-snug mt-1">
        Ensuite, Android te demande de confirmer l'installation. Tes réglages sont conservés.
      </p>
    </div>
    <button
      v-else
      type="button"
      class="w-full h-[52px] rounded-2xl bg-accent text-accent-ink font-bold text-[15px] flex items-center justify-center gap-2 active:scale-[0.98] transition disabled:opacity-60"
      :disabled="store.status === 'installing'"
      @click="store.startUpdate()"
    >
      <LoaderCircle v-if="store.status === 'installing'" :size="18" class="animate-spin" />
      <Download v-else :size="18" />
      {{ label }}
    </button>
    <p v-if="store.status === 'needsPermission'" class="text-xs text-muted leading-snug">
      Autorise Homelab à installer des applis, puis reviens ici : la mise à jour reprend toute seule.
    </p>
    <p v-if="error" class="text-xs text-danger leading-snug" role="alert">{{ error }}</p>
  </div>
</template>
