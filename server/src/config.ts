/**
 * Runtime configuration, read once from the environment.
 *
 * Two tokens keep the two directions apart:
 * - INGEST_TOKEN guards the webhook URL that services POST to. It sits in the
 *   path (`/hook/:token`) so it is a clean URL to paste into Radarr et al.
 * - APP_TOKEN is the bearer the app presents to read notifications.
 *
 * Per-source ingest tokens are a later refinement (Phase D); one shared ingest
 * token keeps first deployment simple.
 */
export interface Config {
  port: number;
  host: string;
  ingestToken: string;
  appToken: string;
  dbPath: string;
  /** How many notifications to keep; older ones are pruned. */
  retention: number;
}

function required(name: string): string {
  const v = process.env[name];
  if (!v || !v.trim()) {
    console.error(`Missing required env var ${name}`);
    process.exit(1);
  }
  return v.trim();
}

export function loadConfig(): Config {
  return {
    port: Number(process.env.HUB_PORT ?? 8787),
    host: process.env.HUB_HOST ?? "0.0.0.0",
    ingestToken: required("HUB_INGEST_TOKEN"),
    appToken: required("HUB_APP_TOKEN"),
    dbPath: process.env.HUB_DB_PATH ?? "./data/hub.db",
    retention: Number(process.env.HUB_RETENTION ?? 500),
  };
}
