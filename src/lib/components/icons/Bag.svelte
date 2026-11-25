<script lang="ts">
	/**
	 * Icon: Bag — Solar Linear bag-linear (TASK-5702-R12 kind 10, INTENT-057 BLUEPRINT v3 rev25).
	 * Path inlined verbatim from api.iconify.design/solar
	 * (GET /solar/bag-linear.svg, verified 2026-11-26, HTTP 200).
	 * CC BY 4.0 — https://creativecommons.org/licenses/by/4.0/
	 * Never hand-drawn. Kind map: general → Bag (shopping bag = general goods).
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
		<path d="M3.74132 20.5545C3.74132 20.5545 3.74132 20.5545 3.74132 20.5545C4.94094 22 7.17365 22 11.6391 22H12.3602C16.8257 22 19.0584 22 20.258 20.5545M3.74132 20.5545C2.5417 19.1091 2.95316 16.9146 3.77608 12.5257C4.3613 9.40452 4.65392 7.84393 5.76481 6.92196M20.258 20.5545C20.258 20.5545 20.258 20.5545 20.258 20.5545C21.4576 19.1091 21.0461 16.9146 20.2232 12.5257C19.638 9.40452 19.3454 7.84393 18.2345 6.92196M18.2345 6.92196C18.2345 6.92196 18.2345 6.92196 18.2345 6.92196C17.1236 6 15.5358 6 12.3602 6H11.6391C8.4635 6 6.87571 6 5.76481 6.92196C5.76481 6.92196 5.76482 6.92196 5.76481 6.92196" />
		<path d="M9 6V5C9 3.34315 10.3431 2 12 2C13.6569 2 15 3.34315 15 5V6" />
	</g>
</svg>
