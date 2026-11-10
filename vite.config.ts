import { defineConfig, type Connect, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApi, defaultDirs, UPSTREAMS } from './server/api.mjs';

// The Rebrickable API is proxied so the browser doesn't hit CORS; the user's own API key is sent as a header.
// Part pictures come through here too, same-origin so label drawing can read their pixels.
const proxy = Object.fromEntries(
  Object.entries(UPSTREAMS).map(([prefix, target]) => {
    const url = new URL(target);
    return [prefix, { target: url.origin, changeOrigin: true, rewrite: (p: string) => url.pathname + p.slice(prefix.length) }];
  }),
);

/** The project and photos API, so development works the same as `npm run serve` */
function brickStashApi(): Plugin {
  const api = createApi(defaultDirs());
  const middleware: Connect.NextHandleFunction = (req, res, next) => {
    api(req, res).then((handled) => {
      if (!handled) next();
    }, next);
  };
  return {
    name: 'brick-stash-api',
    configureServer: (server) => {
      server.middlewares.use(middleware);
      // The API is loaded once with the config, so a change to it only takes effect after a restart. Do that here,
      // or the page would update while the server carried on with the old code.
      const apiFile = fileURLToPath(new URL('./server/api.mjs', import.meta.url));
      server.watcher.add(apiFile);
      server.watcher.on('change', (file) => {
        if (path.resolve(file) === apiFile) void server.restart();
      });
    },
    configurePreviewServer: (server) => void server.middlewares.use(middleware),
  };
}

export default defineConfig({
  plugins: [react(), brickStashApi()],
  server: { proxy },
  preview: { proxy },
});
