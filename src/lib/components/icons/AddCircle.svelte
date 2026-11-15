<script lang="ts">
	/**
	 * Icon: AddCircle — Solar Linear add-circle-linear (TASK-5466 rev49
	 * fixforward_bottomsheet_r49, Manage header + button).
	 * Path inlined VERBATIM from api.iconify.design/solar
	 * (GET /solar.json?icons=add-circle-linear, verified 2026-11-12, HTTP 200).
	 * CC BY 4.0 — https://creativecommons.org/licenses/by/4.0/
	 * Never hand-drawn.
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
		<circle cx="12" cy="12" r="10" />
		<path d="M15 12L12 12M12 12L9 12M12 12L12 9M12 12L12 15" />
	</g>
</svg>
