import type { Database } from "bun:sqlite";
import { Hono } from "hono";
import { createDatabase } from "./db";
import { createFlashSaleRoutes } from "./routes/flash-sale";
import { createWebhookRoutes } from "./routes/webhooks";

export function createApp(db: Database): Hono {
  const app = new Hono();

  app.get("/health", (c) => c.json({ ok: true }));
  app.route("/api", createFlashSaleRoutes(db));
  app.route("/api", createWebhookRoutes(db));

  return app;
}

let app: Hono | null = null;

function getApp(): Hono {
  if (app === null) {
    app = createApp(createDatabase().db);
  }

  return app;
}

// The database is opened on the first request so importing this module in a test
// does not create a local.db file as a side effect.
export default {
  fetch(request: Request) {
    return getApp().fetch(request);
  },
};
