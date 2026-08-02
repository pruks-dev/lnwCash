<script lang="ts">
	/**
	 * Icon: Scan — Iconly 3.0 Bold Scan
	 * QR scanner frame with corner brackets and scan line
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
	<path d="M2 9V6C2 3.79 3.79 2 6 2H9" />
	<path d="M15 2H18C20.21 2 22 3.79 22 6V9" />
	<path d="M22 15V18C22 20.21 20.21 22 18 22H15" />
	<path d="M9 22H6C3.79 22 2 20.21 2 18V15" />
	<path d="M2 12H22" />
</svg>
