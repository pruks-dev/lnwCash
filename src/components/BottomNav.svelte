<script lang="ts">
	/**
	 * BottomNav — TASK-056 (B)
	 * Bottom navigation bar: 2 tabs (Wallet, History) + center-docked FAB QR Scan
	 * HMR fix: stable {#snippet} blocks — no $derived snippet creation
	 */
	import { _ } from 'svelte-i18n';
	import type { ScreenKey } from '$lib/router';

	// TASK-050 Components
	import Nav from '$lib/components/ui/Nav.svelte';

	// TASK-159 Iconly wrapper — unified icon system
	import Iconly from '$lib/iconly/Iconly.svelte';

	// FAB QR Scan (TASK-056)
	import Fab from './Fab.svelte';

	interface Props {
		active: ScreenKey;
		onNavigate: (screen: ScreenKey) => void;
		/** QR Scan handler — optional, wired by App.svelte */
		onQRScan?: () => void;
	}

	let {
		active = 'home',
		onNavigate,
		onQRScan
	}: Props = $props();

	/**
	 * navItems uses $derived for reactive label/active only.
	 * Icon snippet references (walletIcon, historyIcon) are
	 * defined as stable {#snippet} blocks in template — NOT
	 * recreated on each $derived recomputation → HMR safe.
	 */
	let navItems = $derived([
		{
			label: $_('nav.home'),
			active: active === 'home',
			onclick: () => onNavigate('home'),
			icon: walletIcon
		},
		{
			label: $_('nav.history'),
			active: active === 'history',
			onclick: () => onNavigate('history'),
			icon: historyIcon
		}
	]);
</script>

<!-- Stable snippet blocks — referenced by identifier in $derived above -->
{#snippet walletIcon()}
	<Iconly name="Wallet" size={24} />
{/snippet}

{#snippet historyIcon()}
	<Iconly name="History" size={24} />
{/snippet}

<div class="bottom-nav-shell">
	<Nav
		position="bottom"
		items={navItems}
		ariaLabel="Main navigation"
	/>

	{#if onQRScan}
		<Fab onclick={onQRScan} />
	{/if}
</div>

<style>
	.bottom-nav-shell {
		position: relative;
	}
</style>
