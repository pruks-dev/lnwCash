<script lang="ts">
	/**
	 * Icon: Swap — Iconly 3.0 Bold Swap
	 * Two arrows swapping direction
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
	<path d="M16.84 3.99L20.27 7.42L16.84 10.85" />
	<path d="M4.18 12.51H19.27" />
	<path d="M7.16 20.01L3.73 16.58L7.16 13.15" />
	<path d="M19.82 11.49H4.73" />
</svg>
