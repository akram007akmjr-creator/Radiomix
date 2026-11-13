# Radio DJ on Vercel + LiveKit
- public/index.html  -> listeners  (/?r=radio)
- public/dj.html     -> DJ studio  (/dj.html)
- api/check.js, api/token.js -> serverless functions
Env vars (Vercel > Project > Settings > Environment Variables), then redeploy:
LIVEKIT_URL (wss://xxx.livekit.cloud), LIVEKIT_API_KEY, LIVEKIT_API_SECRET, HOST_KEY
