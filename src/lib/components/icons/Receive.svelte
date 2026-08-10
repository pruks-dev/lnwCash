<script lang="ts">
	/**
	 * Icon: Receive — Diagonal down-left arrow (↙)
	 * Solar Linear style (api.iconify.design/solar, CC BY 4.0)
	 * Modified to diagonal for visual distinction between Send/Receive
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
	<path
		fill="none"
		stroke="currentColor"
		stroke-linecap="round"
		stroke-linejoin="round"
		stroke-width="1.5"
		d="M19 5L5 19m0 0h10M5 19V9"
	/>
</svg>
