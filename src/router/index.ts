import { createRouter, createWebHistory } from "vue-router";
import { useConnectionStore } from "@/store/connection-store";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: "/",
      name: "home",
      component: () => import("@/pages/HomePage.vue"),
    },
    {
      path: "/onboarding",
      name: "onboarding",
      component: () => import("@/pages/OnboardingPage.vue"),
      meta: { public: true },
    },
    {
      path: "/settings",
      name: "settings",
      component: () => import("@/pages/SettingsPage.vue"),
    },
    { path: "/:pathMatch(.*)*", redirect: "/" },
  ],
});

// Gate the app behind onboarding until at least one service is configured.
router.beforeEach((to) => {
  const conn = useConnectionStore();
  if (!to.meta.public && !conn.isConfigured) {
    return { name: "onboarding" };
  }
  if (to.name === "onboarding" && conn.isConfigured) {
    return { name: "home" };
  }
  return true;
});

export default router;
