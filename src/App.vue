<script setup lang="ts">
import { RouterView } from "vue-router";
// Theme is initialised on import (applies [data-theme] to <html>).
import "@/composables/useTheme";
import ConfirmDialog from "@/components/ConfirmDialog.vue";
</script>

<template>
  <RouterView />
  <ConfirmDialog />
</template>
