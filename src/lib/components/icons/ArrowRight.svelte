<script lang="ts">
	/**
	 * Icon: ArrowRight — Solar Linear (verified, api.iconify.design/solar)
	 * CC BY 4.0 — verified from official Solar Linear arrow-right-linear path
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
		d="M4 12h16m0 0l-6-6m6 6l-6 6"
	/>
</svg>
