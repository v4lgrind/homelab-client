import Database from "better-sqlite3";
import { EventEmitter } from "node:events";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { NewNotification, Notification } from "./types.js";

/**
 * SQLite-backed history. Extends EventEmitter so the SSE endpoint can subscribe:
 * every insert emits a "notification" event with the stored row.
 */
export class Store extends EventEmitter {
  private readonly db: Database.Database;
  private readonly retention: number;

  constructor(dbPath: string, retention: number) {
    super();
    // One listener per connected SSE client; allow plenty.
    this.setMaxListeners(0);
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    // WAL keeps reads (the app) from blocking writes (webhooks) and vice versa.
    this.db.pragma("journal_mode = WAL");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS notifications (
        id     INTEGER PRIMARY KEY AUTOINCREMENT,
        source TEXT    NOT NULL,
        type   TEXT,
        level  TEXT    NOT NULL DEFAULT 'info',
        title  TEXT    NOT NULL,
        body   TEXT,
        ts     INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_notifications_id ON notifications(id);
    `);
    this.retention = retention;
  }

  insert(n: NewNotification): Notification {
    const info = this.db
      .prepare("INSERT INTO notifications (source, type, level, title, body, ts) VALUES (?, ?, ?, ?, ?, ?)")
      .run(n.source, n.type, n.level, n.title, n.body, n.ts);
    this.prune();
    const stored: Notification = { id: Number(info.lastInsertRowid), ...n };
    this.emit("notification", stored);
    return stored;
  }

  /**
   * Most recent notifications, newest first. `sinceId` returns only rows newer
   * than an id the client already has, so the app can poll incrementally.
   */
  list(opts: { sinceId?: number; limit?: number } = {}): Notification[] {
    const limit = Math.min(Math.max(opts.limit ?? 100, 1), 500);
    if (opts.sinceId != null) {
      return this.db
        .prepare("SELECT * FROM notifications WHERE id > ? ORDER BY id DESC LIMIT ?")
        .all(opts.sinceId, limit) as Notification[];
    }
    return this.db
      .prepare("SELECT * FROM notifications ORDER BY id DESC LIMIT ?")
      .all(limit) as Notification[];
  }

  /** Keep the newest `retention` rows; drop the rest. */
  private prune(): void {
    this.db
      .prepare(
        "DELETE FROM notifications WHERE id <= (SELECT id FROM notifications ORDER BY id DESC LIMIT 1 OFFSET ?)",
      )
      .run(this.retention);
  }
}
