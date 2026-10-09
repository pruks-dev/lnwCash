<script lang="ts">
	import { fade } from 'svelte/transition';
	import { _ } from 'svelte-i18n';
	import { isOnline, onConnectivityChange, trackWasOffline } from '$lib/offline-indicator';

	interface Props {
		/** Whether to show as a banner at top (default) or inline badge */
		variant?: 'banner' | 'badge';
	}

	let { variant = 'banner' }: Props = $props();

	let online: boolean = $state(isOnline());
	// Online banner shows ONLY on an observed offline→online reconnect while
	// mounted, then auto-dismisses (~3s). Mounting already-online shows nothing.
	let showOnlineBanner: boolean = $state(false);
	let dismissTimer: ReturnType<typeof setTimeout> | null = null;

	/** TASK-1404 (INTENT-013 F-049-003, mockup rev2 BOSS-APPROVED): reconnect auto-dismiss window. */
	const ONLINE_DISMISS_MS = 3000;

	function clearDismissTimer(): void {
		if (dismissTimer !== null) {
			clearTimeout(dismissTimer);
			dismissTimer = null;
		}
	}

	function scheduleOnlineDismiss(): void {
		clearDismissTimer();
		showOnlineBanner = true;
		dismissTimer = setTimeout(() => {
			showOnlineBanner = false;
			dismissTimer = null;
		}, ONLINE_DISMISS_MS);
	}

	$effect(() => {
		const cleanup1 = onConnectivityChange((status: boolean) => {
			const wasOfflineShown = !online;
			online = status;
			if (variant === 'banner') {
				if (!status) {
					// Went offline — persistent banner until reconnect.
					clearDismissTimer();
					showOnlineBanner = false;
				} else if (wasOfflineShown) {
					// Reconnect transition — brand banner, auto-dismiss ~3s.
					scheduleOnlineDismiss();
				}
			}
		});
		const cleanup2 = trackWasOffline();
		return () => {
			cleanup1();
			cleanup2();
			clearDismissTimer();
		};
	});
</script>

<!--
  TASK-1502 (INTENT-013 v5.2 rev-locale-split F-050-002, BOSS-APPROVED mockup
  rev-locale-split): banner บรรทัดเดียวแยกตาม locale ผ่าน $_() + locales
  th/en (เครื่องไทยเห็นไทย / เครื่องอังกฤษเห็นอังกฤษ — ไม่ปน TH+EN) —
  keys ใหม่ไร้ emoji: offline.banner_offline / offline.banner_online
  (โละ offline.banner / back_online เก่าที่มี emoji พร้อมกัน) — ไม่มี sub —
  สี var ล้วน dark ใช้ var ตาม mockup — ไม่มี hex ตายตัว — ห้าม inline style.
  คำบอส L-P008 verbatim: 'banner ทำไมมีไทยปนอังกฤษ ไม่แยกตามการตั้งค่าของผู้ใช้'
-->
{#if variant === 'banner'}
	{#if !online}
		<div class="offline-banner offline-banner--offline" role="alert" aria-live="assertive">
			<span class="bicon bicon--off" aria-hidden="true">
				<svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
					<path
						d="M2 5.5C4.5 3.5 9.5 3.5 12 5.5M4.5 8c1.5-1.2 4.5-1.2 6 0"
						stroke="currentColor"
						stroke-width="1.6"
						stroke-linecap="round"
					/>
					<circle cx="7" cy="10.5" r="1.2" fill="currentColor" />
					<line
						x1="2"
						y1="2"
						x2="12"
						y2="12"
						stroke="currentColor"
						stroke-width="1.6"
						stroke-linecap="round"
					/>
				</svg>
			</span>
			<div class="banner-text">{$_('offline.banner_offline')}</div>
		</div>
	{:else if showOnlineBanner}
		<div class="offline-banner offline-banner--online" role="status" aria-live="polite" transition:fade={{ duration: 300 }}>
			<span class="bicon bicon--on" aria-hidden="true">
				<svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
					<path
						d="M2.5 7.5l3.2 3.2L11.5 4.5"
						stroke="currentColor"
						stroke-width="1.8"
						stroke-linecap="round"
						stroke-linejoin="round"
					/>
				</svg>
			</span>
			<div class="banner-text">{$_('offline.banner_online')}</div>
		</div>
	{/if}
{:else}
	<span class="offline-badge" class:online class:offline={!online}>
		{online ? $_('screen.balance.online') : $_('screen.balance.offline')}
	</span>
{/if}

<style>
	/* ===== TASK-1404 mockup rev2 (BOSS-APPROVED) — var ล้วน, ไม่มี hex ตายตัว, ไม่มี emoji ===== */
	.offline-banner {
		display: flex;
		align-items: center;
		gap: 12px;
		min-height: 48px;
		padding: 12px 16px;
		border-radius: 12px;
		font-size: 14px;
		font-weight: 600;
		letter-spacing: 0.01em;
		line-height: 1.5;
		transition: opacity 300ms ease;
	}

	/* สถานะ A — offline: พื้น surface + เส้นซ้าย 4px ฟ้าแบรนด์ (dark = พื้นมืดอัตโนมัติผ่าน var) */
	.offline-banner--offline {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-left: 4px solid var(--color-primary);
		color: var(--color-text);
	}

	/* สถานะ B — online: แถบฟ้าแบรนด์ทึบ, auto-dismiss ~3s */
	.offline-banner--online {
		background: var(--color-primary);
		border: 1px solid var(--color-primary);
		color: var(--color-primary-contrast);
	}

	/* ไอคอนวงกลมแบรนด์ 28px — เส้น SVG currentColor */
	.bicon {
		flex: none;
		width: 28px;
		height: 28px;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.bicon--off {
		background: var(--color-info-light);
		border: 1.5px solid var(--color-primary);
	}

	.bicon--on {
		background: rgba(128, 128, 128, 0.25);
		border: 1.5px solid currentColor;
	}

	.banner-text {
		letter-spacing: 0.01em;
	}

	/* badge variant — แบรนด์ฟ้า (เก็บ class hook + i18n key เดิมให้เทสเดิมผ่าน) */
	.offline-badge {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-size: 0.75rem;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		padding: 4px 12px;
		min-height: 24px;
		border-radius: 999px;
		border: 1px solid var(--color-primary);
		white-space: nowrap;
	}

	.offline-badge.online {
		background: var(--color-primary);
		color: var(--color-primary-contrast);
		border-color: var(--color-primary);
	}

	.offline-badge.offline {
		background: var(--color-surface);
		color: var(--color-primary-dark);
		border-color: var(--color-primary);
	}
</style>
