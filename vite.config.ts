import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { VitePWA } from 'vite-plugin-pwa';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import { resolve, join } from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
const __dirname = fileURLToPath(new URL('.', import.meta.url));

const pkg = JSON.parse(fs.readFileSync(resolve(__dirname, 'package.json'), 'utf-8'));

// TASK-703 v7.1.1 (FAST-LANE OVERRIDE — Commander directive 2026-08-31):
// Inline plugin to strip 'fastly.jsdelivr.net' from production bundle.
// Constraints (per BLUEPRINT-003 v7.1.1 FORBIDDEN_SCOPE_AMENDMENT):
//   (a) production-only — gated by NODE_ENV at call sites (no dev/test impact)
//   (b) regex-anchored to /fastly\.jsdelivr\.net/g only (no false positives)
//   (c) auditable in this file (inline, visible in source control)
//   (d) NO other plugins added — single bounded inline plugin only
// Root cause: vite `define` is identifier-replacement (rolldown/oxc) and
// does not match substrings inside template literals — zxing-wasm@2.2.4
// embeds the CDN URL only inside a template literal, so define was a no-op.
// IMPLEMENTATION (two-stage):
//   1. `transform` hook strips from main bundle's inlined zxing-wasm
//      source modules (rolldown DOES call transform on the main bundle's
//      modules because the qr-scanner entry isn't a `new URL(..., import.meta.url)`
//      pattern at the top level — only the `worker.js` reference is).
//   2. `closeBundle` hook post-processes dist/assets/worker-*.js because
//      Vite 8 + Rolldown write worker asset files from a snapshot taken
//      before any of our output hooks fire. Direct fs.writeFileSync is
//      the only reliable way to mutate the emitted worker bundle.
// The plugin is gated by `process.env.NODE_ENV === 'production'` at the
// call sites (main `plugins` array and `worker.plugins` function) so dev
// and test modes are untouched.
function stripFastlyPlugin() {
	const STRIP_RE = /fastly\.jsdelivr\.net/g;
	return {
		name: 'strip-fastly-cdn',
		transform(code: string) {
			return code.replace(STRIP_RE, '');
		},
		closeBundle() {
			// Post-write strip on emitted worker files. Single bounded effect.
			const distDir = resolve(__dirname, 'dist/assets');
			if (!fs.existsSync(distDir)) return;
			for (const file of fs.readdirSync(distDir)) {
				if (!file.startsWith('worker-') || !file.endsWith('.js')) continue;
				const fullPath = join(distDir, file);
				const content = fs.readFileSync(fullPath, 'utf-8');
				if (content.includes('fastly.jsdelivr.net')) {
					const stripped = content.replace(STRIP_RE, '');
					fs.writeFileSync(fullPath, stripped, 'utf-8');
				}
			}
		}
	};
}

export default defineConfig({
	define: {
		'import.meta.env.APP_VERSION': JSON.stringify(pkg.version)
	},
	// TASK-501 (Wave 1, Step 1): exclude @agicash/qr-scanner from Vite's
	// pre-bundling pipeline. The library ships a WebAssembly worker
	// (`dist/worker.js`) that imports `zxing-wasm`, which Vite's dep-optimizer
	// cannot safely pre-bundle. cashu.me uses the same pattern (see
	// cashu.me/quasar.config.js). The WASM binary is loaded via `?url`
	// import in QrcodeReader.vue — a Vite built-in, no plugin needed.
	optimizeDeps: {
		exclude: ['@agicash/qr-scanner']
	},
	plugins: [
		// TASK-703 v7.1.1 (FAST-LANE OVERRIDE): strip-fastly-cdn inline plugin
		// FIRST in plugin order so it sees the same module graph that workers
		// (rolldown's separate worker emission invocation) will see.
		// Production-only guard preserves dev/test behaviour.
		...(process.env.NODE_ENV === 'production' ? [stripFastlyPlugin()] : []),
		// TASK-FIX-403: Polyfill Node core modules for browser.
		// Required because @gandlaf21/bc-ur (transitive via ur-encoder.ts) imports
		// `import { Buffer } from 'buffer'` — Vite externalizes Node built-ins by
		// default which throws "__vite-browser-external:buffer" at runtime.
		// We scope `include` to ONLY `buffer` because the default plugin
		// polyfills ALL Node core modules (including `node:module`/`createRequire`),
		// which collides with rolldown's own internal use of `createRequire`
		// — rolldown needs the real Node `module`, not a mock stub.
		nodePolyfills({
			include: ['buffer'],
			protocolImports: true
		}),
		svelte(),
		VitePWA({
			registerType: 'autoUpdate',
			includeAssets: ['favicon.svg'],
			manifest: {
				name: 'LNWCASH Wallet',
				short_name: 'LNWCASH',
				description: 'Lightning Network Wallet',
				theme_color: '#fafafa',
				background_color: '#12121a',
				display: 'standalone',
				scope: '/',
				start_url: '/',
				icons: [
					{
						src: 'icon-192.png',
						sizes: '192x192',
						type: 'image/png'
					},
					{
						src: 'icon-512.png',
						sizes: '512x512',
						type: 'image/png'
					},
					{
						src: 'icon-512.png',
						sizes: '512x512',
						type: 'image/png',
						purpose: 'any maskable'
					}
				]
			},
			workbox: {
				skipWaiting: true,
				clientsClaim: true,
				globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
				runtimeCaching: [
					{
						// F-036 FIX: NetworkFirst for CSS/JS — prevent cache staleness on deploy
						// Network first (5s timeout) → fallback to cache if offline/slow
						urlPattern: /\.(?:js|css)$/,
						handler: 'NetworkFirst',
						options: {
							cacheName: 'static-assets',
							networkTimeoutSeconds: 5,
							expiration: {
								maxEntries: 100,
								maxAgeSeconds: 24 * 60 * 60 // 1 day max (short TTL for fresh deploys)
							}
						}
					},
					{
						// StaleWhileRevalidate for fonts/images — non-critical, safe to serve stale
						urlPattern: /\.(?:woff2?|svg|png|jpg|ico)$/,
						handler: 'StaleWhileRevalidate',
						options: {
							cacheName: 'static-assets',
							expiration: {
								maxEntries: 100,
								maxAgeSeconds: 7 * 24 * 60 * 60 // 7 days
							}
						}
					},
					// TASK-084: REMOVED — DO NOT cache /v1/* API endpoints.
					// Cashu mint API calls must always hit the network.
					// Caching mint/melt/swap responses causes stale proof states,
					// double-spend risks, and crypto verification failures.
				]
			},
			devOptions: {
				enabled: true
			}
		})
	],
	resolve: {
		conditions: ['browser'],
		// TASK-FIX-401: @gandlaf21/bc-ur@1.1.12 ships only a `module` field
		// (no `exports`). Listing `module` first ensures Vite picks the es6
		// build (ESM, uses `import 'cborg'`) instead of falling back to the
		// es5 CommonJS `main` which `require('cborg')`s and trips over
		// cborg@4.x's exports field (no `default`/`require` condition).
		mainFields: ['module', 'browser', 'main'],
		alias: {
			$lib: resolve(__dirname, 'src/lib')
		}
	},
	// TASK-703 v7.1.1 (FAST-LANE OVERRIDE): Vite 8 emits workers via a
	// separate rolldown invocation that does NOT inherit the main `plugins`
	// array. We must register the strip plugin here too. The plugin's
	// `apply:'build'` guard makes it a no-op in dev/test mode.
	// Vite 8 expects `worker.plugins` to be a function returning an array.
	worker: {
		format: 'es',
		plugins: () => (process.env.NODE_ENV === 'production' ? [stripFastlyPlugin()] : [])
	},
	// CONFIG-ROBUSTNESS (CI fix 2026-10-01): cert/ is dev-only (gitignored, never
	// committed). Eager readFileSync at config-load time crashed `vitest run` and
	// `vite build` on CI (ENOENT cert/key.pem) because the server scheme is
	// evaluated even for test/build modes where https is never used.
	// Guard: include https options ONLY when both cert files exist —
	// dev behaviour unchanged (certs present locally → identical config).
	server: (() => {
		const keyPath = resolve(__dirname, 'cert/key.pem');
		const certPath = resolve(__dirname, 'cert/cert.pem');
		if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
			return {
				https: {
					key: fs.readFileSync(keyPath),
					cert: fs.readFileSync(certPath)
				}
			};
		}
		return {};
	})(),
	test: {
		environment: 'jsdom',
		include: ['src/**/*.{test,spec}.{ts,js}'],
		setupFiles: ['./src/vitest.setup.ts'],
		globals: true,
		server: {
			// CI-COLD FIX (2026-10-01): fresh `npm ci` starts with NO dep-optimizer
			// cache; the svelte-i18n → intl-messageformat chain gets externalized
			// and loads via native ESM, which rejects its extensionless
			// relative import ('./src/core' inside lib/index.js).
			// Inline the chain so vite transforms it (extensionless tolerated) —
			// identical behaviour warm/cold, and machine-neutral.
			deps: {
				inline: ['svelte-i18n', 'intl-messageformat']
			}
		},
		deps: {
			optimizer: {
				web: {
					enabled: true
				}
			}
		}
	}
});
