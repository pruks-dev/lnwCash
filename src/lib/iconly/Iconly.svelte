<script lang="ts">
	/**
	 * Iconly — TASK-061 Dynamic Icon Wrapper (re-export)
	 * Thin wrapper around Icon.svelte for the Iconly brand name.
	 * Provides dynamic SVG icon rendering by name with size/color props.
	 * Usage: <Iconly name="Send" size={20} />
	 */
	import Icon from '$lib/components/icons/Icon.svelte';
	import type { IconName } from '$lib/components/icons/Icon.svelte';

	interface Props {
		name: IconName;
		size?: number;
		class?: string;
		color?: string;
	}

	let { name, size = 24, class: className = '', color = 'currentColor' }: Props = $props();
</script>

<Icon {name} {size} class={className} {color} />
