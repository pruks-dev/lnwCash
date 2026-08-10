<script lang="ts">
	/**
	 * Icon: History — Solar Linear style (verified, api.iconify.design/solar)
	 * CC BY 4.0 — modified history-linear: replaced filled curved arrow
	 * with stroke-only path for lighter visual weight.
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
		<!-- Curved back arrow (stroke-only, replaces filled path) -->
		<path stroke-linecap="round" stroke-linejoin="round" d="M3 12a9 9 0 1 0 3-6.7" />
		<!-- Arrowhead at top -->
		<path stroke-linecap="round" stroke-linejoin="round" d="M6 5.3l-3 .3l.3-3" />
	</g>
</svg>
