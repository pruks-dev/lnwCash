<script lang="ts">
	import { _ } from 'svelte-i18n';

	type ScreenKey = 'balance' | 'receive' | 'pay' | 'transfer' | 'history';

	interface Props {
		active: ScreenKey;
		onNavigate: (screen: ScreenKey) => void;
	}

	let { active = 'balance', onNavigate }: Props = $props();

	const navItems: { key: ScreenKey; labelKey: string; icon: string }[] = [
		{ key: 'balance', labelKey: 'nav.balance', icon: '\u{1F4B0}' },
		{ key: 'receive', labelKey: 'nav.receive', icon: '\u{2B07}' },
		{ key: 'pay', labelKey: 'nav.pay', icon: '\u{2B06}' },
		{ key: 'transfer', labelKey: 'nav.transfer', icon: '\u{21C4}' },
		{ key: 'history', labelKey: 'nav.history', icon: '\u{1F4C4}' }
	];
</script>

<nav class="bottom-nav">
	{#each navItems as item}
		<button
			type="button"
			class="nav-item"
			class:active={active === item.key}
			onclick={() => onNavigate(item.key)}
		>
			<span class="nav-icon">{item.icon}</span>
			<span class="nav-label">{$_(item.labelKey)}</span>
		</button>
	{/each}
</nav>

<style>
	.bottom-nav {
		display: flex;
		justify-content: space-around;
		align-items: center;
		background: white;
		border-top: 1px solid #eee;
		padding: 0.5rem 0;
		position: fixed;
		bottom: 0;
		left: 0;
		right: 0;
		z-index: 100;
		box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.05);
	}

	.nav-item {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.2rem;
		padding: 0.35rem 0.75rem;
		background: none;
		border: none;
		cursor: pointer;
		color: #888;
		transition: color 0.2s;
		font-size: 0.7rem;
		min-width: 56px;
	}

	.nav-item.active {
		color: #f7931a;
	}

	.nav-icon {
		font-size: 1.25rem;
		line-height: 1;
	}

	.nav-label {
		font-weight: 600;
		font-size: 0.65rem;
		text-transform: uppercase;
	}
</style>
