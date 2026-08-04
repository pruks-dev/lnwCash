<script lang="ts">
	/**
	 * TASK-049 (D-011) — Mint Settings UI
	 *
	 * Allows users to view, add, switch, and remove Cashu mints.
	 * Integrates with TASK-047 (types), TASK-048 (config/store/discovery),
	 * and TASK-050 (design system components).
	 */
	import { _ } from 'svelte-i18n';
	import { discoverMintEndpoints } from '$lib/wallet/discovery';
	import {
		getAllMintConfigs,
		removeMintConfig,
		getDefaultMintUrl,
		getMintConfig,
		setMintConfig,
		getActiveMintUrl,
		setActiveMintUrl
	} from '$lib/wallet/store';
	import { DEFAULT_MINT_CONFIG, type MintConfig } from '$lib/wallet/config';
	import { validateMintUrl } from '$lib/wallet/mint-validation';
	import Input from '$lib/components/ui/Input.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import ListItem from '$lib/components/ui/ListItem.svelte';
	import Badge from '$lib/components/ui/Badge.svelte';
	import Modal from '$lib/components/ui/Modal.svelte';

	// ─── Active Mint Tracking (shared — imported from $lib/wallet/store) ──

	// ─── State ───────────────────────────────────────────────────

	let mints: MintConfig[] = $state([]);
	let activeMintUrl: string = $state(getActiveMintUrl());
	let loading: boolean = $state(false);
	let error: string = $state('');

	// Add/Edit Modal state
	let showAddModal: boolean = $state(false);
	let addUrl: string = $state('');
	let addUrlError: string = $state('');
	let validating: boolean = $state(false);
	let validatedConfig: MintConfig | null = $state(null);
	let validatedNuts: string[] = $state([]);
	let validateError: string = $state('');
	let saving: boolean = $state(false);

	// ─── Lifecycle ───────────────────────────────────────────────

	$effect(() => {
		loadMints();
	});

	function loadMints(): void {
		try {
			mints = getAllMintConfigs();
		} catch (e) {
			error = e instanceof Error ? e.message : $_('common.error');
		}
	}

	// ─── Helpers ─────────────────────────────────────────────────

	function isDefaultMint(url: string): boolean {
		return url === getDefaultMintUrl();
	}

	function isActiveMint(url: string): boolean {
		return url === activeMintUrl;
	}

	function getStatusBadge(config: MintConfig): { variant: 'success' | 'warning' | 'error' | 'default'; label: string } {
		if (config.last_info_fetch > 0) {
			return { variant: 'success', label: $_('screen.balance.online') };
		}
		if (config.name && config.version) {
			return { variant: 'warning', label: $_('screen.balance.refresh') };
		}
		return { variant: 'default', label: $_('common.loading') };
	}

	// ─── Add/Validate Mint ───────────────────────────────────────

	function openAddModal(): void {
		showAddModal = true;
		addUrl = '';
		addUrlError = '';
		validating = false;
		validatedConfig = null;
		validatedNuts = [];
		validateError = '';
		saving = false;
	}

	function closeAddModal(): void {
		showAddModal = false;
	}

	function handleUrlInput(e: Event): void {
		const target = e.target as HTMLInputElement;
		addUrl = target.value;
		addUrlError = '';
		validatedConfig = null;
		validatedNuts = [];
		validateError = '';
	}

	async function handleValidate(): Promise<void> {
		addUrlError = '';
		validateError = '';
		validatedConfig = null;
		validatedNuts = [];

		validating = true;

		// TASK-096: Use shared validateMintUrl() — prevents drift with Setup.svelte
		const result = await validateMintUrl(addUrl);

		if (!result.success) {
			validateError = result.error || '';
			validating = false;
			return;
		}

		validatedConfig = result.config!;
		validatedNuts = result.nuts || [];
		validating = false;
	}

	async function handleSaveMint(): Promise<void> {
		if (!validatedConfig) return;

		saving = true;
		try {
			// The discoverMintEndpoints already called setMintConfig via discovery flow,
			// but ensure it's stored explicitly
			setMintConfig(validatedConfig);

			// Set as active mint
			setActiveMintUrl(validatedConfig.url);
			activeMintUrl = validatedConfig.url;

			// Refresh list
			loadMints();
			closeAddModal();
		} finally {
			saving = false;
		}
	}

	// ─── Switch Active Mint ─────────────────────────────────────

	async function handleSwitchMint(config: MintConfig): Promise<void> {
		loading = true;
		try {
			// Re-fetch info to ensure it's current
			const result = await discoverMintEndpoints(config.url);
			if (result.success) {
				setMintConfig(result.config);
				setActiveMintUrl(result.config.url);
				activeMintUrl = result.config.url;
				loadMints();
			} else {
				// Even if fetch fails, still switch to cached/known mint
				setActiveMintUrl(config.url);
				activeMintUrl = config.url;
			}
		} catch {
			// Switch anyway with cached data
			setActiveMintUrl(config.url);
			activeMintUrl = config.url;
		} finally {
			loading = false;
		}
	}

	// ─── Remove Mint ────────────────────────────────────────────

	function handleRemoveMint(config: MintConfig): void {
		if (isDefaultMint(config.url)) return;

		removeMintConfig(config.url);

		// If removed mint was active, fall back to default
		if (activeMintUrl === config.url) {
			const fallbackUrl = getDefaultMintUrl();
			setActiveMintUrl(fallbackUrl);
			activeMintUrl = fallbackUrl;
		}

		loadMints();
	}

	// ─── Derived ─────────────────────────────────────────────────

	let isEmpty = $derived(mints.length === 0 || (mints.length === 1 && isDefaultMint(mints[0].url)));
</script>

<svelte:head>
	<title>{$_('mint.settings.title')} — LNWCASH</title>
</svelte:head>

<div class="mint-settings">
	{#if error}
		<Card variant="basic" padding="md">
			<p class="error-text" role="alert">{error}</p>
		</Card>
	{/if}

	<!-- Active Mint Card -->
	{#each mints.filter(m => isActiveMint(m.url)) as mint (mint.url)}
		<Card variant="basic" padding="md">
			<div class="active-mint-header">
				<div class="mint-name-row">
					<h2 class="mint-name">{mint.name || mint.url}</h2>
					{#if isDefaultMint(mint.url)}
						<Badge variant="info" size="sm">{$_('mint.settings.default')}</Badge>
					{/if}
					<Badge variant="success" size="sm">{$_('mint.settings.active')}</Badge>
				</div>
				<p class="mint-url">{mint.url}</p>
			</div>
			<div class="mint-details">
				{#if mint.version}
					<div class="detail-row">
						<span class="detail-label">{$_('mint.settings.version')}</span>
						<span class="detail-value">{mint.version}</span>
					</div>
				{/if}
				{#if mint.supported_nuts.length > 0}
					<div class="detail-row">
						<span class="detail-label">{$_('mint.settings.supportedNuts')}</span>
						<div class="nuts-list">
							{#each mint.supported_nuts as nut}
								<Badge variant="default" size="sm">NUT-{nut}</Badge>
							{/each}
						</div>
					</div>
				{/if}
			{#if mint}
				{@const status = getStatusBadge(mint)}
				<div class="detail-row">
					<span class="detail-label">Status</span>
					<Badge variant={status.variant} size="sm">{status.label}</Badge>
				</div>
			{/if}
			</div>
			{#if !isDefaultMint(mint.url)}
				<div class="active-mint-actions">
					<Button
						variant="ghost"
						size="sm"
						ariaLabel={$_('mint.settings.remove') + ' ' + mint.url}
						onclick={() => handleRemoveMint(mint)}
					>
						{#snippet children()}{$_('mint.settings.remove')}{/snippet}
					</Button>
				</div>
			{/if}
		</Card>
	{/each}

	<!-- Add Mint Button -->
	<div class="add-mint-section">
		<Button
			variant="primary"
			size="md"
			onclick={openAddModal}
		>
			{#snippet children()}+ {$_('mint.settings.add')}{/snippet}
		</Button>
	</div>

	<!-- Mint List -->
	<div class="mint-list">
		{#if isEmpty}
			<Card variant="basic" padding="md">
				<p class="empty-text">{$_('mint.settings.empty')}</p>
			</Card>
		{:else}
			{#each mints.filter(m => !isActiveMint(m.url)) as mint (mint.url)}
				<ListItem
					title={mint.name || mint.url}
					subtitle={mint.url}
					active={false}
					onclick={() => handleSwitchMint(mint)}
				>
					{#snippet leading()}
						<Badge
							variant={isDefaultMint(mint.url) ? 'info' : 'default'}
							size="sm"
							dot={true}
							ariaLabel={isDefaultMint(mint.url) ? $_('mint.settings.default') : 'Mint'}
						/>
					{/snippet}
					{#snippet trailing()}
						<div class="mint-actions">
							{#if isDefaultMint(mint.url)}
								<Badge variant="info" size="sm">{$_('mint.settings.default')}</Badge>
							{/if}
							{#if !isDefaultMint(mint.url)}
								<Button
									variant="ghost"
									size="sm"
									ariaLabel={$_('mint.settings.remove') + ' ' + mint.url}
									onclick={(e: MouseEvent) => {
										e.stopPropagation();
										handleRemoveMint(mint);
									}}
								>
									{#snippet children()}{$_('mint.settings.remove')}{/snippet}
								</Button>
							{/if}
						</div>
					{/snippet}
				</ListItem>
			{/each}
		{/if}
	</div>
</div>

<!-- Add Mint Modal -->
<Modal
	open={showAddModal}
	onclose={closeAddModal}
	title={$_('mint.settings.add')}
	variant="dialog"
>
	{#snippet children()}
		<div class="add-mint-form">
			<Input
				type="text"
				label={$_('mint.settings.url')}
				placeholder="https://..."
				value={addUrl}
				error={addUrlError || validateError}
				oninput={handleUrlInput}
				autocomplete="off"
			/>

			{#if !validatedConfig && !validating}
				<div class="modal-actions">
					<Button
						variant="secondary"
						size="md"
						onclick={closeAddModal}
					>
						{#snippet children()}{$_('common.cancel')}{/snippet}
					</Button>
				<Button
					variant="primary"
					size="md"
					onclick={handleValidate}
				>
						{#snippet children()}{$_('mint.settings.validate')}{/snippet}
					</Button>
				</div>
			{/if}

			{#if validating}
				<div class="validating-state">
					<Badge variant="warning" size="md">{$_('mint.settings.validating')}</Badge>
				</div>
			{/if}

			{#if validatedConfig}
				<Card variant="basic" padding="sm">
					<div class="validated-info">
						<p class="validated-name"><strong>{validatedConfig.name || validatedConfig.url}</strong></p>
						{#if validatedConfig.version}
							<p class="validated-version">{$_('mint.settings.version')}: {validatedConfig.version}</p>
						{/if}
						{#if validatedNuts.length > 0}
							<div class="validated-nuts">
								<span class="nuts-label">{$_('mint.settings.supportedNuts')}:</span>
								{#each validatedNuts as nut}
									<Badge variant="default" size="sm">NUT-{nut}</Badge>
								{/each}
							</div>
						{/if}
					</div>
				</Card>
				<div class="modal-actions">
					<Button
						variant="secondary"
						size="md"
						onclick={closeAddModal}
					>
						{#snippet children()}{$_('common.cancel')}{/snippet}
					</Button>
					<Button
						variant="primary"
						size="md"
						onclick={handleSaveMint}
						loading={saving}
					>
						{#snippet children()}{$_('mint.settings.addMint')}{/snippet}
					</Button>
				</div>
			{/if}
		</div>
	{/snippet}
</Modal>

<style>
	.mint-settings {
		padding: var(--space-md);
		display: flex;
		flex-direction: column;
		gap: var(--space-md);
		max-width: 600px;
		margin: 0 auto;
	}

	.error-text {
		color: var(--color-error);
		margin: 0;
		font-size: var(--font-size-sm);
	}

	.active-mint-header {
		margin-bottom: var(--space-sm);
	}

	.mint-name-row {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		flex-wrap: wrap;
		margin-bottom: var(--space-xs);
	}

	.mint-name {
		font-size: var(--font-size-lg);
		font-weight: var(--font-weight-semibold);
		margin: 0;
		color: var(--color-text);
	}

	.mint-url {
		font-size: var(--font-size-sm);
		color: var(--color-text-secondary);
		margin: 0;
		word-break: break-all;
	}

	.mint-details {
		display: flex;
		flex-direction: column;
		gap: var(--space-sm);
		margin-top: var(--space-sm);
		padding-top: var(--space-sm);
		border-top: 1px solid var(--color-divider);
	}

	.detail-row {
		display: flex;
		align-items: flex-start;
		gap: var(--space-sm);
	}

	.detail-label {
		font-size: var(--font-size-sm);
		color: var(--color-text-secondary);
		min-width: 100px;
		flex-shrink: 0;
	}

	.detail-value {
		font-size: var(--font-size-sm);
		color: var(--color-text);
	}

	.nuts-list {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
	}

	.add-mint-section {
		display: flex;
		justify-content: center;
		padding: var(--space-sm) 0;
	}

	.mint-list {
		display: flex;
		flex-direction: column;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		overflow: hidden;
		background: var(--color-surface);
	}

	.mint-list :global(.list-item) {
		border-bottom: 1px solid var(--color-divider);
	}

	.mint-list :global(.list-item:last-child) {
		border-bottom: none;
	}

	.mint-actions {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
	}

	.empty-text {
		color: var(--color-text-secondary);
		font-size: var(--font-size-sm);
		text-align: center;
		margin: 0;
	}

	/* Modal form */
	.add-mint-form {
		display: flex;
		flex-direction: column;
		gap: var(--space-md);
	}

	.modal-actions {
		display: flex;
		justify-content: flex-end;
		gap: var(--space-sm);
		margin-top: var(--space-sm);
	}

	.validating-state {
		display: flex;
		justify-content: center;
		padding: var(--space-md);
	}

	.validated-info {
		display: flex;
		flex-direction: column;
		gap: var(--space-xs);
	}

	.validated-name {
		font-size: var(--font-size-md);
		margin: 0;
		color: var(--color-text);
	}

	.validated-version {
		font-size: var(--font-size-sm);
		color: var(--color-text-secondary);
		margin: 0;
	}

	.validated-nuts {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 4px;
	}

	.nuts-label {
		font-size: var(--font-size-sm);
		color: var(--color-text-secondary);
		margin-right: 4px;
	}
</style>
