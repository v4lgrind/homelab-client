import { createApp } from "vue";
import { createPinia } from "pinia";
import piniaPluginPersistedstate from "pinia-plugin-persistedstate";
import "@/assets/main.css";
import App from "./App.vue";
import router from "@/router";
import { useConnectionStore } from "@/store/connection-store";

async function bootstrap() {
  const pinia = createPinia();
  pinia.use(piniaPluginPersistedstate);

  const app = createApp(App).use(pinia).use(router);

  // Load API keys from secure storage before the first route guard runs.
  await useConnectionStore().loadSecrets();

  app.mount("#app");
}

bootstrap();
