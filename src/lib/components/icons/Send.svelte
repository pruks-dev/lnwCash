<script lang="ts">
	/**
	 * Icon: Send — Diagonal up-right arrow (↗)
	 * Solar Linear style (api.iconify.design/solar, CC BY 4.0)
	 * MODIFIED from Solar Linear arrow-up-linear (M5 19l14-14...)
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
		d="M5 19l14-14m0 0H9m10 0v10"
	/>
</svg>
