// GET https://lexxbridge.app/api/health — for uptime monitors.
//
// 200 {"status":"ok"} when the web app is serving AND Supabase's auth
// service and database both answer; 503 {"status":"down"} naming what
// failed otherwise. The web app itself being up is implied: this function
// is deployed alongside it on Vercel.
//
// Uses only the public anon key (already shipped in the web bundle). The
// database check reads one row of `posts` as an anonymous visitor: Row
// Level Security returns an empty list, but only after Postgres has
// actually run the query — so a 200 proves the database is answering,
// without exposing any data.

const TIMEOUT_MS = 5000;

type Check = { ok: boolean; ms: number; error?: string };

async function check(url: string, apiKey: string): Promise<Check> {
  const started = Date.now();
  try {
    const res = await fetch(url, { headers: { apikey: apiKey }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    return res.ok ? { ok: true, ms: Date.now() - started } : { ok: false, ms: Date.now() - started, error: `HTTP ${res.status}` };
  } catch (err) {
    return { ok: false, ms: Date.now() - started, error: err instanceof Error && err.name === "TimeoutError" ? "timed out" : "unreachable" };
  }
}

export async function GET(): Promise<Response> {
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  const headers = { "Cache-Control": "no-store" };

  if (!supabaseUrl || !anonKey) {
    return Response.json({ status: "down", error: "Supabase settings missing on the server" }, { status: 503, headers });
  }

  const [auth, database] = await Promise.all([
    check(`${supabaseUrl}/auth/v1/health`, anonKey),
    check(`${supabaseUrl}/rest/v1/posts?select=id&limit=1`, anonKey),
  ]);
  const ok = auth.ok && database.ok;

  return Response.json(
    {
      status: ok ? "ok" : "down",
      checks: { auth, database },
      version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
      time: new Date().toISOString(),
    },
    { status: ok ? 200 : 503, headers },
  );
}
