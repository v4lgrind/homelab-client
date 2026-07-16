<script setup lang="ts">
import { computed } from "vue";
import { RouterLink } from "vue-router";
import { Bell } from "@lucide/vue";
import { useNotificationsStore } from "@/store/notifications-store";

const notif = useNotificationsStore();
const badge = computed(() => (notif.unreadCount > 99 ? "99+" : String(notif.unreadCount)));
</script>

<template>
  <RouterLink
    to="/notifications"
    class="relative size-10 rounded-[13px] bg-surface border border-border grid place-items-center text-sub active:scale-95 transition"
    aria-label="Notifications"
  >
    <Bell :size="19" />
    <span
      v-if="notif.unreadCount > 0"
      class="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-danger text-white text-[10px] font-extrabold grid place-items-center border-2 border-bg"
    >
      {{ badge }}
    </span>
  </RouterLink>
</template>
