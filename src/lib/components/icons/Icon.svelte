<script lang="ts">
	/**
	 * Icon — D-005
	 * Dynamic icon wrapper: renders icon by name
	 * Usage: <Icon name="Wallet" size={28} />
	 */
	import Wallet from './Wallet.svelte';
	import Receive from './Receive.svelte';
	import Send from './Send.svelte';
	import Swap from './Swap.svelte';
	import History from './History.svelte';
	import Settings from './Settings.svelte';
	import Scan from './Scan.svelte';
	import Mint from './Mint.svelte';
	import Check from './Check.svelte';
	import Copy from './Copy.svelte';
	import Close from './Close.svelte';
	import ArrowLeft from './ArrowLeft.svelte';
	import ArrowRight from './ArrowRight.svelte';
	import Plus from './Plus.svelte';
	import Minus from './Minus.svelte';
	import Time from './Time.svelte';

	export type IconName =
		| 'Wallet'
		| 'Receive'
		| 'Send'
		| 'Swap'
		| 'History'
		| 'Settings'
		| 'Scan'
		| 'Mint'
		| 'Check'
		| 'Copy'
		| 'Close'
		| 'ArrowLeft'
		| 'ArrowRight'
		| 'Plus'
		| 'Minus'
		| 'Time';

	interface Props {
		/** Icon name — one of the available icon set */
		name: IconName;
		/** Size in px (default 24) */
		size?: number;
		/** Additional CSS class */
		class?: string;
		/** Stroke color (default currentColor) */
		color?: string;
	}

	let { name, size = 24, class: className = '', color = 'currentColor' }: Props = $props();

	const iconMap: Record<IconName, typeof Wallet> = {
		Wallet,
		Receive,
		Send,
		Swap,
		History,
		Settings,
		Scan,
		Mint,
		Check,
		Copy,
		Close,
		ArrowLeft,
		ArrowRight,
		Plus,
		Minus,
		Time
	};

	const iconComponent = $derived(iconMap[name] ?? Wallet);
</script>

<!-- svelte-ignore svelte_component_deprecated -->
<svelte:component this={iconComponent} {size} {color} class={className} />
