<script lang="ts">
	import { _ } from 'svelte-i18n';
	import { isOnline, onConnectivityChange, trackWasOffline } from '$lib/offline-indicator';

	interface Props {
		/** Whether to show as a banner at top (default) or inline badge */
		variant?: 'banner' | 'badge';
	}

	let { variant = 'banner' }: Props = $props();

	let online: boolean = $state(isOnline());

	$effect(() => {
		const cleanup1 = onConnectivityChange((status: boolean) => {
			online = status;
		});
		const cleanup2 = trackWasOffline();
		return () => {
			cleanup1();
			cleanup2();
		};
	});
</script>

{#if variant === 'banner'}
	{#if !online}
		<div class="offline-banner" role="alert" aria-live="assertive">
			<span class="offline-icon">&#128308;</span>
			<span class="offline-text">{$_('offline.banner')}</span>
		</div>
	{/if}
{:else}
	<span class="offline-badge" class:online class:offline={!online}>
		{online ? $_('screen.balance.online') : $_('screen.balance.offline')}
	</span>
{/if}

<style>
	.offline-banner {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		padding: 0.5rem 1rem;
		background: linear-gradient(135deg, #fff3cd 0%, #ffeeba 100%);
		border-bottom: 2px solid #ffc107;
		color: #856404;
		font-weight: 600;
		font-size: 0.85rem;
		z-index: 150;
		position: relative;
	}

	.offline-icon {
		font-size: 0.9rem;
	}

	.offline-text {
		letter-spacing: 0.02em;
	}

	.offline-badge {
		font-size: 0.75rem;
		font-weight: 600;
		padding: 0.25rem 0.75rem;
		border-radius: 20px;
		display: inline-block;
	}

	.offline-badge.online {
		background: #d4edda;
		color: #155724;
	}

	.offline-badge.offline {
		background: #fff3cd;
		color: #856404;
	}
</style>
