<script lang="ts">
	/**
	 * TopAppBar — TASK-051 (B)
	 * Top app bar component: screen title + optional back button
	 * Uses TASK-050 Nav component (top position)
	 */
	import { _ } from 'svelte-i18n';
	import type { ScreenKey } from '$lib/router';

	// TASK-050 Components
	import Nav from '$lib/components/ui/Nav.svelte';

	// TASK-050 Icons
	import ArrowLeft from '$lib/components/icons/ArrowLeft.svelte';

	interface Props {
		/** Current screen */
		screen: ScreenKey;
		/** Show back button? */
		showBack?: boolean;
		/** Back handler */
		onBack?: () => void;
	}

	let { screen = 'home', showBack = false, onBack }: Props = $props();

	function screenTitle(key: ScreenKey): string {
		switch (key) {
			case 'home': return $_('screen.home.title');
			case 'receive': return $_('screen.receive.title');
			case 'send': return $_('screen.send.title');
			case 'history': return $_('screen.history.title');
			case 'settings': return $_('screen.settings.title');
			case 'setup': return $_('screen.setup.title');
			default: return '';
		}
	}

	let title = $derived(screenTitle(screen));
</script>

{#snippet backBtn()}
	{#if showBack}
		<button
			type="button"
			class="back-btn"
			onclick={onBack}
			aria-label={$_('common.back')}
		>
			<ArrowLeft size={24} />
		</button>
	{/if}
{/snippet}

{#if showBack}
	<Nav
		position="top"
		title={title}
		leading={backBtn}
		ariaLabel="Top navigation"
	/>
{:else}
	<Nav
		position="top"
		title={title}
		ariaLabel="Top navigation"
	/>
{/if}

<style>
	.back-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: var(--space-sm);
		min-width: 44px;
		min-height: 44px;
		background: none;
		border: none;
		color: var(--color-text);
		cursor: pointer;
		border-radius: var(--radius-full);
		-webkit-tap-highlight-color: transparent;
		transition: background var(--transition-fast);
	}

	.back-btn:hover,
	.back-btn:focus-visible {
		background: var(--color-surface-variant);
	}

	.back-btn:focus-visible {
		outline: 2px solid var(--color-primary);
		outline-offset: 2px;
	}
</style>
