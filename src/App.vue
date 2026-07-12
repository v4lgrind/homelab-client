<script setup lang="ts">
import { RouterView } from "vue-router";
// Theme is initialised on import (applies [data-theme] to <html>).
import "@/composables/useTheme";
</script>

<template>
  <RouterView />
</template>
