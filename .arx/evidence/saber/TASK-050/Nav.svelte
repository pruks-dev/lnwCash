<script lang="ts">
	/**
	 * Nav — D-004
	 * Bottom navigation bar + top app bar
	 */
	interface NavItem {
		label: string;
		icon: import('svelte').Snippet;
		href?: string;
		active?: boolean;
		badge?: string | number;
		onclick?: (e: MouseEvent) => void;
	}

	interface Props {
		/** Navigation position */
		position?: 'bottom' | 'top';
		/** Navigation items */
		items: NavItem[];
		/** Title for top app bar */
		title?: string;
		/** Leading action (e.g. back button) for top bar */
		leading?: import('svelte').Snippet;
		/** Trailing actions for top bar */
		trailing?: import('svelte').Snippet;
		/** Aria label for the nav element */
		ariaLabel?: string;
	}

	let {
		position = 'bottom',
		items = [],
		title = undefined,
		leading,
		trailing,
		ariaLabel = undefined
	}: Props = $props();
</script>

{#if position === 'top'}
	<header class="nav-top">
		<div class="nav-top-row">
			{#if leading}
				<span class="nav-leading">
					{@render leading()}
				</span>
			{/if}
			{#if title}
				<h1 class="nav-title">{title}</h1>
			{/if}
			{#if trailing}
				<span class="nav-trailing">
					{@render trailing()}
				</span>
			{/if}
		</div>
	</header>
{:else}
	<nav class="nav-bottom" aria-label={ariaLabel ?? 'Navigation'}>
		<div class="nav-bottom-container">
			{#each items as item}
				{@const isActive = item.active ?? false}
				{@const hasBadge = item.badge !== undefined}
				<button
					type="button"
					class="nav-item"
					class:nav-item-active={isActive}
					aria-current={isActive ? 'page' : undefined}
					onclick={item.onclick}
				>
					<span class="nav-item-icon" aria-hidden="true">
						{@render item.icon()}
					</span>
					<span class="nav-item-label">{item.label}</span>
					{#if hasBadge}
						<span class="nav-item-badge">{item.badge}</span>
					{/if}
				</button>
			{/each}
		</div>
	</nav>
{/if}

<style>
	/* ─── Bottom Nav ───────────────────── */
	.nav-bottom {
		position: fixed;
		bottom: 0;
		left: 0;
		right: 0;
		z-index: var(--z-sticky);
		background: var(--color-surface);
		border-top: 1px solid var(--color-border);
		padding-bottom: env(safe-area-inset-bottom, 0);
	}

	.nav-bottom-container {
		display: flex;
		justify-content: space-around;
		align-items: flex-start;
		padding: var(--space-xs) 0;
		max-width: 480px;
		margin: 0 auto;
	}

	.nav-item {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2px;
		padding: var(--space-xs) var(--space-sm);
		border: none;
		background: transparent;
		color: var(--color-text-secondary);
		font-family: var(--font-family);
		font-size: var(--font-size-xs);
		cursor: pointer;
		transition: color var(--transition-fast);
		position: relative;
		min-width: 56px;
		-webkit-tap-highlight-color: transparent;
	}

	.nav-item:focus-visible {
		outline: 2px solid var(--color-primary);
		outline-offset: -2px;
		border-radius: var(--radius-sm);
	}

	.nav-item-active {
		color: var(--color-primary);
	}

	.nav-item-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
	}

	.nav-item-label {
		font-size: var(--font-size-xs);
		font-weight: var(--font-weight-medium);
		line-height: 1;
	}

	.nav-item-badge {
		position: absolute;
		top: 0;
		right: 4px;
		min-width: 16px;
		height: 16px;
		padding: 0 4px;
		border-radius: var(--radius-full);
		background: var(--color-error);
		color: white;
		font-size: 10px;
		font-weight: var(--font-weight-bold);
		display: flex;
		align-items: center;
		justify-content: center;
		line-height: 1;
	}

	/* ─── Top App Bar ─────────────────── */
	.nav-top {
		position: sticky;
		top: 0;
		z-index: var(--z-sticky);
		background: var(--color-surface);
		border-bottom: 1px solid var(--color-border);
		padding-top: env(safe-area-inset-top, 0);
	}

	.nav-top-row {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		padding: var(--space-sm) var(--space-md);
		min-height: 48px;
	}

	.nav-leading,
	.nav-trailing {
		display: flex;
		align-items: center;
		flex-shrink: 0;
	}

	.nav-title {
		flex: 1;
		margin: 0;
		font-size: var(--font-size-lg);
		font-weight: var(--font-weight-semibold);
		color: var(--color-text);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
</style>
