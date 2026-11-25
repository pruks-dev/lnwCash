<script lang="ts">
	/**
	 * Icon: Burger — Solar Linear burger-linear (TASK-5702-R7 simplify 9,
	 * INTENT-057 BLUEPRINT v3 rev19: kind 4 หมวด — food icon).
	 * Path inlined verbatim from api.iconify.design/solar
	 * (GET /solar/burger-linear.svg, verified 2026-11-26, HTTP 200).
	 * CC BY 4.0 — https://creativecommons.org/licenses/by/4.0/
	 * Never hand-drawn (same linear set as CupHot/Donut/Box).
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
		<path d="M4.3998 11.65H19.5998C20.4835 11.65 21.1998 12.3663 21.1998 13.25C21.1998 14.1337 20.4835 14.85 19.5998 14.85H4.3998C3.5161 14.85 2.7998 14.1337 2.7998 13.25C2.7998 12.3663 3.5161 11.65 4.3998 11.65Z" />
		<path d="M4 11.65C4 8.05001 7.2 5.95001 12 5.95001C16.8 5.95001 20 8.05001 20 11.65" />
		<path d="M4 14.85V16.05C4 17.35 5.2 18.05 7.3 18.05H16.7C18.8 18.05 20 17.35 20 16.05V14.85" />
		<path d="M9 9.25H9.0001" />
		<path d="M12 8.34998H12.0001" />
		<path d="M15 9.34998H15.0001" />
	</g>
</svg>
