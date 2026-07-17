import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import type { Router } from "vue-router";
import { onHubNotification } from "@/store/notifications-store";

let started = false;

/**
 * Raise an Android notification for each notification that arrives live over
 * SSE. No-op in the browser (device plugin) and if the user declines the
 * permission — live in-app updates still work regardless.
 *
 * These fire only while the app is in the foreground, since the SSE stream is
 * dropped on background (a backgrounded app gets no network). Delivery while the
 * app is closed needs background sync / push — a later phase.
 */
export async function setupNativeNotifications(router: Router): Promise<void> {
  if (!Capacitor.isNativePlatform() || started) return;
  started = true;

  const perm = await LocalNotifications.checkPermissions();
  if (perm.display !== "granted") {
    const req = await LocalNotifications.requestPermissions();
    if (req.display !== "granted") return;
  }

  // Tapping a notification opens the notification centre.
  await LocalNotifications.addListener("localNotificationActionPerformed", () => {
    router.push("/notifications");
  });

  onHubNotification((n) => {
    // Don't buzz the user about something they are already looking at.
    if (router.currentRoute.value.name === "notifications") return;
    void LocalNotifications.schedule({
      notifications: [
        {
          id: n.id,
          title: n.title,
          body: n.body ? `${n.source} · ${n.body}` : n.source,
        },
      ],
    }).catch(() => {
      /* scheduling can fail (e.g. permission revoked mid-session) — ignore */
    });
  });
}
