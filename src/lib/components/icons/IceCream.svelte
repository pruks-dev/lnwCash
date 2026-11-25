<script lang="ts">
	/**
	 * Icon: IceCream — Solar Linear ice-cream-cone-linear (TASK-5702-R12 kind 10,
	 * INTENT-057 BLUEPRINT v3 rev25).
	 * Path inlined verbatim from api.iconify.design/solar
	 * (GET /solar/ice-cream-cone-linear.svg, verified 2026-11-26, HTTP 200).
	 * CC BY 4.0 — https://creativecommons.org/licenses/by/4.0/
	 * Never hand-drawn. Kind map: dessert → IceCream.
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
		<path d="M5.25 8.85217C5.25 5.12427 8.2721 2.10217 12 2.10217C15.7279 2.10217 18.75 5.12427 18.75 8.85217C18.75 10.3022 18.1 11.1022 17 11.1022H7C5.9 11.1022 5.25 10.3022 5.25 8.85217Z" />
		<path d="M7.25 11.1022L11.4143 20.9213L11.4144 20.9214C11.6904 21.5722 11.8285 21.8978 12 21.8978C12.1715 21.8978 12.3096 21.5722 12.5856 20.9214L12.5857 20.9213L16.75 11.1022" />
		<path d="M9.20068 15.7022L15.7319 13.5023" />
	</g>
</svg>
