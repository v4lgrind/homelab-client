export const APP_NAME = "Homelab";

/** Keys used with @capacitor/preferences (secrets) and localStorage (theme). */
export const STORAGE_KEYS = {
  theme: "homelab_theme",
  autheliaUsername: "homelab_authelia_username",
  autheliaPassword: "homelab_authelia_password",
  serviceConfig: "homelab_service_config",
} as const;

export type ThemeMode = "auto" | "light" | "dark";
