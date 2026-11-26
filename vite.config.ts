import { defineConfig } from 'vite';

// Three.js ships as two big ES modules (core + WebGL renderer). Splitting them into
// their own long-cached vendor chunks keeps game-logic deploys tiny on Cloudflare Pages
// and keeps every chunk under Vite's 500 KB warning.
export default defineConfig({
  server: { port: 5180, strictPort: true },
  preview: { port: 5181, strictPort: true },
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'three-core', test: /node_modules[\\/]three[\\/]build[\\/]three\.core/, priority: 3 },
            { name: 'three-renderer', test: /node_modules[\\/]three[\\/]build[\\/]/, priority: 2 },
            { name: 'three-addons', test: /node_modules[\\/]three[\\/]examples[\\/]/, priority: 1 },
            // The world's walk-in places (Sphere, casinos, grand interiors) and the districts, split so
            // no chunk trips the 500 KB warning.
            { name: 'interiors', test: /src[\\/]world[\\/](sphere|grand|interior|casino|circus|mgm|nyny|via|cosmo|themed)/, priority: 1 },
            { name: 'signs', test: /src[\\/]world[\\/](signKit|stripSigns|westSigns|luckySign)/, priority: 1 },
            { name: 'districts', test: /src[\\/]world[\\/]/, priority: 0 },
          ],
        },
      },
    },
  },
});
