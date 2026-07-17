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
let watchdog: ReturnType<typeof setInterval> | undefined;

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

  // Safety net for mobile flakiness (network changes, proxy idle drops): while
  // the app is in use, make sure the stream is alive. connect() is a no-op when
  // healthy; if it had died, this catches up and re-streams within the interval.
  watchdog = setInterval(() => {
    if (!notif.configured) return;
    if (!notif.connected) goLive();
  }, 20000);
});

onUnmounted(() => {
  stateListener?.remove();
  if (watchdog) clearInterval(watchdog);
  notif.disconnect();
});
</script>

<template>
  <RouterView />
  <ConfirmDialog />
</template>
