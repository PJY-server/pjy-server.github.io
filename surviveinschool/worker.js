/**
 * SurviveInSchool NEIS proxy for Cloudflare Workers.
 * Add NEIS_API_KEY in Worker Settings > Variables and Secrets as a Secret.
 * Never put the actual key in this source file.
 */
const ALLOWED_ORIGINS = ["https://pjy-server.github.io"];
const ALLOWED_SERVICES = new Set([
  "schoolInfo", "mealServiceDietInfo", "elsTimetable",
  "misTimetable", "hisTimetable", "SchoolSchedule"
]);
export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const corsOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
    const cors = {
      "Access-Control-Allow-Origin": corsOrigin,
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Vary": "Origin"
    };
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (request.method !== "GET") return new Response("Method not allowed", { status: 405, headers: cors });
    if (!env.NEIS_API_KEY) return new Response("NEIS_API_KEY Secret is not configured", { status: 500, headers: cors });
    const incoming = new URL(request.url);
    const service = incoming.pathname.replace(/^\/hub\//, "");
    if (!ALLOWED_SERVICES.has(service)) return new Response("Service not allowed", { status: 404, headers: cors });
    const target = new URL("https://open.neis.go.kr/hub/" + service);
    for (const [key, value] of incoming.searchParams.entries()) {
      if (key.toUpperCase() !== "KEY") target.searchParams.set(key, value);
    }
    target.searchParams.set("KEY", env.NEIS_API_KEY);
    if (!target.searchParams.has("Type")) target.searchParams.set("Type", "json");
    try {
      const upstream = await fetch(target.toString(), { headers: { "Accept": "application/json" } });
      return new Response(await upstream.text(), {
        status: upstream.status,
        headers: { ...cors, "Content-Type": upstream.headers.get("Content-Type") || "application/json; charset=utf-8", "Cache-Control": "no-store" }
      });
    } catch {
      return new Response("Unable to reach NEIS API", { status: 502, headers: cors });
    }
  }
};
