# BizPlan AI

Vite frontend and Express backend for Indonesian business planning with Gemini API.

## Local
- Node.js 20+
- npm install
- Copy server/.env.example to server/.env and set GEMINI_API_KEY.
- npm run dev; frontend http://localhost:5173, backend http://localhost:5000.

## Deploy
### Render backend (repository root)
- Build: npm ci --workspace=server --omit=dev
- Start: npm run start --workspace=server
- Env: NODE_ENV=production, CLIENT_URL=https://<vercel-domain>, GEMINI_API_KEY=<new-secret>, GEMINI_MODEL=gemini-flash-latest (optional). Render sets PORT. Health: /api/health.

### Vercel frontend
- Root directory: client; preset Vite; build: npm run build; output: dist.
- Set VITE_API_URL=https://<render-domain> for Production/Preview, without /api. Allow the Vercel origin in Render CLIENT_URL.

VITE_API_URL is public configuration, never a secret. Keep GEMINI_API_KEY on the backend only. CORS allows only configured CLIENT_URL origins. See render.yaml, client/vercel.json and the .env.example files.

## Tests
- npm run build
- npm test

Features include idea research, competitor/supplier tracking, CSV import, unit economics, simulations, reports, and AI chat. Market data is not scraped; validate all assumptions.
