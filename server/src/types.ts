export type NotificationLevel = "info" | "success" | "warning" | "error";

/** A notification as stored and served. `ts` is epoch milliseconds. */
export interface Notification {
  id: number;
  source: string;
  type: string | null;
  level: NotificationLevel;
  title: string;
  body: string | null;
  ts: number;
}

/** A normalised notification before it has an id (ready to insert). */
export type NewNotification = Omit<Notification, "id">;
