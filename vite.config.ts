/// <reference types="vitest/config" />
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * Runs api/chat.ts on the dev server, so /api/chat works locally like on Vercel.
 * The API key comes from .env.local (never committed).
 */
function devApi(): Plugin {
  return {
    name: 'dev-api',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/api/chat', async (req, res) => {
        try {
          const mod = (await server.ssrLoadModule('/api/chat.ts')) as { default: { fetch: (r: Request) => Promise<Response> } };
          const chunks: Buffer[] = [];
          for await (const c of req) chunks.push(c as Buffer);
          const headers = new Headers();
          for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
          const request = new Request(`http://${req.headers.host}/api/chat`, {
            method: req.method,
            headers,
            ...(req.method === 'POST' ? { body: Buffer.concat(chunks) } : {}),
          });
          const response = await mod.default.fetch(request);
          res.statusCode = response.status;
          response.headers.forEach((v, k) => res.setHeader(k, v));
          if (!response.body) return void res.end();
          const reader = response.body.getReader();
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            res.write(value);
          }
          res.end();
        } catch (err) {
          server.config.logger.error(`dev-api: ${(err as Error).message}`);
          res.statusCode = 500;
          res.end('{"error":"dev server error"}');
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  // Make ANTHROPIC_API_KEY / CHAT_ENABLED from .env.local visible to the dev function (server side only).
  const env = loadEnv(mode, process.cwd(), '');
  for (const k of ['ANTHROPIC_API_KEY', 'CHAT_ENABLED']) if (env[k] && !process.env[k]) process.env[k] = env[k];

  return {
    plugins: [react(), tailwindcss(), devApi()],
    test: {
      environment: 'node',
      include: ['src/**/*.test.ts'],
    },
  };
});
