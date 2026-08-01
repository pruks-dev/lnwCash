<script lang="ts">
	/**
	 * Icon: Wallet
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
	<rect x="2" y="5" width="20" height="14" rx="2" />
	<line x1="16" y1="10" x2="16" y2="14" />
	<line x1="2" y1="8" x2="22" y2="8" />
	<path d="M2 8v8a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8" />
</svg>
