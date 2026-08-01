<script lang="ts">
	import { _ } from 'svelte-i18n';
	import { createWallet, unlockWallet, getWalletStatus, type WalletState } from '$lib/wallet/state';
	import { WalletNotInitializedError, InvalidPinError } from '$lib/wallet/errors';
	import { getSettings, setSettings } from '$lib/storage/local';

	interface Props {
		onWalletReady?: (state: WalletState) => void;
	}

	let { onWalletReady }: Props = $props();

	// $state runes
	let pin: string = $state('');
	let confirmPin: string = $state('');
	let isReturning: boolean = $state(false);
	let error: string = $state('');
	let loading: boolean = $state(false);
	let mode: 'register' | 'unlock' = $state('register');

	// Check wallet status on mount
	let walletState = $state<string>('UNINITIALIZED');

	$effect(() => {
		try {
			const status = getWalletStatus();
			walletState = status.state;
			isReturning = status.state !== 'UNINITIALIZED';
			if (isReturning) {
				mode = 'unlock';
			}
		} catch {
			walletState = 'UNINITIALIZED';
		}
	});

	function clearError() {
		error = '';
	}

	async function handleRegister() {
		clearError();
		if (pin.length < 6) {
			error = $_('screen.register.error_too_short');
			return;
		}
		if (pin !== confirmPin) {
			error = $_('screen.register.error_mismatch');
			return;
		}

		loading = true;
		try {
			const settings = getSettings();
			const walletName = settings.default_mint ? `LnwCash-${Date.now()}` : 'LnwCash Wallet';
			const result = await createWallet(pin, walletName);
			onWalletReady?.(getWalletStatus());
		} catch (e) {
			error = e instanceof Error ? e.message : $_('common.error');
		} finally {
			loading = false;
		}
	}

	async function handleUnlock() {
		clearError();
		if (pin.length < 6) {
			error = $_('screen.register.error_too_short');
			return;
		}

		loading = true;
		try {
			const result = await unlockWallet(pin);
			onWalletReady?.(result);
	} catch (e) {
		if (e instanceof InvalidPinError) {
			error = e.message;
		} else if (e instanceof WalletNotInitializedError) {
			error = e.message;
		} else if (e instanceof Error) {
			error = e.message;
		} else {
			error = $_('common.error');
		}
		} finally {
			loading = false;
		}
	}

	function switchMode() {
		clearError();
		pin = '';
		confirmPin = '';
		mode = mode === 'register' ? 'unlock' : 'register';
	}

	async function handleSubmit() {
		if (mode === 'register') {
			await handleRegister();
		} else {
			await handleUnlock();
		}
	}

	let title = $derived(
		mode === 'register' ? $_('screen.register.title') : $_('screen.register.unlock_title')
	);
</script>

<div class="register-screen">
	<h2 class="title">{title}</h2>

	{#if mode === 'unlock'}
		<p class="prompt">{$_('screen.register.unlock_prompt')}</p>
	{/if}

	<div class="form">
		<label class="input-group">
			<span class="label-text">
				{mode === 'register' ? $_('screen.register.pin_placeholder') : 'PIN'}
			</span>
			<input
				type="password"
				inputmode="numeric"
				maxlength="6"
				pattern="[0-9]*"
				bind:value={pin}
				oninput={clearError}
				placeholder={$_('screen.register.pin_placeholder')}
				disabled={loading}
				class="pin-input"
			/>
		</label>

		{#if mode === 'register'}
			<label class="input-group">
				<span class="label-text">{$_('screen.register.confirm_pin')}</span>
				<input
					type="password"
					inputmode="numeric"
					maxlength="6"
					pattern="[0-9]*"
					bind:value={confirmPin}
					oninput={clearError}
					placeholder="------"
					disabled={loading}
					class="pin-input"
				/>
			</label>
		{/if}

		{#if error}
			<p class="error-message" role="alert">{error}</p>
		{/if}

		<button
			type="button"
			class="submit-btn"
			onclick={handleSubmit}
			disabled={loading || pin.length < 6 || (mode === 'register' && confirmPin.length < 6)}
		>
			{#if loading}
				{$_('common.loading')}
			{:else}
				{mode === 'register' ? $_('screen.register.submit') : $_('screen.register.unlock_title')}
			{/if}
		</button>

		<button type="button" class="switch-btn" onclick={switchMode}>
			{mode === 'register' ? $_('screen.register.returning_user') : $_('screen.register.title')}
		</button>
	</div>
</div>

<style>
	.register-screen {
		max-width: 400px;
		margin: 0 auto;
		padding: 2rem 1.5rem;
		text-align: center;
	}

	.title {
		font-size: 1.5rem;
		color: #f7931a;
		margin-bottom: 0.5rem;
	}

	.prompt {
		color: #666;
		font-size: 0.9rem;
		margin-bottom: 1.5rem;
	}

	.form {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.input-group {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		text-align: left;
	}

	.label-text {
		font-size: 0.85rem;
		color: #555;
		font-weight: 600;
	}

	.pin-input {
		padding: 0.75rem 1rem;
		font-size: 1.25rem;
		border: 2px solid #e0e0e0;
		border-radius: 10px;
		text-align: center;
		letter-spacing: 0.5em;
		outline: none;
		transition: border-color 0.2s;
	}

	.pin-input:focus {
		border-color: #f7931a;
	}

	.pin-input:disabled {
		opacity: 0.6;
		background: #f5f5f5;
	}

	.error-message {
		color: #e74c3c;
		font-size: 0.85rem;
		margin: 0;
		padding: 0.5rem;
		background: #fdeaea;
		border-radius: 8px;
	}

	.submit-btn {
		padding: 0.85rem;
		font-size: 1rem;
		font-weight: 700;
		color: white;
		background: #f7931a;
		border: none;
		border-radius: 12px;
		cursor: pointer;
		transition: background 0.2s;
	}

	.submit-btn:hover:not(:disabled) {
		background: #e6820f;
	}

	.submit-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.switch-btn {
		background: none;
		border: none;
		color: #f7931a;
		font-size: 0.85rem;
		cursor: pointer;
		text-decoration: underline;
		padding: 0.5rem;
	}
</style>
