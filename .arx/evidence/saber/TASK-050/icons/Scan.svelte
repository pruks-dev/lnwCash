<script lang="ts">
	/**
	 * Icon: Scan (QR scanner frame)
	 */
	interface Props {
		size?: number;
		class?: string;
	}
	let { size = 24, class: className = '' }: Props = $props();
</script>

<svg
	xmlns="http://www.w3.org/2000/svg"
	width={size}
	height={size}
	viewBox="0 0 24 24"
	fill="none"
	stroke="currentColor"
	stroke-width="1.75"
	stroke-linecap="round"
	stroke-linejoin="round"
	class={className}
	aria-hidden="true"
	role="img"
>
	<path d="M3 7V5a2 2 0 0 1 2-2h2" />
	<path d="M17 3h2a2 2 0 0 1 2 2v2" />
	<path d="M21 17v2a2 2 0 0 1-2 2h-2" />
	<path d="M7 21H5a2 2 0 0 1-2-2v-2" />
	<line x1="3" y1="12" x2="21" y2="12" />
</svg>
