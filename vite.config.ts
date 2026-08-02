import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { VitePWA } from 'vite-plugin-pwa';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
const __dirname = fileURLToPath(new URL('.', import.meta.url));

const pkg = JSON.parse(fs.readFileSync(resolve(__dirname, 'package.json'), 'utf-8'));

export default defineConfig({
	define: {
		'import.meta.env.APP_VERSION': JSON.stringify(pkg.version)
	},
	plugins: [
		svelte(),
		VitePWA({
			registerType: 'autoUpdate',
			includeAssets: ['favicon.svg'],
			manifest: {
				name: 'LNWCASH Wallet',
				short_name: 'LNWCASH',
				description: 'Lightning Network Wallet',
				theme_color: '#f7931a',
				background_color: '#1a1a2e',
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
		alias: {
			$lib: resolve(__dirname, 'src/lib')
		}
	},
	server: {
		https: {
			key: fs.readFileSync(resolve(__dirname, 'cert/key.pem')),
			cert: fs.readFileSync(resolve(__dirname, 'cert/cert.pem'))
		}
	},
	test: {
		environment: 'jsdom',
		include: ['src/**/*.{test,spec}.{ts,js}'],
		setupFiles: ['./src/vitest.setup.ts'],
		globals: true,
		deps: {
			optimizer: {
				web: {
					enabled: true
				}
			}
		}
	}
});
