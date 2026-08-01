<script lang="ts">
	/**
	 * Icon: Plus
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
	<line x1="12" y1="5" x2="12" y2="19" />
	<line x1="5" y1="12" x2="19" y2="12" />
</svg>
