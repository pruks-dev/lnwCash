<script lang="ts">
	/**
	 * Icon: Mug — Solar Linear mug-linear (TASK-5702-R12 kind 10, INTENT-057 BLUEPRINT v3 rev25).
	 * Path inlined verbatim from api.iconify.design/solar
	 * (GET /solar/mug-linear.svg, verified 2026-11-26, HTTP 200).
	 * CC BY 4.0 — https://creativecommons.org/licenses/by/4.0/
	 * Never hand-drawn. Kind map: coffee → Mug.
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
	<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.5">
		<path d="M9 18H11C13.8284 18 15.2426 18 16.1213 17.1213C17 16.2426 17 14.8284 17 12V7C17 5.11438 17 4.17157 16.4142 3.58579C15.8284 3 14.8856 3 13 3H7C5.11438 3 4.17157 3 3.58579 3.58579C3 4.17157 3 5.11438 3 7V12C3 14.8284 3 16.2426 3.87868 17.1213C4.75736 18 6.17157 18 9 18Z" />
		<path d="M17 13H18C20.2091 13 22 11.2091 22 9C22 6.79086 20.2091 5 18 5H16.9493" />
		<path d="M17.0002 13H3.00174" />
		<path d="M22 21L2 21" />
	</g>
</svg>
