<script lang="ts">
	/**
	 * Setup Screen — consolidate Register + CreateWallet
	 * Step 1: PIN setup (Register/Unlock)
	 * Step 2: Create wallet (name + mints)
	 * Uses TASK-050: Card, Button, Input, Heading, Body, Icons
	 */
	import { _ } from 'svelte-i18n';
	import { createWallet, unlockWallet, getWalletStatus, type WalletState } from '$lib/wallet/state';
	import { WalletNotInitializedError, InvalidPinError } from '$lib/wallet/errors';
	import { getSettings, setSettings } from '$lib/storage/local';
	import { fetchAndCacheKeysets } from '$lib/cashu/keyset';
	import { DEFAULT_MINT_CONFIG } from '$lib/wallet/config';

	// TASK-050 Design System Components
	import Card from '$lib/components/ui/Card.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Input from '$lib/components/ui/Input.svelte';
	import Heading from '$lib/components/ui/Heading.svelte';
	import Body from '$lib/components/ui/Body.svelte';

	interface Props {
		onWalletReady?: (state: WalletState) => void;
	}

	let { onWalletReady }: Props = $props();

	type SetupStep = 'register' | 'unlock' | 'create-wallet';

	let step: SetupStep = $state('register');
	let isReturning: boolean = $state(false);
	let pin: string = $state('');
	let confirmPin: string = $state('');
	let error: string = $state('');
	let loading: boolean = $state(false);

	// Wallet creation fields
	let walletName: string = $state('');
	let mintUrls: string[] = $state([DEFAULT_MINT_CONFIG.url]);
	let newMintUrl: string = $state('');
	let mintInfoMap: Record<string, { name: string; keysets: string[] }> = $state({});

	// Check wallet status on mount
	$effect(() => {
		try {
			const status = getWalletStatus();
			if (status.state !== 'UNINITIALIZED') {
				isReturning = true;
				step = 'unlock';
			}
		} catch {
			// UNINITIALIZED — stay on register
		}
	});

	function clearError() {
		error = '';
	}

	// ─── PIN Registration ─────────────────────────────────
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
		step = 'create-wallet';
	}

	// ─── PIN Unlock ──────────────────────────────────────
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

	function switchToUnlock() {
		clearError();
		pin = '';
		step = 'unlock';
	}

	function switchToRegister() {
		clearError();
		pin = '';
		confirmPin = '';
		step = 'register';
	}

	function backToPin() {
		clearError();
		step = 'register';
	}

	// ─── Wallet Creation ─────────────────────────────────
	function addMint() {
		const url = newMintUrl.trim();
		if (!url) return;
		if (!url.startsWith('https://') && !url.startsWith('http://')) {
			error = $_('common.error_invalid_url');
			return;
		}
		if (mintUrls.includes(url)) {
			error = $_('screen.wallet.error_duplicate_mint');
			return;
		}
		mintUrls = [...mintUrls, url];
		newMintUrl = '';
		error = '';
		fetchMintInfo(url);
	}

	function removeMint(url: string) {
		mintUrls = mintUrls.filter((u) => u !== url);
		const newMap = { ...mintInfoMap };
		delete newMap[url];
		mintInfoMap = newMap;
	}

	async function fetchMintInfo(url: string) {
		try {
			const keysets = await fetchAndCacheKeysets(url);
			const active = keysets.filter((k: { active: boolean }) => k.active);
			mintInfoMap = {
				...mintInfoMap,
				[url]: { name: url, keysets: active.map((k: { id: string }) => k.id) }
			};
		} catch {
			mintInfoMap = {
				...mintInfoMap,
				[url]: { name: url, keysets: [] }
			};
		}
	}

	async function handleCreateWallet() {
		error = '';
		// F-045: walletName optional — default to 'LNWCASH Wallet'
		const effectiveName = walletName.trim() || 'LNWCASH Wallet';
		if (mintUrls.length < 2) {
			error = $_('screen.wallet.error_no_mint');
			return;
		}
		if (pin.length < 6) {
			error = $_('screen.register.error_too_short');
			return;
		}

		loading = true;
		try {
			await createWallet(pin, effectiveName);
			// After creating, unlock immediately
			await unlockWallet(pin);
			onWalletReady?.(getWalletStatus());
		} catch (e) {
			error = e instanceof Error ? e.message : $_('common.error');
		} finally {
			loading = false;
		}
	}

	let stepTitle = $derived(
		step === 'unlock' ? $_('screen.register.unlock_title') :
		step === 'create-wallet' ? $_('screen.wallet.create_title') :
		$_('screen.register.title')
	);
</script>

<div class="setup-screen" role="main" aria-label={$_('screen.setup.title')}>

	<Heading level="h1" align="center">{$_('screen.setup.title')}</Heading>

	<Card variant="basic" padding="lg">
		<div class="auth-card">
			<Heading level="h2" align="center">{stepTitle}</Heading>

			{#if step === 'register'}
				<!-- ─── Register PIN ─────────────────────── -->
				<div class="form">
					<Input
						type="password"
						label={$_('screen.register.pin_placeholder')}
						placeholder="------"
						disabled={loading}
						oninput={(e) => { pin = (e.target as HTMLInputElement).value; clearError(); }}
					/>

					<Input
						type="password"
						label={$_('screen.register.confirm_pin')}
						placeholder="------"
						disabled={loading}
						oninput={(e) => { confirmPin = (e.target as HTMLInputElement).value; clearError(); }}
					/>

					{#if error}
						<div class="error-banner" role="alert">
							<Body size="sm">{error}</Body>
						</div>
					{/if}

					<Button
						variant="primary"
						size="lg"
						onclick={handleRegister}
						disabled={loading || pin.length < 6 || confirmPin.length < 6}
					>
						{#snippet children()}{$_('screen.register.submit')}{/snippet}
					</Button>

					<Button variant="ghost" size="sm" onclick={switchToUnlock}>
						{#snippet children()}{$_('screen.register.returning_user')}{/snippet}
					</Button>
				</div>

			{:else if step === 'unlock'}
				<!-- ─── Unlock PIN ───────────────────────── -->
				<div class="form">
					<Body size="sm" color="secondary" align="center">
						{$_('screen.register.unlock_prompt')}
					</Body>

					<Input
						type="password"
						label={$_('screen.register.pin_placeholder')}
						placeholder="------"
						disabled={loading}
						oninput={(e) => { pin = (e.target as HTMLInputElement).value; clearError(); }}
					/>

					{#if error}
						<div class="error-banner" role="alert">
							<Body size="sm">{error}</Body>
						</div>
					{/if}

					<Button
						variant="primary"
						size="lg"
						loading={loading}
						onclick={handleUnlock}
						disabled={loading || pin.length < 6}
					>
						{#snippet children()}{$_('screen.register.unlock_title')}{/snippet}
					</Button>

					<Button variant="ghost" size="sm" onclick={switchToRegister}>
						{#snippet children()}{$_('screen.register.title')}{/snippet}
					</Button>
				</div>

			{:else if step === 'create-wallet'}
				<!-- ─── Create Wallet ─────────────────────── -->
				<div class="form">
					<Input
						type="text"
						label={$_('screen.wallet.name_label')}
						placeholder="LNWCASH Wallet (default)"
						disabled={loading}
						oninput={(e) => walletName = (e.target as HTMLInputElement).value}
					/>

					<div class="mint-section">
						<Body size="sm" weight="medium">{$_('screen.wallet.mint_url_label')}</Body>
						<div class="mint-input-row">
						<Input
							type="text"
							placeholder={$_('common.placeholder_mint_url')}
							disabled={loading}
							oninput={(e) => newMintUrl = (e.target as HTMLInputElement).value}
						/>
							<Button variant="secondary" size="md" onclick={addMint} disabled={loading || !newMintUrl.trim()}>
								{#snippet children()}{$_('screen.wallet.add_mint')}{/snippet}
							</Button>
						</div>
					</div>

					{#if mintUrls.length > 0}
						<div class="mint-list">
							{#each mintUrls as url (url)}
								<div class="mint-item">
									<div class="mint-info">
										<Body size="sm" truncate>{url}</Body>
										{#if mintInfoMap[url]?.keysets?.length}
											<Body size="sm" color="disabled">
												{$_('screen.wallet.keyset_label')}: {mintInfoMap[url].keysets.length}
											</Body>
										{/if}
									</div>
									<Button variant="ghost" size="sm" onclick={() => removeMint(url)} disabled={loading}>
										{#snippet children()}{$_('screen.wallet.remove_mint')}{/snippet}
									</Button>
								</div>
							{/each}
						</div>
					{:else}
						<Body size="sm" color="disabled">{$_('screen.wallet.error_no_mint')}</Body>
					{/if}

					{#if error}
						<div class="error-banner" role="alert">
							<Body size="sm">{error}</Body>
						</div>
					{/if}

					<Button
						variant="primary"
						size="lg"
						loading={loading}
						onclick={handleCreateWallet}
						disabled={loading || mintUrls.length < 2}
					>
						{#snippet children()}{$_('screen.wallet.create_button')}{/snippet}
					</Button>

					<Button variant="ghost" size="sm" onclick={backToPin}>
						{#snippet children()}{$_('screen.setup.back_to_pin')}{/snippet}
					</Button>
				</div>
			{/if}
		</div>
	</Card>
</div>

<style>
	.setup-screen {
		max-width: 480px;
		margin: 0 auto;
		padding: var(--space-xl) var(--space-md);
		display: flex;
		flex-direction: column;
		gap: var(--space-lg);
	}

	.auth-card {
		display: flex;
		flex-direction: column;
		gap: var(--space-md);
	}

	.form {
		display: flex;
		flex-direction: column;
		gap: var(--space-md);
	}

	.error-banner {
		padding: var(--space-sm) var(--space-md);
		background: var(--color-error-light);
		border-radius: var(--radius-md);
		border: 1px solid var(--color-error);
	}

	/* Mint section */
	.mint-section {
		display: flex;
		flex-direction: column;
		gap: var(--space-sm);
	}

	.mint-input-row {
		display: flex;
		gap: var(--space-sm);
		align-items: flex-start;
	}

	.mint-input-row :global(.input-wrapper) {
		flex: 1;
	}

	.mint-list {
		display: flex;
		flex-direction: column;
		gap: var(--space-sm);
	}

	.mint-item {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: var(--space-sm) var(--space-md);
		background: var(--color-surface-variant);
		border-radius: var(--radius-md);
		border: 1px solid var(--color-border);
	}

	.mint-info {
		display: flex;
		flex-direction: column;
		gap: 2px;
		overflow: hidden;
		flex: 1;
	}
</style>
