// POST /api/token  { role: "host"|"listener", room, key? } -> { token, url }
// Host needs the DJ password and can publish; listeners can only subscribe.
const crypto = require("crypto");

const b64u = (b) => Buffer.from(b).toString("base64url");

function makeToken(env, identity, video, ttl = 3600, name) {
  const now = Math.floor(Date.now() / 1000);
  const h = b64u(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const p = b64u(JSON.stringify({ iss: env.LIVEKIT_API_KEY, sub: identity, nbf: now, exp: now + ttl, video, ...(name ? { name } : {}) }));
  const sig = crypto.createHmac("sha256", env.LIVEKIT_API_SECRET).update(h + "." + p).digest("base64url");
  return h + "." + p + "." + sig;
}

// Password check: exact match, no regex/format limits. Trim + NFC, drop invisible chars and one pair of wrapping quotes.
const norm = (s) => {
  let v = String(s == null ? "" : s).normalize("NFC").replace(/[\u200B-\u200F\u2060\uFEFF]/g, "").trim();
  if (v.length > 1 && /^(["\u0027\u201C\u2018]).*(["\u0027\u201D\u2019])$/.test(v)) v = v.slice(1, -1).trim();
  return v;
};
const sha = (v) => crypto.createHash("sha256").update(norm(v)).digest();
const samePassword = (a, b) => crypto.timingSafeEqual(sha(a), sha(b));

const httpUrl = (u) => u.replace(/^wss:/, "https:").replace(/^ws:/, "http:").replace(/\/+$/, "");

function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  try { return JSON.parse(req.body || "{}"); } catch { return {}; }
}

function guard(req, res) {
  if (req.method !== "POST") { res.status(405).json({ error: "POST only" }); return null; }
  const env = process.env;
  const missing = ["LIVEKIT_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET", "HOST_KEY"].filter((k) => !env[k]);
  if (missing.length) { res.status(500).json({ error: "Variables nqsin f Vercel: " + missing.join(", ") }); return null; }
  return { env, body: readBody(req) };
}

module.exports = async (req, res) => {
  const g = guard(req, res);
  if (!g) return;
  const { env, body } = g;
  const room = String(body.room || "radio");
  if (!/^[\w-]{1,40}$/.test(room)) return res.status(400).json({ error: "Smiyt radio machi s7i7a" });
  try {
    if (body.role === "allow") {
      // DJ accepts / hangs up a caller: changes that listener's permission directly on LiveKit Cloud.
      if (!samePassword(body.key, env.HOST_KEY)) return res.status(401).json({ error: "Mot de passe DJ ghalat" });
      const identity = String(body.identity || "");
      if (!/^[\w-]{1,64}$/.test(identity)) return res.status(400).json({ error: "identity machi s7i7a" });
      const t = makeToken(env, "dj-admin", { roomAdmin: true, room }, 60);
      const r = await fetch(httpUrl(env.LIVEKIT_URL) + "/twirp/livekit.RoomService/UpdateParticipant", {
        method: "POST",
        headers: { Authorization: "Bearer " + t, "Content-Type": "application/json" },
        body: JSON.stringify({ room, identity, permission: { canSubscribe: true, canPublish: !!body.allow, canPublishData: true } }),
      });
      if (!r.ok) return res.status(502).json({ error: "LiveKit UpdateParticipant " + r.status + " (sa7abek mazal f radio?)" });
      return res.status(200).json({ ok: true });
    }
    if (body.role === "host") {
      if (!samePassword(body.key, env.HOST_KEY)) return res.status(401).json({ error: "Mot de passe DJ ghalat" });
      const token = makeToken(env, "dj", { roomJoin: true, room, canPublish: true, canSubscribe: true, canPublishData: true }, 3600, "DJ");
      return res.status(200).json({ token, url: env.LIVEKIT_URL });
    }
    const id = "ls-" + crypto.randomUUID().slice(0, 8);
    const token = makeToken(env, id, { roomJoin: true, room, canPublish: false, canSubscribe: true, canPublishData: true }, 3600,
      String(body.name || "").replace(/[<>&"]/g, "").trim().slice(0, 20) || "ami");
    return res.status(200).json({ token, url: env.LIVEKIT_URL });
  } catch (e) {
    return res.status(502).json({ error: String((e && e.message) || e) });
  }
};
