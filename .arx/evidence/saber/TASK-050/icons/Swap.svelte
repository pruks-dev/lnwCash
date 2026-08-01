<script lang="ts">
	/**
	 * Icon: Swap
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
	<polyline points="7 16 3 12 7 8" />
	<line x1="3" y1="12" x2="15" y2="12" />
	<polyline points="17 8 21 12 17 16" />
	<line x1="21" y1="12" x2="9" y2="12" />
</svg>
