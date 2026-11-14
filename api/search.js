// POST /api/search { key, q } -> first embeddable YouTube result (needs YOUTUBE_API_KEY). Only the DJ can use it.
const crypto = require("crypto");

const b64u = (b) => Buffer.from(b).toString("base64url");

function makeToken(env, identity, video, ttl = 3600) {
  const now = Math.floor(Date.now() / 1000);
  const h = b64u(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const p = b64u(JSON.stringify({ iss: env.LIVEKIT_API_KEY, sub: identity, nbf: now, exp: now + ttl, video }));
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

const unesc = (t) => String(t || "").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">");
module.exports = async (req, res) => {
  const g = guard(req, res);
  if (!g) return;
  const { env, body } = g;
  if (!samePassword(body.key, env.HOST_KEY)) return res.status(401).json({ error: "Mot de passe DJ ghalat" });
  if (!env.YOUTUBE_API_KEY) return res.status(501).json({ error: "YOUTUBE_API_KEY machi mdkhel f Vercel" });
  const q = String(body.q || "").slice(0, 100).trim();
  if (!q) return res.status(400).json({ error: "Smiya khawya" });
  try {
    const u = "https://www.googleapis.com/youtube/v3/search?" + new URLSearchParams({ part: "snippet", type: "video", videoEmbeddable: "true", maxResults: "1", q, key: env.YOUTUBE_API_KEY });
    const r = await fetch(u);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return res.status(502).json({ error: "YouTube API: " + ((j.error && j.error.message) || r.status) });
    const it = j.items && j.items[0];
    if (!it || !it.id || !it.id.videoId) return res.status(404).json({ error: "Ma l9it 7ta natija" });
    return res.status(200).json({ id: it.id.videoId, title: unesc(it.snippet && it.snippet.title) });
  } catch (e) {
    return res.status(502).json({ error: String((e && e.message) || e) });
  }
};
