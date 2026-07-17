import type { NewNotification, NotificationLevel } from "./types.js";

const LEVELS: NotificationLevel[] = ["info", "success", "warning", "error"];

function asLevel(v: unknown): NotificationLevel {
  const s = String(v ?? "").toLowerCase();
  if ((LEVELS as string[]).includes(s)) return s as NotificationLevel;
  // Common aliases sources use.
  if (s === "ok" || s === "up" || s === "resolved") return "success";
  if (s === "warn") return "warning";
  if (s === "down" || s === "fail" || s === "failed" || s === "critical") return "error";
  return "info";
}

function str(v: unknown): string | undefined {
  if (v == null) return undefined;
  const s = String(v).trim();
  return s.length ? s : undefined;
}

type Body = Record<string, unknown>;

/** Two-digit padded number, for SxxEyy. */
function pad(n: unknown): string {
  return String(n ?? 0).padStart(2, "0");
}

/**
 * Radarr and Sonarr share a webhook shape: an `eventType` plus nested objects
 * (`movie`/`series`, `release`, `movieFile`/`episodeFile`). Turn that into a
 * title (what) and a body (what happened).
 */
function parseArr(body: Body, kind: "radarr" | "sonarr"): NewNotification | undefined {
  const event = str(body.eventType);
  if (!event) return undefined;

  const source = str(body.instanceName) ?? (kind === "radarr" ? "Radarr" : "Sonarr");

  // Title: the media it concerns, else the instance (health/update events).
  let title = source;
  if (kind === "radarr") {
    const m = body.movie as Body | undefined;
    const mt = str(m?.title);
    if (mt) title = str(m?.year) ? `${mt} (${str(m?.year)})` : mt;
  } else {
    const s = body.series as Body | undefined;
    const st = str(s?.title);
    const eps = (Array.isArray(body.episodes) ? body.episodes : []) as Body[];
    if (st) {
      const ep = eps[0];
      title = ep ? `${st} — S${pad(ep.seasonNumber)}E${pad(ep.episodeNumber)}` : st;
    }
  }

  const quality =
    str((body.movieFile as Body | undefined)?.quality) ??
    str((body.episodeFile as Body | undefined)?.quality) ??
    str((body.release as Body | undefined)?.quality);

  let level: NotificationLevel = "info";
  let detail: string | undefined;

  switch (event) {
    case "Grab":
      level = "success";
      detail = ["Récupéré", quality, str((body.release as Body | undefined)?.indexer)]
        .filter(Boolean)
        .join(" · ");
      break;
    case "Download":
      level = "success";
      detail = [body.isUpgrade ? "Mise à niveau" : "Importé", quality].filter(Boolean).join(" · ");
      break;
    case "MovieAdded":
    case "SeriesAdd":
      level = "success";
      detail = "Ajouté à la bibliothèque";
      break;
    case "MovieDelete":
    case "SeriesDelete":
    case "MovieFileDelete":
    case "EpisodeFileDelete":
      level = "warning";
      detail = "Supprimé";
      break;
    case "Health":
      level = asLevel(body.level ?? "warning");
      detail = str(body.message) ?? "Problème de santé";
      break;
    case "HealthRestored":
      level = "success";
      detail = `Rétabli${str(body.message) ? ` : ${str(body.message)}` : ""}`;
      break;
    case "ApplicationUpdate":
      level = "info";
      detail =
        str(body.previousVersion) && str(body.newVersion)
          ? `Mise à jour ${str(body.previousVersion)} → ${str(body.newVersion)}`
          : (str(body.message) ?? "Mise à jour disponible");
      break;
    case "ManualInteractionRequired":
      level = "warning";
      detail = "Intervention manuelle requise";
      break;
    case "Test":
      level = "info";
      detail = "Notification de test";
      break;
    default:
      detail = str(body.message) ?? event;
  }

  return { source, type: kind, level, title, body: detail ?? null, ts: Date.now() };
}

/**
 * Uptime Kuma sends `{ heartbeat, monitor, msg }`. status 0 = down, 1 = up.
 */
function parseUptimeKuma(body: Body): NewNotification | undefined {
  const monitor = body.monitor as Body | undefined;
  const heartbeat = body.heartbeat as Body | undefined;
  if (!monitor && !heartbeat) return undefined;

  const status = Number(heartbeat?.status);
  const up = status === 1;
  const title = str(monitor?.name) ?? "Uptime Kuma";
  const detail = str(heartbeat?.msg) ?? str(body.msg) ?? (up ? "De nouveau en ligne" : "Hors ligne");

  return {
    source: "Uptime Kuma",
    type: "uptime-kuma",
    level: up ? "success" : "error",
    title,
    body: detail,
    ts: Date.now(),
  };
}

/** Best-effort generic parse for anything without a dedicated parser. */
function parseGeneric(body: Body, query: Body): NewNotification {
  const source = str(query.source) ?? str(body.source) ?? str(body.instanceName) ?? "generic";
  const type = str(query.type) ?? str(body.type) ?? null;
  const level = asLevel(query.level ?? body.level ?? body.severity ?? body.status);
  const title =
    str(body.title) ?? str(body.subject) ?? str(body.event) ?? str(body.message) ?? "Notification";
  const bodyText =
    str(body.body) ??
    str(body.description) ??
    (str(body.message) !== title ? str(body.message) : undefined) ??
    null;
  return { source, type, level, title, body: bodyText, ts: Date.now() };
}

/** Guess the source when the sender did not label it via `?type=`. */
function detectType(body: Body): string | undefined {
  if (body.heartbeat || body.monitor) return "uptime-kuma";
  if (body.eventType && body.series) return "sonarr";
  if (body.eventType && body.movie) return "radarr";
  if (body.eventType) return "radarr"; // *arr health/update events carry no media
  return undefined;
}

/**
 * Turn an incoming webhook into a storable notification. Dedicated parsers for
 * the sources the app is built around (Radarr, Sonarr, Uptime Kuma); everything
 * else falls back to a best-effort generic parse. The type is taken from the
 * query (`?type=`) when given, otherwise sniffed from the payload shape — so a
 * plain `hook/<token>` URL works without extra query params.
 */
export function normalize(body: Body, query: Body): NewNotification {
  const type = (str(query.type) ?? detectType(body))?.toLowerCase();

  let parsed: NewNotification | undefined;
  if (type === "radarr" || type === "sonarr") parsed = parseArr(body, type);
  else if (type === "uptime-kuma" || type === "uptimekuma" || type === "kuma") {
    parsed = parseUptimeKuma(body);
  }

  if (!parsed) return parseGeneric(body, query);

  // A query-provided source label still wins over the parser's guess.
  const source = str(query.source);
  return source ? { ...parsed, source } : parsed;
}
