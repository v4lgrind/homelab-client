<script setup lang="ts">
import { onMounted, onUnmounted } from "vue";
import { RouterView, useRouter } from "vue-router";
import { App as CapApp } from "@capacitor/app";
import type { PluginListenerHandle } from "@capacitor/core";
// Theme is initialised on import (applies [data-theme] to <html>).
import "@/composables/useTheme";
import ConfirmDialog from "@/components/ConfirmDialog.vue";
import { useNotificationsStore } from "@/store/notifications-store";
import { setupNativeNotifications } from "@/services/native-notifications";

const notif = useNotificationsStore();
const router = useRouter();
let stateListener: PluginListenerHandle | undefined;

async function goLive() {
  if (!notif.tokenLoaded) await notif.loadToken();
  if (!notif.configured) return;
  // Catch up on anything missed while disconnected, then stream live.
  await notif.fetch();
  notif.connect();
}

onMounted(() => {
  // Raise Android notifications for notifications arriving live (device only).
  setupNativeNotifications(router);
  goLive();
  // A backgrounded app gets no network on Android, so drop the stream when it
  // leaves the foreground and re-establish (with a catch-up fetch) on return.
  CapApp.addListener("appStateChange", ({ isActive }) => {
    if (isActive) goLive();
    else notif.disconnect();
  }).then((h) => (stateListener = h));
});

onUnmounted(() => {
  stateListener?.remove();
  notif.disconnect();
});
</script>

<template>
  <RouterView />
  <ConfirmDialog />
</template>
