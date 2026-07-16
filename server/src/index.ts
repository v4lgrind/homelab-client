import Fastify from "fastify";
import { loadConfig } from "./config.js";
import { Store } from "./db.js";
import { normalize } from "./normalize.js";

const config = loadConfig();
const store = new Store(config.dbPath, config.retention);

const app = Fastify({ logger: { level: process.env.HUB_LOG_LEVEL ?? "info" } });

// Webhook senders are all over the place with Content-Type (JSON, text,
// form-encoded, none at all). Rather than 415 on anything but application/json,
// accept every content type: parse as a string, try JSON, else treat the whole
// body as the message. Fastify's built-in application/json parser still handles
// the common case; this catch-all covers the rest.
app.addContentTypeParser("*", { parseAs: "string" }, (_req, body, done) => {
  const text = (body as string).trim();
  if (!text) return done(null, {});
  try {
    done(null, JSON.parse(text));
  } catch {
    done(null, { message: text });
  }
});

/** Constant-time-ish bearer check for the app-facing API. */
function isApp(auth: string | undefined): boolean {
  if (!auth) return false;
  const m = /^Bearer\s+(.+)$/i.exec(auth);
  return m?.[1] === config.appToken;
}

app.get("/api/health", async () => ({ ok: true }));

/**
 * Webhook sink. The ingest token is in the path so the whole URL can be pasted
 * straight into a service's webhook field. Source/type/level come from the
 * query string or the body (see normalize).
 */
app.post<{ Params: { token: string } }>("/hook/:token", async (req, reply) => {
  if (req.params.token !== config.ingestToken) {
    return reply.code(401).send({ error: "invalid ingest token" });
  }
  const body = (req.body ?? {}) as Record<string, unknown>;
  const query = (req.query ?? {}) as Record<string, unknown>;
  const n = store.insert(normalize(body, query));
  req.log.info({ id: n.id, source: n.source, level: n.level }, "notification stored");
  return reply.code(201).send({ id: n.id });
});

/** App-facing list. `since` returns only rows newer than an id already held. */
app.get<{ Querystring: { since?: string; limit?: string } }>(
  "/api/notifications",
  async (req, reply) => {
    if (!isApp(req.headers.authorization)) {
      return reply.code(401).send({ error: "unauthorized" });
    }
    const sinceId = req.query.since != null ? Number(req.query.since) : undefined;
    const limit = req.query.limit != null ? Number(req.query.limit) : undefined;
    const notifications = store.list({
      sinceId: Number.isFinite(sinceId) ? sinceId : undefined,
      limit: Number.isFinite(limit) ? limit : undefined,
    });
    return { notifications };
  },
);

app
  .listen({ port: config.port, host: config.host })
  .then((addr) => app.log.info(`homelab-hub listening on ${addr}`))
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
