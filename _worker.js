// Cloudflare Pages (advanced mode) + LiveKit Cloud.
// Variables (Pages > Settings > Variables and secrets):
//   LIVEKIT_URL (wss://xxxx.livekit.cloud), LIVEKIT_API_KEY, LIVEKIT_API_SECRET, HOST_KEY
const json = (o, s = 200) => Response.json(o, { status: s });
const te = new TextEncoder();
const b64u = (buf) =>
  btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

async function makeToken(env, identity, video, ttl = 3600) {
  const now = Math.floor(Date.now() / 1000);
  const h = b64u(te.encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const p = b64u(te.encode(JSON.stringify({ iss: env.LIVEKIT_API_KEY, sub: identity, nbf: now, exp: now + ttl, video })));
  const key = await crypto.subtle.importKey("raw", te.encode(env.LIVEKIT_API_SECRET),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, te.encode(h + "." + p));
  return h + "." + p + "." + b64u(sig);
}

// Password check: exact match (no regex, no format limits). Both sides are trimmed and Unicode-normalized
// so a trailing space/newline saved in Cloudflare or iOS accents (NFC/NFD) cannot cause a false mismatch.
const norm = (s) => String(s ?? "").normalize("NFC").trim();
async function samePassword(a, b) {
  const [x, y] = await Promise.all([a, b].map(async (v) => new Uint8Array(await crypto.subtle.digest("SHA-256", te.encode(norm(v))))));
  let d = 0;
  for (let i = 0; i < x.length; i++) d |= x[i] ^ y[i];
  return d === 0;
}

const httpUrl = (u) => u.replace(/^wss:/, "https:").replace(/^ws:/, "http:").replace(/\/+$/, "");

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(req);
    if (req.method !== "POST") return json({ error: "POST only" }, 405);
    const missing = ["LIVEKIT_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET", "HOST_KEY"].filter((k) => !env[k]);
    if (missing.length) return json({ error: "Variables nqsin f Cloudflare: " + missing.join(", ") }, 500);
    const body = await req.json().catch(() => ({}));
    const hostOk = await samePassword(body.key, env.HOST_KEY);

    try {
      // Verifies the key/secret directly against LiveKit Cloud (server API call).
      if (url.pathname === "/api/check") {
        if (!hostOk) return json({ error: "Mot de passe DJ ghalat" }, 401);
        const t = await makeToken(env, "check", { roomList: true }, 60);
        const r = await fetch(httpUrl(env.LIVEKIT_URL) + "/twirp/livekit.RoomService/ListRooms", {
          method: "POST",
          headers: { Authorization: "Bearer " + t, "Content-Type": "application/json" },
          body: "{}",
        });
        if (r.status === 401 || r.status === 403)
          return json({ error: "LiveKit rfed l'API key/secret (" + r.status + "). T2akked mn LIVEKIT_API_KEY o LIVEKIT_API_SECRET." }, 401);
        if (!r.ok) return json({ error: "LiveKit a rje3 " + r.status + ". T2akked mn LIVEKIT_URL." }, 502);
        return json({ ok: true, host: new URL(httpUrl(env.LIVEKIT_URL)).host });
      }

      if (url.pathname === "/api/token") {
        const room = String(body.room || "radio");
        if (!/^[\w-]{1,40}$/.test(room)) return json({ error: "Smiyt radio machi s7i7a" }, 400);
        if (body.role === "host") {
          if (!hostOk) return json({ error: "Mot de passe DJ ghalat" }, 401);
          const token = await makeToken(env, "dj", { roomJoin: true, room, canPublish: true, canSubscribe: false, canPublishData: false });
          return json({ token, url: env.LIVEKIT_URL });
        }
        const id = "ls-" + crypto.randomUUID().slice(0, 8);
        const token = await makeToken(env, id, { roomJoin: true, room, canPublish: false, canSubscribe: true, canPublishData: false });
        return json({ token, url: env.LIVEKIT_URL });
      }
      return json({ error: "not found" }, 404);
    } catch (e) {
      return json({ error: String(e.message || e) }, 502);
    }
  },
};
