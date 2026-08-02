<script lang="ts">
	/**
	 * Icon: Send — Iconly 3.0 Bold Arrow-Up
	 * Thick chevron pointing up, rounded caps
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
	<path d="M4.08 15.05L10.6 8.53C11.37 7.76 12.63 7.76 13.4 8.53L19.92 15.05" />
</svg>
