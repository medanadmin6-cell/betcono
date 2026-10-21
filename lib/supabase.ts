import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-only Supabase client, using the service-role key. This key bypasses
 * row-level security, so it must never reach the browser: every read and write
 * in this app happens inside a route handler or a server component.
 *
 * Returns null when the environment is not configured, so the fixture feed can
 * still degrade to upstream-only rather than failing outright.
 */
let cached: SupabaseClient | null | undefined;

export function db(): SupabaseClient | null {
  if (cached !== undefined) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    console.warn("[supabase] not configured — database features are disabled");
    cached = null;
    return cached;
  }

  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      // An unresponsive database must read as "Supabase unavailable", not hang
      // the route: every caller already degrades on error, but supabase-js has
      // no timeout of its own, so a stuck Postgres froze every DB-touching
      // route for minutes. Five seconds is far above any healthy query here.
      fetch: async (input, init) => {
        try {
          return await fetch(input, { ...init, signal: AbortSignal.timeout(5000) });
        } catch (err) {
          // Resolve instead of rethrowing: a rejected fetch is retried with
          // backoff upstream, which turned one stuck query into ~40 seconds.
          console.error("[supabase] request failed, degrading:", String(err).slice(0, 100));
          // 408/5xx get retried too, so answer with a non-retryable 4xx. The
          // callers only check `error`, never the status code.
          return new Response(
            JSON.stringify({ message: "Supabase unreachable (client timeout)" }),
            { status: 400, headers: { "Content-Type": "application/json" } },
          );
        }
      },
    },
  });
  return cached;
}

/** Same client, but throws where the caller genuinely cannot proceed without it. */
export function dbOrThrow(): SupabaseClient {
  const client = db();
  if (!client) throw new Error("Database is not configured");
  return client;
}
