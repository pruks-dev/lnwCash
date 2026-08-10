<script lang="ts">
	/**
	 * Icon: Warning — Solar Linear (verified, api.iconify.design/solar)
	 * CC BY 4.0 — verified from official Solar Linear danger-triangle-linear path
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
	<g fill="none">
		<path
			stroke="currentColor"
			stroke-width="1.5"
			d="M5.312 10.762C8.23 5.587 9.689 3 12 3s3.77 2.587 6.688 7.762l.364.644c2.425 4.3 3.638 6.45 2.542 8.022S17.786 21 12.364 21h-.728c-5.422 0-8.134 0-9.23-1.572s.117-3.722 2.542-8.022z"
		/>
		<path stroke="currentColor" stroke-linecap="round" stroke-width="1.5" d="M12 8v5" />
		<circle cx="12" cy="16" r="1" fill="currentColor" />
	</g>
</svg>
