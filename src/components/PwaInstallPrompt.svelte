<script lang="ts">
	import { _ } from 'svelte-i18n';
	import {
		isStandalone,
		isInstallDismissed,
		dismissInstall,
		onCanInstallChange,
		triggerInstall,
		initPwaInstall
	} from '$lib/pwa-install';

	let showPrompt: boolean = $state(false);
	let installing: boolean = $state(false);

	$effect(() => {
		const cleanupPwa = initPwaInstall();
		const cleanupCanInstall = onCanInstallChange((canInstall: boolean) => {
			// Show prompt only if: can install, not standalone, not dismissed
			showPrompt = canInstall && !isStandalone() && !isInstallDismissed();
		});
		return () => {
			cleanupPwa();
			cleanupCanInstall();
		};
	});

	async function handleInstall() {
		installing = true;
		try {
			const accepted = await triggerInstall();
			if (accepted) {
				showPrompt = false;
			}
		} catch {
			// User cancelled or error
		} finally {
			installing = false;
		}
	}

	function handleDismiss() {
		dismissInstall();
		showPrompt = false;
	}
</script>

{#if showPrompt}
	<div class="install-prompt" role="dialog" aria-label={$_('pwa.install_title')}>
		<div class="install-content">
			<div class="install-icon">&#128241;</div>
			<div class="install-text">
				<strong>{$_('pwa.install_title')}</strong>
				<p>{$_('pwa.install_description')}</p>
			</div>
		</div>
		<div class="install-actions">
			<button type="button" class="install-btn primary" onclick={handleInstall} disabled={installing}>
				{installing ? $_('common.loading') : $_('pwa.install_button')}
			</button>
			<button type="button" class="install-btn secondary" onclick={handleDismiss} disabled={installing}>
				{$_('pwa.later_button')}
			</button>
		</div>
	</div>
{/if}

<style>
	.install-prompt {
		position: fixed;
		bottom: 80px;
		left: 50%;
		transform: translateX(-50%);
		z-index: 300;
		background: white;
		border: 1px solid #e0e0e0;
		border-radius: 16px;
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
		padding: 1rem 1.25rem;
		max-width: 380px;
		width: calc(100% - 2rem);
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		animation: slideUp 0.3s ease-out;
	}

	@keyframes slideUp {
		from {
			opacity: 0;
			transform: translateX(-50%) translateY(20px);
		}
		to {
			opacity: 1;
			transform: translateX(-50%) translateY(0);
		}
	}

	.install-content {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.install-icon {
		font-size: 2rem;
		flex-shrink: 0;
	}

	.install-text strong {
		font-size: 0.95rem;
		color: #1a1a2e;
		display: block;
		margin-bottom: 0.2rem;
	}

	.install-text p {
		margin: 0;
		font-size: 0.8rem;
		color: #666;
		line-height: 1.4;
	}

	.install-actions {
		display: flex;
		gap: 0.75rem;
		justify-content: flex-end;
	}

	.install-btn {
		padding: 0.5rem 1.25rem;
		font-size: 0.85rem;
		font-weight: 600;
		border-radius: 10px;
		border: none;
		cursor: pointer;
		transition: all 0.2s;
	}

	.install-btn:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.install-btn.primary {
		background: #f7931a;
		color: white;
	}

	.install-btn.primary:hover:not(:disabled) {
		background: #e6821a;
	}

	.install-btn.secondary {
		background: #f0f0f0;
		color: #555;
	}

	.install-btn.secondary:hover:not(:disabled) {
		background: #e0e0e0;
	}
</style>
