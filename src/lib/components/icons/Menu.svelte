<script lang="ts">
	/**
	 * Icon: Menu
	 * Source: Solar Linear — hamburger-menu-linear (verified via api.iconify.design/solar)
	 * License: CC BY 4.0 — https://creativecommons.org/licenses/by/4.0/
	 * Three horizontal lines, rounded caps, ☰ style
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
	stroke-width="1.5"
	stroke-linecap="round"
	stroke-linejoin="round"
	class={className}
	aria-hidden="true"
	role="img"
>
	<path d="M20 7H4m16 5H4m16 5H4" />
</svg>
