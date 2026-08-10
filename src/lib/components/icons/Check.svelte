<script lang="ts">
	/**
	 * Icon: Check — Solar Linear (verified, api.iconify.design/solar)
	 * CC BY 4.0 — verified from official Solar Linear check-circle-linear path
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
		<circle cx="12" cy="12" r="10" />
		<path stroke-linecap="round" stroke-linejoin="round" d="m8.5 12.5l2 2l5-5" />
	</g>
</svg>
