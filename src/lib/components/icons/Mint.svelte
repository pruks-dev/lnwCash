<script lang="ts">
	/**
	 * Icon: Mint — Iconly 3.0 Bold Wallet
	 * Wallet shape representing mint/balance
	 */
	interface Props {
		size?: number;
		class?: string;
		color?: string;
	}
	let { size = 24, class: className = '', color = 'currentColor' }: Props = $props();
</script>

<svg
	xmlns="http://www.w3.org/2000/svg"
	width={size}
	height={size}
	viewBox="0 0 24 24"
	fill="none"
	stroke={color}
	stroke-width="2"
	stroke-linecap="round"
	stroke-linejoin="round"
	class={className}
	aria-hidden="true"
	role="img"
>
	<path d="M22 12V17C22 20 20 22 17 22H7C4 22 2 20 2 17V12C2 9.28 4.53 7.06 7.69 7.01C7.79 7.01 7.89 7 7.99 7H16C16.11 7 16.21 7.01 16.31 7.01C19.47 7.06 22 9.28 22 12Z" />
	<path d="M18 11V13C18 13.55 17.55 14 17 14H7C6.45 14 6 13.55 6 13V11C6 10.45 6.45 10 7 10H17C17.55 10 18 10.45 18 11Z" />
	<path d="M22 12.5V13.5C22 14.05 21.55 14.5 21 14.5H20C18.9 14.5 18 13.6 18 12.5V11.5C18 10.4 18.9 9.5 20 9.5H21C21.55 9.5 22 9.95 22 10.5" />
</svg>
