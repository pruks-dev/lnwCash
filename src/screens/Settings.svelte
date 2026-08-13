<script lang="ts">
	/**
	 * Settings Screen — grouped sections: Mint, Language, Theme, About
	 * Uses TASK-050: Card, Heading, Body, Divider, ListItem, Button, Icons
	 */
	import { _ } from 'svelte-i18n';
	import { locale } from 'svelte-i18n';
	import { getSettings, setSettings } from '$lib/storage/local';
	import { navigateTo } from '$lib/router';
	import { themeMode, setTheme } from '$lib/design/theme';
	import type { ThemeMode } from '$lib/types';

	// TASK-050 Design System Components
	import Card from '$lib/components/ui/Card.svelte';
	import Heading from '$lib/components/ui/Heading.svelte';
	import Body from '$lib/components/ui/Body.svelte';
	import Divider from '$lib/components/ui/Divider.svelte';
	import ListItem from '$lib/components/ui/ListItem.svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Input from '$lib/components/ui/Input.svelte';

	// TASK-050 Icons
	import Mint from '$lib/components/icons/Mint.svelte';
	import SettingsIcon from '$lib/components/icons/Settings.svelte';
	import ArrowRight from '$lib/components/icons/ArrowRight.svelte';
	import ArrowLeft from '$lib/components/icons/ArrowLeft.svelte';

	// Mint Settings sub-page (F-042: Manage Mint routing)
	import MintSettings from '../routes/settings/mint/+page.svelte';

	// TASK-210: Auto-lock timer + timeout config
	// TASK-218: lockNow — manual "lock now" button
	import { getAutolockTimeout, setAutolockTimeout, startAutoLock, lockNow, AUTOLOCK_OPTIONS } from '$lib/wallet/autolock';

	// TASK-220: Change PIN flow + toast + error types
	import { showToast } from '$lib/stores/toast';
	import { changePin } from '$lib/wallet/state';
	import { InvalidPinError, WalletNotInitializedError } from '$lib/wallet/errors';

	interface Props {
		onBack?: () => void;
	}

	let { onBack }: Props = $props();

	let currentLang: string = $state('en');
	let currentTheme: ThemeMode = $state('system');
	let showMintManage: boolean = $state(false); // F-042: sub-view for Manage Mint
	let autoLockTimeout: number = $state(5); // TASK-210: auto-lock timeout (minutes)
	// TASK-220: PIN keypad shuffle setting (persisted, default off).
	let pinShuffle: boolean = $state(false);

	// TASK-220: Change PIN modal state
	let showChangePin: boolean = $state(false);
	let currentPin: string = $state('');
	let newPin: string = $state('');
	let confirmNewPin: string = $state('');
	let changePinError: string = $state('');
	let changePinLoading: boolean = $state(false);

	$effect(() => {
		try {
			const settings = getSettings();
			currentLang = settings.language || 'en';
			currentTheme = settings.theme || 'system';
			pinShuffle = settings.pin_shuffle ?? false;
		} catch {
			currentLang = 'en';
			currentTheme = 'system';
			pinShuffle = false;
		}

		// TASK-210: initialise auto-lock from persisted config + arm the timer
		try {
			autoLockTimeout = getAutolockTimeout();
		} catch {
			autoLockTimeout = 5;
		}
		startAutoLock();
	});

	function switchLanguage(lang: string) {
		currentLang = lang;
		locale.set(lang);
		setSettings({ language: lang });
	}

	function switchTheme(theme: ThemeMode) {
		currentTheme = theme;
		setTheme(theme);
	}

	function handleAutoLockChange() {
		setAutolockTimeout(autoLockTimeout);
	}

	// TASK-218: Manual "lock now" — lock immediately + redirect home.
	function handleLockNow() {
		lockNow();
	}

	// TASK-220: PIN keypad shuffle toggle — persist via setSettings (default off).
	function handlePinShuffleToggle(e: Event) {
		pinShuffle = (e.target as HTMLInputElement).checked;
		setSettings({ pin_shuffle: pinShuffle });
	}

	// TASK-220: Change PIN modal lifecycle.
	function openChangePin() {
		currentPin = '';
		newPin = '';
		confirmNewPin = '';
		changePinError = '';
		changePinLoading = false;
		showChangePin = true;
	}

	function closeChangePin() {
		showChangePin = false;
		currentPin = '';
		newPin = '';
		confirmNewPin = '';
		changePinError = '';
	}

	// TASK-220: Change PIN — verify current PIN (via changePin) + set new PIN ×2.
	async function submitChangePin() {
		changePinError = '';
		if (newPin.length < 4) {
			changePinError = $_('screen.register.error_too_short');
			return;
		}
		if (newPin !== confirmNewPin) {
			changePinError = $_('screen.register.error_mismatch');
			return;
		}

		changePinLoading = true;
		try {
			// changePin re-encrypts the private key under the new PIN and throws
			// InvalidPinError if the current PIN is wrong (verification step).
			await changePin(currentPin, newPin);
			showToast($_('settings.change_pin.success'), 'success');
			closeChangePin();
		} catch (e) {
			if (e instanceof InvalidPinError) {
				changePinError = $_('settings.change_pin.wrong_pin');
			} else if (e instanceof WalletNotInitializedError) {
				changePinError = e.message;
			} else if (e instanceof Error) {
				changePinError = e.message;
			} else {
				changePinError = $_('common.error');
			}
		} finally {
			changePinLoading = false;
		}
	}

	// TASK-220: "forgot PIN" → seed recovery (Setup recover flow via hash param).
	function handleForgotPin() {
		navigateTo('setup');
		if (typeof window !== 'undefined') {
			window.location.hash = '/setup?recover=1';
		}
	}

	function handleBack() {
		onBack?.();
	}
</script>

<div class="settings-screen" role="main" aria-label={$_('screen.settings.title')}>

	{#if !showMintManage}
		<div class="top-bar">
			<button type="button" class="back-btn" onclick={handleBack} aria-label={$_('common.back')}>
				<ArrowLeft size={24} />
			</button>
			<Heading level="h2" align="center">{$_('screen.settings.title')}</Heading>
			<div class="top-spacer"></div>
		</div>
	{/if}

	{#if showMintManage}
		<!-- F-042: Mint Manage sub-view -->
		<div class="mint-manage-header">
			<button type="button" class="back-btn" onclick={() => { showMintManage = false; }} aria-label={$_('common.back')}>
				<ArrowLeft size={24} />
			</button>
			<Heading level="h2" align="center">{$_('screen.settings.mint_manage')}</Heading>
			<div class="top-spacer"></div>
		</div>
		<MintSettings />
	{:else}
		<!-- ─── Mint Section ──────────────────────────────── -->
		<Card variant="basic" padding="md">
			<div class="section">
				<Heading level="h4">{$_('screen.settings.mint_section')}</Heading>
				<Body size="sm" color="secondary">{$_('screen.settings.mint_description')}</Body>
				<ListItem
					title={$_('screen.settings.mint_manage')}
					onclick={() => { showMintManage = true; }}
				>
					{#snippet leading()}
						<Mint size={20} />
					{/snippet}
					{#snippet trailing()}
						<ArrowRight size={16} />
					{/snippet}
				</ListItem>
			</div>
		</Card>

		<!-- ─── Language Section ──────────────────────────── -->
		<Card variant="basic" padding="md">
			<div class="section">
				<Heading level="h4">{$_('screen.settings.language_section')}</Heading>
				<div class="option-row" role="group" aria-label={$_('screen.settings.language_section')}>
					<button
						type="button"
						class="option-btn"
						class:active={currentLang === 'th'}
						aria-pressed={currentLang === 'th'}
						onclick={() => switchLanguage('th')}
					>
						{$_('screen.language.th')}
					</button>
					<button
						type="button"
						class="option-btn"
						class:active={currentLang === 'en'}
						aria-pressed={currentLang === 'en'}
						onclick={() => switchLanguage('en')}
					>
						{$_('screen.language.en')}
					</button>
				</div>
			</div>
		</Card>

		<!-- ─── Theme Section ─────────────────────────────── -->
		<Card variant="basic" padding="md">
			<div class="section">
				<Heading level="h4">{$_('screen.settings.theme_section')}</Heading>
				<div class="option-row option-row-3" role="group" aria-label={$_('screen.settings.theme_section')}>
					<button
						type="button"
						class="option-btn"
						class:active={currentTheme === 'light'}
						aria-pressed={currentTheme === 'light'}
						onclick={() => switchTheme('light')}
					>
						{$_('screen.settings.theme_light')}
					</button>
					<button
						type="button"
						class="option-btn"
						class:active={currentTheme === 'dark'}
						aria-pressed={currentTheme === 'dark'}
						onclick={() => switchTheme('dark')}
					>
						{$_('screen.settings.theme_dark')}
					</button>
					<button
						type="button"
						class="option-btn"
						class:active={currentTheme === 'system'}
						aria-pressed={currentTheme === 'system'}
						onclick={() => switchTheme('system')}
					>
						{$_('screen.settings.theme_system')}
					</button>
				</div>
			</div>
		</Card>

		<!-- ─── Security Section (TASK-210 Auto-lock) ─────── -->
		<Card variant="basic" padding="md">
			<div class="section">
				<Heading level="h4">Auto-lock</Heading>
				<Body size="sm" color="secondary">Lock wallet automatically after inactivity</Body>
				<select
					class="autolock-select"
					aria-label="Auto-lock timeout"
					bind:value={autoLockTimeout}
					onchange={handleAutoLockChange}
				>
					{#each AUTOLOCK_OPTIONS as option}
						<option value={option}>
							{option === 0 ? 'Never' : `${option} min`}
						</option>
					{/each}
				</select>
				{#if autoLockTimeout === 0}
					<p class="autolock-warning">
						Warning: "Never" keeps your wallet unlocked until you lock it manually.
					</p>
				{/if}
				<!-- TASK-218: Manual "lock now" button -->
				<button
					type="button"
					class="lock-now-btn"
					onclick={handleLockNow}
					aria-label={$_('settings.lock_now')}
				>
					{$_('settings.lock_now')}
				</button>

				<Divider />

				<!-- TASK-220: Change PIN -->
				<ListItem
					title={$_('settings.change_pin.title')}
					onclick={openChangePin}
				>
					{#snippet trailing()}
						<ArrowRight size={16} />
					{/snippet}
				</ListItem>

				<!-- TASK-220: PIN keypad shuffle toggle (default off) -->
				<label class="shuffle-toggle">
					<input
						type="checkbox"
						class="shuffle-checkbox"
						checked={pinShuffle}
						onchange={handlePinShuffleToggle}
						aria-label={$_('settings.pin_shuffle.title')}
					/>
					<span class="shuffle-toggle-body">
						<Body size="sm" weight="semibold">{$_('settings.pin_shuffle.title')}</Body>
						<Body size="sm" color="secondary">{$_('settings.pin_shuffle.description')}</Body>
					</span>
				</label>
			</div>
		</Card>

		<!-- ─── About Section ─────────────────────────────── -->
		<Card variant="basic" padding="md">
			<div class="section">
				<Heading level="h4">{$_('screen.settings.about_section')}</Heading>
				<Body size="sm" color="secondary">{$_('screen.settings.about_description')}</Body>
				<Divider />
				<div class="about-details">
					<div class="detail-row">
						<Body size="sm" color="secondary">{$_('screen.settings.about_version')}</Body>
						<Body size="sm" weight="semibold">{import.meta.env.APP_VERSION}</Body>
					</div>
					<div class="detail-row">
						<Body size="sm" color="secondary">{$_('screen.settings.about_license')}</Body>
						<Body size="sm" weight="semibold">MIT</Body>
					</div>
				</div>
			</div>
		</Card>

		<div class="bottom-spacer"></div>
	{/if}

	<!-- TASK-220: Change PIN modal -->
	<Modal open={showChangePin} onclose={closeChangePin} title={$_('settings.change_pin.title')}>
		<div class="change-pin-form">
			<Input
				type="password"
				label={$_('settings.change_pin.current_pin')}
				value={currentPin}
				oninput={(e) => { currentPin = (e.target as HTMLInputElement).value; changePinError = ''; }}
				maxlength={6}
			/>
			<Input
				type="password"
				label={$_('settings.change_pin.new_pin')}
				value={newPin}
				oninput={(e) => { newPin = (e.target as HTMLInputElement).value; changePinError = ''; }}
				maxlength={6}
			/>
			<Input
				type="password"
				label={$_('settings.change_pin.confirm_new_pin')}
				value={confirmNewPin}
				oninput={(e) => { confirmNewPin = (e.target as HTMLInputElement).value; changePinError = ''; }}
				maxlength={6}
			/>

			{#if changePinError}
				<p class="change-pin-error" role="alert">{changePinError}</p>
			{/if}

			<div class="change-pin-actions">
				<Button variant="secondary" onclick={closeChangePin}>
					{#snippet children()}{$_('common.cancel')}{/snippet}
				</Button>
				<Button variant="primary" onclick={submitChangePin} loading={changePinLoading}>
					{#snippet children()}{$_('common.confirm')}{/snippet}
				</Button>
			</div>

			<button type="button" class="forgot-pin-link" onclick={handleForgotPin}>
				{$_('settings.change_pin.forgot_pin')}
			</button>
		</div>
	</Modal>
</div>

<style>
	.settings-screen {
		max-width: 480px;
		margin: 0 auto;
		padding: var(--space-md);
		display: flex;
		flex-direction: column;
		gap: var(--space-md);
	}

	.top-bar {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
	}

	.top-bar :global(h2) {
		flex: 1;
	}

	.top-spacer {
		width: 40px;
	}

	.mint-manage-header {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		margin-bottom: var(--space-sm);
	}

	.mint-manage-header :global(h2) {
		flex: 1;
	}

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
	}

	.back-btn:hover,
	.back-btn:focus-visible {
		background: var(--color-surface-variant);
	}

	.section {
		display: flex;
		flex-direction: column;
		gap: var(--space-sm);
	}

	/* Language/Theme Toggle */
	.option-row {
		display: flex;
		gap: 0;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		overflow: hidden;
	}

	.option-btn {
		flex: 1;
		padding: var(--space-sm) var(--space-md);
		font-family: var(--font-family);
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-medium);
		color: var(--color-text-secondary);
		background: var(--color-surface-variant);
		border: none;
		cursor: pointer;
		transition: all var(--transition-fast);
	}

	.option-btn.active {
		color: var(--color-primary-contrast);
		background: var(--color-primary-dark);
	}

	.option-btn:hover:not(.active) {
		background: var(--color-surface);
	}

	.option-btn:focus-visible {
		outline: 2px solid var(--color-primary);
		outline-offset: -2px;
		z-index: 1;
	}

	/* About Details */
	.about-details {
		display: flex;
		flex-direction: column;
		gap: var(--space-sm);
	}

	/* TASK-210: Auto-lock timeout dropdown */
	.autolock-select {
		width: 100%;
		padding: var(--space-sm) var(--space-md);
		font-family: var(--font-family);
		font-size: var(--font-size-md);
		color: var(--color-text);
		background: var(--color-surface-variant);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		cursor: pointer;
		transition: border-color var(--transition-fast);
	}

	.autolock-select:focus-visible {
		outline: 2px solid var(--color-primary);
		outline-offset: -2px;
	}

	.autolock-warning {
		margin: 0;
		font-size: var(--font-size-sm);
		color: var(--color-warning);
		line-height: var(--line-height-normal);
	}

	/* TASK-218: Manual "lock now" button */
	.lock-now-btn {
		width: 100%;
		padding: var(--space-sm) var(--space-md);
		font-family: var(--font-family);
		font-size: var(--font-size-md);
		font-weight: var(--font-weight-semibold);
		color: var(--color-primary-contrast);
		background: var(--color-primary);
		border: none;
		border-radius: var(--radius-md);
		cursor: pointer;
		min-height: 44px;
		transition: all var(--transition-fast);
	}

	.lock-now-btn:hover:not(:disabled) {
		background: var(--color-primary-hover);
	}

	.lock-now-btn:active:not(:disabled) {
		transform: scale(0.97);
	}

	.lock-now-btn:focus-visible {
		outline: 2px solid var(--color-primary);
		outline-offset: 2px;
	}

	.detail-row {
		display: flex;
		justify-content: space-between;
	}

	/* TASK-220: PIN keypad shuffle toggle */
	.shuffle-toggle {
		display: flex;
		align-items: flex-start;
		gap: var(--space-sm);
		padding: var(--space-sm) 0;
		cursor: pointer;
	}

	.shuffle-checkbox {
		margin-top: 3px;
		width: 20px;
		height: 20px;
		accent-color: var(--color-primary);
		cursor: pointer;
		flex-shrink: 0;
	}

	.shuffle-toggle-body {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	/* TASK-220: Change PIN modal */
	.change-pin-form {
		display: flex;
		flex-direction: column;
		gap: var(--space-sm);
		min-width: 280px;
	}

	.change-pin-error {
		margin: 0;
		font-size: var(--font-size-sm);
		color: var(--color-error);
	}

	.change-pin-actions {
		display: flex;
		justify-content: flex-end;
		gap: var(--space-sm);
		margin-top: var(--space-sm);
	}

	.forgot-pin-link {
		align-self: center;
		padding: var(--space-xs) var(--space-sm);
		background: none;
		border: none;
		color: var(--color-primary);
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-medium);
		cursor: pointer;
		text-decoration: underline;
	}

	.forgot-pin-link:hover,
	.forgot-pin-link:focus-visible {
		color: var(--color-primary-dark);
	}

	.bottom-spacer {
		height: 80px;
	}
</style>
