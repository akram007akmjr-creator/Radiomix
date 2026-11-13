// Cloudflare Pages "advanced mode" worker: serves the pages + small API for the SFU (no storage needed).
const SFU = "https://rtc.live.cloudflare.com/v1/apps/";
const json = (o, s = 200) => Response.json(o, { status: s });

async function sfu(env, path, method, body) {
  const r = await fetch(SFU + env.SFU_APP_ID + path, {
    method,
    headers: { Authorization: "Bearer " + env.SFU_APP_SECRET, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const t = await r.text();
  let j; try { j = JSON.parse(t); } catch { j = { raw: t }; }
  if (!r.ok) throw new Error("SFU " + r.status + ": " + t.slice(0, 300));
  if (j.errorCode) throw new Error("SFU: " + (j.errorDescription || j.errorCode));
  return j;
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(req);
    if (req.method !== "POST") return json({ error: "POST only" }, 405);
    if (!env.SFU_APP_ID || !env.SFU_APP_SECRET) return json({ error: "SFU_APP_ID / SFU_APP_SECRET machi mdkhlin f Settings" }, 500);
    const body = await req.json().catch(() => ({}));
    try {
      if (url.pathname === "/api/host/start" || url.pathname === "/api/host/stop") {
        const key = req.headers.get("x-host-key") || body.key;
        if (!env.HOST_KEY || key !== env.HOST_KEY) return json({ error: "Mot de passe ghalat (wla HOST_KEY machi mdkhel)" }, 401);
        if (url.pathname.endsWith("stop")) return json({ ok: true });
        const { sessionId } = await sfu(env, "/sessions/new", "POST");
        const r = await sfu(env, `/sessions/${sessionId}/tracks/new`, "POST", {
          sessionDescription: { type: "offer", sdp: body.sdp },
          tracks: [{ location: "local", mid: String(body.mid), trackName: "mix" }],
        });
        return json({ sessionId, sessionDescription: r.sessionDescription });
      }
      if (url.pathname === "/api/listen") {
        if (!/^[a-f0-9]{16,64}$/i.test(body.s || "")) return json({ error: "Lien machi s7i7" }, 400);
        const { sessionId } = await sfu(env, "/sessions/new", "POST");
        const r = await sfu(env, `/sessions/${sessionId}/tracks/new`, "POST", {
          tracks: [{ location: "remote", sessionId: body.s, trackName: "mix" }],
        });
        return json({ sessionId, sessionDescription: r.sessionDescription });
      }
      if (url.pathname === "/api/renegotiate") {
        await sfu(env, `/sessions/${body.sessionId}/renegotiate`, "PUT", {
          sessionDescription: { type: "answer", sdp: body.sdp },
        });
        return json({ ok: true });
      }
      return json({ error: "not found" }, 404);
    } catch (e) {
      return json({ error: String(e.message || e) }, 502);
    }
  },
};
