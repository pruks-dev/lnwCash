<script lang="ts">
	/**
	 * Icon: ArrowLeft — Solar Linear (verified, api.iconify.design/solar)
	 * CC BY 4.0 — verified from official Solar Linear arrow-left-linear path
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
		d="M20 12H4m0 0l6-6m-6 6l6 6"
	/>
</svg>
