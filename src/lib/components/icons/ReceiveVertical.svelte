<script lang="ts">
	/**
	 * Icon: ReceiveVertical — Alt chevron down (v)
	 * Used in Home/Wallet page quick action buttons.
	 * Solar Linear alt-arrow-down-linear (api.iconify.design/solar, CC BY 4.0)
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
		d="m19 9l-7 6l-7-6"
	/>
</svg>
