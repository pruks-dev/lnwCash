<script lang="ts">
	/**
	 * Icon: Apple — Solar Linear apple-linear (TASK-5702-R12 kind 10, INTENT-057 BLUEPRINT v3 rev25).
	 * Path inlined verbatim from api.iconify.design/solar
	 * (GET /solar/apple-linear.svg, verified 2026-11-26, HTTP 200).
	 * CC BY 4.0 — https://creativecommons.org/licenses/by/4.0/
	 * Never hand-drawn. Kind map: fruit → Apple.
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
	stroke-width="1.5"
	stroke-linecap="round"
	stroke-linejoin="round"
	class={className}
	aria-hidden="true"
	role="img"
>
	<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5">
		<path d="M12 7.2C10.6 6.2 9 5.5 7.6 5.5C4.6 5.5 3 8.3 3 11.6C3 16.6 6 22 9 22C10.3 22 11 21.3 12 21.3C13 21.3 13.7 22 15 22C18 22 21 16.6 21 11.6C21 8.3 19.4 5.5 16.4 5.5C15 5.5 13.4 6.2 12 7.2Z" />
		<path d="M12 7.2C12 5.2 12.8 3.4 14.5 2" />
	</g>
</svg>
