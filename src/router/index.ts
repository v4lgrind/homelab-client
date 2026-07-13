import { createRouter, createWebHistory } from "vue-router";
import { useConnectionStore } from "@/store/connection-store";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: "/",
      name: "library",
      component: () => import("@/pages/LibraryPage.vue"),
    },
    {
      path: "/:kind(movie|series)/:id",
      name: "detail",
      component: () => import("@/pages/DetailPage.vue"),
    },
    {
      path: "/:kind(movie|series)/:id/search",
      name: "search-releases",
      component: () => import("@/pages/InteractiveSearchPage.vue"),
    },
    {
      path: "/search",
      name: "search",
      component: () => import("@/pages/SearchPage.vue"),
    },
    {
      path: "/activity",
      name: "activity",
      component: () => import("@/pages/ActivityPage.vue"),
    },
    {
      path: "/stats",
      name: "stats",
      component: () => import("@/pages/StatsPage.vue"),
    },
    {
      path: "/calendar",
      name: "calendar",
      component: () => import("@/pages/CalendarPage.vue"),
    },
    {
      path: "/settings",
      name: "settings",
      component: () => import("@/pages/SettingsPage.vue"),
    },
    {
      path: "/onboarding",
      name: "onboarding",
      component: () => import("@/pages/OnboardingPage.vue"),
      meta: { public: true },
    },
    { path: "/:pathMatch(.*)*", redirect: "/" },
  ],
});

// Gate the app behind onboarding until at least one service is configured.
// The guard is async so the very first navigation waits for the API keys to be
// loaded from secure storage before deciding (otherwise it would wrongly bounce
// a configured user to onboarding on a cold start).
router.beforeEach(async (to) => {
  const conn = useConnectionStore();
  if (!conn.secretsLoaded) {
    try {
      await conn.loadSecrets();
    } catch {
      /* treat as unconfigured */
    }
  }
  if (!to.meta.public && !conn.isConfigured) {
    return { name: "onboarding" };
  }
  if (to.name === "onboarding" && conn.isConfigured) {
    return { name: "library" };
  }
  return true;
});

export default router;
