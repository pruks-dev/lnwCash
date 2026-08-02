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
					{
						// Stale-while-revalidate for mint API calls
						// Matches typical Cashu mint endpoints: /v1/mint, /v1/melt, /v1/swap, etc.
						urlPattern: /\/v1\/(mint|melt|swap|check|keys|keysets|info)/i,
						handler: 'StaleWhileRevalidate',
						options: {
							cacheName: 'mint-api',
							expiration: {
								maxEntries: 50,
								maxAgeSeconds: 5 * 60 // 5 minutes max (per forbidden spec)
							}
						}
					},
					{
						// Network-first for other API calls (webLn, etc.)
						urlPattern: ({ url }) => {
							// Cache anything that looks like an API endpoint
							return url.pathname.startsWith('/api/') ||
								url.pathname.startsWith('/v1/');
						},
						handler: 'NetworkFirst',
						options: {
							cacheName: 'api-cache',
							networkTimeoutSeconds: 10,
							expiration: {
								maxEntries: 30,
								maxAgeSeconds: 60 // 1 minute
							}
						}
					}
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
