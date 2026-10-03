import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { VitePWA } from 'vite-plugin-pwa';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import { createHash } from 'node:crypto';
import { resolve, join } from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
const __dirname = fileURLToPath(new URL('.', import.meta.url));

const pkg = JSON.parse(fs.readFileSync(resolve(__dirname, 'package.json'), 'utf-8'));

// TASK-703 v7.2 (2026-10-02 — INTENT-010 fast lane, Commander Option A):
// Inline plugin — zxing-wasm CDN base → self-hosted same-origin path.
// v7.1.1 stripped 'fastly.jsdelivr.net' to an empty string, which mutated the
// bundled fallback URL into `https:///npm/zxing-wasm@...` (invalid host) and
// the worker's wasm fetch died: "Failed to load 'https://npm/zxing-wasm@...'".
// Root context: QrScanner.configureWasm() sets overrides in the MAIN thread,
// but wasm loading happens INSIDE the worker, which uses its own bundled
// default locateFile (the fastly URL) — main-thread overrides never reach it.
// Pre-CI era worked because the VPS served without a restrictive CSP, so the
// intact fastly URL fetched fine. Under Cloudflare Pages + CSP connect-src
// 'self', only same-origin loads survive — so we complete the ORIGINAL
// TASK-703 intent (no third-party CDN) properly:
//   1. rewrite `https://fastly.jsdelivr.net/npm/zxing-wasm@X.Y.Z/dist/` →
//      `/assets/zxing-wasm/` (same-origin, CSP 'self' passes)
//   2. closeBundle copies the real wasm binary from node_modules into
//      dist/assets/zxing-wasm/reader/zxing_reader.wasm
//   3. legacy STRIP_RE kept as safety net for any other fastly reference
// INTENT-011 (2026-10-03, TASK-WRK-01 — worker rename fast lane):
//   Vite 8 + Rolldown name the worker file from a PRE-rewrite content
//   snapshot. After step 1 mutates dist/assets/worker-*.js, the filename no
//   longer matches the content it holds → cache poisoning (real incident
//   INTENT-010: immutable edge + browser cache served a stale worker for a
//   year). Fix: after rewriting, rename the file to a hash of its FINAL
//   content and patch every reference to the old name across dist.
//   Hash scheme — sha256(utf8(finalContent)) → base64url (RFC 4648 §5,
//   unpadded) → first 8 ASCII chars → `worker-<hash>.js`. Deterministic:
//   same content → same name on every build/machine. Rolldown's own chunk
//   hash (xxhash-rust/xxh3 per symbols in @rolldown/binding-linux-x64-gnu
//   1.1.5, hashCharacters default 'base64') was NOT re-implemented: the
//   exact hasher input buffer (chunk content + internal metadata) is not
//   unambiguously recoverable from the shipped node_modules artifacts, and
//   guessing would break reproducibility. Files whose content was NOT
//   rewritten keep their original name — it still matches their content.
// Constraints (per BLUEPRINT-003 v7.1.1 FORBIDDEN_SCOPE_AMENDMENT, unchanged):
//   (a) production-only — gated by NODE_ENV at call sites (no dev/test impact)
//   (b) regex-anchored to the zxing-wasm CDN base + fastly host (no false positives)
//   (c) auditable in this file (inline, visible in source control)
//   (d) NO other plugins added — single bounded inline plugin only
function stripFastlyPlugin() {
	// Rewrite the full zxing-wasm CDN base (host + package + version + /dist/)
	// to a same-origin self-hosted path. Anchored so other URLs never match.
	const CDN_BASE_RE = /https:\/\/fastly\.jsdelivr\.net\/npm\/zxing-wasm@\d+\.\d+\.\d+\/dist\//g;
	const SELFHOST_BASE = '/assets/zxing-wasm/';
	// v7.1.1 safety net: any remaining fastly host reference gets dropped.
	const LEGACY_STRIP_RE = /fastly\.jsdelivr\.net/g;
	// INTENT-011: deterministic content hash for post-rewrite file naming.
	// sha256(utf8(content)) → base64url (RFC 4648 §5, unpadded) → first 8
	// ASCII chars. 8 chars keeps the existing name style (`worker-ahvgEorK.js`)
	// and gives a 48-bit collision space. Node built-in crypto — no new deps.
	const contentHash = (content: string): string =>
		createHash('sha256').update(content, 'utf-8').digest('base64url').slice(0, 8);
	return {
		name: 'strip-fastly-cdn',
		transform(code: string) {
			if (!code.includes('fastly.jsdelivr.net')) return null;
			return code.replace(CDN_BASE_RE, SELFHOST_BASE).replace(LEGACY_STRIP_RE, '');
		},
		closeBundle() {
			// Post-write rewrite on emitted worker files (Vite 8 + Rolldown write
			// worker assets from a snapshot taken before our output hooks fire —
			// direct fs writes are the only reliable mutation point, per v7.1.1).
			const distDir = resolve(__dirname, 'dist');
			const distAssets = join(distDir, 'assets');
			if (!fs.existsSync(distAssets)) return;
			// INTENT-011 step 1: rewrite fastly URLs and RENAME each mutated
			// worker file to a hash of its FINAL content. The name emitted by
			// Rolldown was derived from the pre-rewrite snapshot — after our
			// rewrite it no longer matches the content, which is what let the
			// INTENT-010 cache poisoning happen. Files whose content was NOT
			// rewritten keep their original name (it still matches content).
			const renameMap: Record<string, string> = {};
			for (const file of fs.readdirSync(distAssets)) {
				if (!file.startsWith('worker-') || !file.endsWith('.js')) continue;
				const fullPath = join(distAssets, file);
				const content = fs.readFileSync(fullPath, 'utf-8');
				if (!content.includes('fastly.jsdelivr.net')) continue;
				const rewritten = content
					.replace(CDN_BASE_RE, SELFHOST_BASE)
					.replace(LEGACY_STRIP_RE, '');
				const newName = `worker-${contentHash(rewritten)}.js`;
				if (newName !== file) {
					fs.writeFileSync(join(distAssets, newName), rewritten, 'utf-8');
					fs.unlinkSync(fullPath);
					renameMap[file] = newName;
				} else {
					// ~2^-48 coincidence: content changed but hash equals old name.
					// Name still matches content — write in place, no rename needed.
					fs.writeFileSync(fullPath, rewritten, 'utf-8');
				}
			}
			// INTENT-011 step 2: patch every reference to the old worker names.
			// Plain string token replace (split/join) — no regex, so nothing
			// beyond the exact `worker-<hash>.js` token can be touched.
			if (Object.keys(renameMap).length > 0) {
				const refFiles = [
					...fs
						.readdirSync(distAssets)
						.filter((f) => /^index-.*\.js$/.test(f))
						.map((f) => join(distAssets, f)),
					join(distDir, 'sw.js'),
					join(distDir, 'index.html')
				];
				for (const refFile of refFiles) {
					if (!fs.existsSync(refFile)) continue;
					let refContent = fs.readFileSync(refFile, 'utf-8');
					let changed = false;
					for (const [oldName, newName] of Object.entries(renameMap)) {
						if (!refContent.includes(oldName)) continue;
						refContent = refContent.split(oldName).join(newName);
						changed = true;
					}
					if (changed) fs.writeFileSync(refFile, refContent, 'utf-8');
				}
			}
			// Self-host the wasm binary so the rewritten URL resolves same-origin.
			const wasmSource = resolve(
				__dirname,
				'node_modules/zxing-wasm/dist/reader/zxing_reader.wasm'
			);
			if (fs.existsSync(wasmSource)) {
				const wasmTargetDir = join(distAssets, 'zxing-wasm/reader');
				fs.mkdirSync(wasmTargetDir, { recursive: true });
				fs.copyFileSync(wasmSource, join(wasmTargetDir, 'zxing_reader.wasm'));
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
			// FIX (2026-10-02, Commander Option A): Android launcher showed
			// "Utilities" — Web App Manifest `categories` was missing, so
			// Chrome defaulted the installed-app category. 'finance' matches
			// the app's purpose (ecash/Lightning wallet). iOS ignores
			// categories (limitation of its home-screen install).
			categories: ['finance'],
				theme_color: '#fafafa',
				background_color: '#ffffff',
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
						purpose: 'maskable'
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
