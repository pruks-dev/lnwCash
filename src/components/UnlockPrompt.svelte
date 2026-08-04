<script lang="ts">
	import { _ } from 'svelte-i18n';
	import Modal from '$lib/components/ui/Modal.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Input from '$lib/components/ui/Input.svelte';
	import { unlockWallet } from '$lib/wallet/state';
	import { InvalidPinError } from '$lib/wallet/errors';

	interface Props {
		open: boolean;
		onunlock: () => void;
		oncancel: () => void;
	}

	let { open, onunlock, oncancel }: Props = $props();

	let pin: string = $state('');
	let error: string = $state('');
	let loading: boolean = $state(false);

	async function handleSubmit() {
		if (pin.length < 4) {
			error = $_('screen.register.error_pin_length');
			return;
		}
		loading = true;
		error = '';
		try {
			await unlockWallet(pin);
			pin = '';
			onunlock();
		} catch (e) {
			if (e instanceof InvalidPinError) {
				error = $_('screen.register.error_wrong_pin');
			} else {
				error = $_('common.error');
			}
		} finally {
			loading = false;
		}
	}

	function handleCancel() {
		pin = '';
		error = '';
		oncancel();
	}
</script>

<Modal open={open} onclose={handleCancel}>
	<div class="unlock-prompt">
		<h3>{$_('screen.register.unlock_title')}</h3>
		<p class="unlock-desc">{$_('screen.register.enter_pin')}</p>
		
		<Input
			type="password"
			placeholder="PIN"
			value={pin}
			oninput={(e) => pin = (e.target as HTMLInputElement).value}
			maxlength={6}
		/>
		
		{#if error}
			<p class="unlock-error">{error}</p>
		{/if}
		
		<div class="unlock-actions">
			<Button variant="secondary" onclick={handleCancel}>
				{$_('common.cancel')}
			</Button>
			<Button variant="primary" onclick={handleSubmit} disabled={loading}>
				{loading ? '...' : $_('common.confirm')}
			</Button>
		</div>
	</div>
</Modal>

<style>
	.unlock-prompt {
		display: flex;
		flex-direction: column;
		gap: var(--space-md);
		padding: var(--space-md);
		min-width: 280px;
	}
	.unlock-desc {
		color: var(--color-text-secondary);
		font-size: var(--text-sm);
	}
	.unlock-error {
		color: var(--color-error);
		font-size: var(--text-sm);
	}
	.unlock-actions {
		display: flex;
		justify-content: flex-end;
		gap: var(--space-sm);
		margin-top: var(--space-sm);
	}
</style>
