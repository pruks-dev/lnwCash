<script lang="ts">
	/**
	 * Icon: History — Solar Linear (verified, api.iconify.design/solar)
	 * CC BY 4.0
	 * MODIFIED from Solar Linear history-linear (stroke-only curved arrow)
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
	<g fill="none" stroke="currentColor" stroke-width="1.5">
		<!-- Clock hands -->
		<path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4l2.5 2.5" />
		<!-- Circular back arrow (stroke-only) -->
		<path
			stroke-linecap="round"
			stroke-linejoin="round"
			d="M3.5 12a8.5 8.5 0 1 0 2.5-6"
		/>
		<!-- Arrowhead at top -->
		<path
			stroke-linecap="round"
			stroke-linejoin="round"
			stroke-width="1.5"
			d="M6 6l-3 .3l.3-3"
		/>
	</g>
</svg>
