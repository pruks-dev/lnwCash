<script lang="ts">
	/**
	 * Icon: Menu — Iconly 3.0 Bold Hamburger Menu
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
	stroke-width="2"
	stroke-linecap="round"
	stroke-linejoin="round"
	class={className}
	aria-hidden="true"
	role="img"
>
	<path d="M3 7H21" />
	<path d="M3 12H21" />
	<path d="M3 17H21" />
</svg>
