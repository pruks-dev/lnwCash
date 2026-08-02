<script lang="ts">
/**
 * TopAppBar — TASK-051 (B) → TASK-060 (A) header redesign → TASK-069 hamburger
 * Shows LNWCASH logo (40px) on left, hamburger ☰ on right.
 * Back button only on sub-pages (Send, Receive) — HMR-safe {#if} pattern preserved.
 *
 * TASK-056: {#if} wrap preserved for HMR safety
 * TASK-060: Added logo + gear icon, removed Nav dependency
 * TASK-069: Gear → hamburger ☰, navigates to /settings
 */
import { _ } from 'svelte-i18n';
import type { ScreenKey } from '$lib/router';

// Icons
import ArrowLeft from '$lib/components/icons/ArrowLeft.svelte';
import Menu from '$lib/components/icons/Menu.svelte';

interface Props {
	/** Current screen */
	screen: ScreenKey;
	/** Show back button? */
	showBack?: boolean;
	/** Back handler */
	onBack?: () => void;
	/** Hamburger icon click handler — navigates to settings */
	onMenuClick?: () => void;
}

let {
	screen = 'home',
	showBack = false,
	onBack,
	onMenuClick
}: Props = $props();

	function screenTitle(key: ScreenKey): string {
		switch (key) {
			case 'home': return $_('screen.home.title');
			case 'receive': return $_('screen.receive.title');
			case 'send': return $_('screen.send.title');
			case 'history': return $_('screen.history.title');
			case 'settings': return $_('screen.settings.title');
			case 'setup': return $_('screen.setup.title');
			default: return '';
		}
	}

	let title = $derived(screenTitle(screen));
</script>

<!-- HMR-safe {#if} pattern from TASK-056 preserved: -->
{#if showBack}
	<header class="top-app-bar">
		<div class="top-bar-row">
			<button
				type="button"
				class="icon-btn back-btn"
				onclick={onBack}
				aria-label={$_('common.back')}
			>
				<ArrowLeft size={24} />
			</button>

			<div class="brand">
				<img
					src="/lnw-logo-144.png"
					alt="LNWCASH"
					class="logo"
					width={40}
					height={40}
				/>
				<span class="wordmark">LNWCASH</span>
			</div>

			<div class="flex-spacer"></div>

			<button
				type="button"
				class="icon-btn menu-btn"
				onclick={onMenuClick}
				aria-label={$_('screen.settings.title')}
			>
				<Menu size={24} />
			</button>
		</div>
	</header>
{:else}
	<header class="top-app-bar">
		<div class="top-bar-row">
			<div class="brand">
				<img
					src="/lnw-logo-144.png"
					alt="LNWCASH"
					class="logo"
					width={40}
					height={40}
				/>
				<span class="wordmark">LNWCASH</span>
			</div>

			<div class="flex-spacer"></div>

			<button
				type="button"
				class="icon-btn menu-btn"
				onclick={onMenuClick}
				aria-label={$_('screen.settings.title')}
			>
				<Menu size={24} />
			</button>
		</div>
	</header>
{/if}

<style>
	.top-app-bar {
		position: sticky;
		top: 0;
		z-index: var(--z-sticky);
		background: transparent;
		border: none;
		padding-top: env(safe-area-inset-top, 0);
	}

	.top-bar-row {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		padding: var(--space-sm) var(--space-md);
		min-height: 48px;
	}

	.logo {
		height: 40px;
		width: auto;
		aspect-ratio: 144 / 144;
		object-fit: contain;
		flex-shrink: 0;
	}

	.brand {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.wordmark {
		font-size: 1.25rem;
		font-weight: 700;
		color: var(--color-primary);
	}

	.flex-spacer {
		flex: 1;
	}

	/* Icon buttons */
	.icon-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: var(--space-sm);
		min-width: 44px;
		min-height: 44px;
		background: none;
		border: none;
		color: var(--color-text);
		cursor: pointer;
		border-radius: var(--radius-full);
		-webkit-tap-highlight-color: transparent;
		transition: background var(--transition-fast);
		flex-shrink: 0;
	}

	.icon-btn:hover,
	.icon-btn:focus-visible {
		background: var(--color-surface-variant);
	}

	.icon-btn:focus-visible {
		outline: 2px solid var(--color-primary);
		outline-offset: 2px;
	}
</style>
