export type NotificationLevel = "info" | "success" | "warning" | "error";

/** A notification as served by the hub. `ts` is epoch milliseconds. */
export interface HubNotification {
  id: number;
  source: string;
  type: string | null;
  level: NotificationLevel;
  title: string;
  body: string | null;
  ts: number;
}
