<script lang="ts">
	/**
	 * Icon: Cake — Solar Linear cake-linear (TASK-5702-R12 kind 10, INTENT-057 BLUEPRINT v3 rev25).
	 * Path inlined verbatim from api.iconify.design/solar
	 * (GET /solar/cake-linear.svg, verified 2026-11-26, HTTP 200).
	 * CC BY 4.0 — https://creativecommons.org/licenses/by/4.0/
	 * Never hand-drawn. Kind map: bakery → Cake.
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
		<path d="M22 21.5H2" />
		<path d="M4 21.5V14C4 12.1144 4 11.1716 4.5858 10.5858C5.1716 10 6.1144 10 8 10H16C17.8856 10 18.8284 10 19.4142 10.5858C20 11.1716 20 12.1144 20 14V21.5" />
		<path d="M4 15.5C5.2 17.1 7.2 17.1 8 15.7C8.9 14.1 11.1 14.1 12 15.7C12.9 17.1 15.1 17.1 16 15.7C16.8 14.1 18.8 14.1 20 15.5" />
		<path d="M8 10V6.25" />
		<path d="M12 10V6.25" />
		<path d="M16 10V6.25" />
		<path d="M8 2.5H8.0001" />
		<path d="M12 2.5H12.0001" />
		<path d="M16 2.5H16.0001" />
	</g>
</svg>
