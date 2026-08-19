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
	import Toggle from '$lib/components/ui/Toggle.svelte';

	// TASK-220: PIN entry (numpad) components — shared with Setup
	import Keypad from '$lib/components/Keypad.svelte';
	import PinDots from '$lib/components/PinDots.svelte';

	// TASK-050 Icons
	import Mint from '$lib/components/icons/Mint.svelte';
	import SettingsIcon from '$lib/components/icons/Settings.svelte';
	import ArrowRight from '$lib/components/icons/ArrowRight.svelte';
	import ArrowLeft from '$lib/components/icons/ArrowLeft.svelte';
	import Check from '$lib/components/icons/Check.svelte';

	// Mint Settings sub-page (F-042: Manage Mint routing)
	import MintSettings from '../routes/settings/mint/+page.svelte';

	// TASK-210: Auto-lock timer + timeout config
	// TASK-218: lockNow — manual "lock now" button
	import { getAutolockTimeout, setAutolockTimeout, startAutoLock, lockNow, AUTOLOCK_OPTIONS } from '$lib/wallet/autolock';

	// TASK-220: Change PIN flow + toast + error types
	import { showToast } from '$lib/stores/toast';
	import { changePin, deleteWallet } from '$lib/wallet/state';
	import { InvalidPinError, WalletNotInitializedError } from '$lib/wallet/errors';

	// TASK-265: Backup / Delete Wallet Data
	import { exportSeed } from '$lib/wallet/seed';
	import SeedGrid from '$lib/components/SeedGrid.svelte';

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
	// TASK-FIX-321: fee return badge toggle removed — always ON per Commander.

	// TASK-220: Change PIN modal state
	let showChangePin: boolean = $state(false);
	let currentPin: string = $state('');
	let newPin: string = $state('');
	let confirmNewPin: string = $state('');
	let changePinError: string = $state('');
	let changePinLoading: boolean = $state(false);
	// TASK-220: 3-step sequential numpad flow (mirrors Setup PIN-entry).
	const PIN_LENGTH = 4;
	let changePinStep: 1 | 2 | 3 = $state(1);
	let changePinShakeKey: number = $state(0);

	// TASK-220: step title + filled-dot count for the current numpad step.
	const changePinStepTitle = $derived(
		changePinStep === 1
			? $_('settings.change_pin.current_pin')
			: changePinStep === 2
				? $_('settings.change_pin.new_pin')
				: $_('settings.change_pin.confirm_new_pin')
	);

	const changePinDotsLength = $derived(
		changePinStep === 1
			? currentPin.length
			: changePinStep === 2
				? newPin.length
				: confirmNewPin.length
	);

	// Auto-lock timeout picker (bottom-sheet modal) — presentation state only.
	let showAutolockPicker: boolean = $state(false);

	$effect(() => {
		try {
			const settings = getSettings();
			currentLang = settings.language || 'en';
			currentTheme = settings.theme || 'system';
			pinShuffle = settings.pin_shuffle ?? false;
			// TASK-FIX-321: fee return setting removed — badge always ON.
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

	// Auto-lock timeout picker lifecycle (presentation glue only — reuses the
	// UNCHANGED handleAutoLockChange / setAutolockTimeout logic below).
	function openAutolockPicker() {
		showAutolockPicker = true;
	}

	function closeAutolockPicker() {
		showAutolockPicker = false;
	}

	function selectAutolockOption(option: number) {
		autoLockTimeout = option;
		handleAutoLockChange();
		showAutolockPicker = false;
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

	// TASK-FIX-321: fee return badge toggle removed — always ON per Commander.

	// TASK-220: Change PIN modal lifecycle.
	function openChangePin() {
		currentPin = '';
		newPin = '';
		confirmNewPin = '';
		changePinError = '';
		changePinLoading = false;
		changePinStep = 1;
		changePinShakeKey = 0;
		showChangePin = true;
	}

	function closeChangePin() {
		showChangePin = false;
		currentPin = '';
		newPin = '';
		confirmNewPin = '';
		changePinError = '';
		changePinStep = 1;
		changePinShakeKey = 0;
	}

	// TASK-220: Change PIN — verify current PIN (via changePin) + set new PIN ×2.
	// Validation + crypto logic unchanged. On mismatch/wrong-PIN we step back and
	// clear the relevant field so the user can retry the correct step.
	async function submitChangePin() {
		changePinError = '';
		if (newPin.length < 4) {
			changePinError = $_('screen.register.error_too_short');
			return;
		}
		if (newPin !== confirmNewPin) {
			changePinError = $_('screen.register.error_mismatch');
			// mismatch → back to step 2 (new PIN), clear new/confirm, shake.
			changePinStep = 2;
			newPin = '';
			confirmNewPin = '';
			changePinShakeKey += 1;
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
				// wrong current PIN → back to step 1, clear ALL fields, shake.
				changePinStep = 1;
				currentPin = '';
				newPin = '';
				confirmNewPin = '';
				changePinShakeKey += 1;
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

	// TASK-220: 3-step numpad digit entry (mirrors Setup.handlePinDigit).
	function handlePinDigit(digit: string) {
		changePinError = '';
		if (changePinLoading) return;
		if (changePinStep === 1) {
			if (currentPin.length >= PIN_LENGTH) return;
			currentPin += digit;
			if (currentPin.length === PIN_LENGTH) changePinStep = 2;
		} else if (changePinStep === 2) {
			if (newPin.length >= PIN_LENGTH) return;
			newPin += digit;
			if (newPin.length === PIN_LENGTH) changePinStep = 3;
		} else {
			if (confirmNewPin.length >= PIN_LENGTH) return;
			confirmNewPin += digit;
			if (confirmNewPin.length === PIN_LENGTH) void submitChangePin();
		}
	}

	// TASK-220: backspace — delete a digit; on an empty field, step back.
	function handlePinBackspace() {
		changePinError = '';
		if (changePinLoading) return;
		if (changePinStep === 1) {
			currentPin = currentPin.slice(0, -1);
		} else if (changePinStep === 2) {
			newPin = newPin.slice(0, -1);
			if (newPin.length === 0) changePinStep = 1;
		} else {
			confirmNewPin = confirmNewPin.slice(0, -1);
			if (confirmNewPin.length === 0) changePinStep = 2;
		}
	}

	// TASK-220: "←" step-back button (clears the step being left).
	function handleStepBack() {
		changePinError = '';
		if (changePinStep === 3) {
			changePinStep = 2;
			confirmNewPin = '';
		} else if (changePinStep === 2) {
			changePinStep = 1;
			newPin = '';
		}
	}

	// ─── TASK-265: Backup ────────────────────────────────────────

	// Backup modal state — PIN verify (phase 'pin') → SeedGrid (phase 'seed').
	let showBackup: boolean = $state(false);
	let backupPhase: 'pin' | 'seed' = $state('pin');
	let backupPin: string = $state('');
	let backupError: string = $state('');
	let backupLoading: boolean = $state(false);
	let backupSeed: string = $state('');
	let backupShakeKey: number = $state(0);

	const backupSeedWords = $derived(backupSeed.trim().split(/\s+/).filter(Boolean));

	function openBackup() {
		backupPhase = 'pin';
		backupPin = '';
		backupError = '';
		backupLoading = false;
		backupSeed = '';
		backupShakeKey = 0;
		showBackup = true;
	}

	function closeBackup() {
		showBackup = false;
		backupPin = '';
		backupError = '';
		backupLoading = false;
		backupSeed = '';
		backupPhase = 'pin';
		backupShakeKey = 0;
	}

	// Verify PIN via exportSeed → on success reveal the recovery phrase.
	// Seed is NEVER shown unless the correct PIN was provided first.
	async function submitBackupPin() {
		backupError = '';
		if (backupPin.length < PIN_LENGTH) {
			backupError = $_('screen.register.error_too_short');
			return;
		}
		backupLoading = true;
		try {
			const seed = await exportSeed(backupPin);
			backupSeed = seed;
			backupPhase = 'seed';
		} catch (e) {
			if (e instanceof InvalidPinError) {
				backupError = $_('settings.backup.wrong_pin');
			} else if (e instanceof WalletNotInitializedError) {
				backupError = e.message;
			} else if (e instanceof Error) {
				backupError = e.message;
			} else {
				backupError = $_('common.error');
			}
			backupPin = '';
			backupShakeKey += 1;
		} finally {
			backupLoading = false;
		}
	}

	function handleBackupPinDigit(digit: string) {
		backupError = '';
		if (backupLoading) return;
		if (backupPin.length >= PIN_LENGTH) return;
		backupPin += digit;
		if (backupPin.length === PIN_LENGTH) void submitBackupPin();
	}

	function handleBackupPinBackspace() {
		backupError = '';
		if (backupLoading) return;
		backupPin = backupPin.slice(0, -1);
	}

	// ─── TASK-265: Delete Wallet Data ───────────────────────────

	// Delete modal state — PIN verify (phase 'pin') → confirm (phase 'confirm').
	let showDelete: boolean = $state(false);
	let deletePhase: 'pin' | 'confirm' = $state('pin');
	let deletePin: string = $state('');
	let deleteError: string = $state('');
	let deleteLoading: boolean = $state(false);
	let deleteShakeKey: number = $state(0);

	function openDelete() {
		deletePhase = 'pin';
		deletePin = '';
		deleteError = '';
		deleteLoading = false;
		deleteShakeKey = 0;
		showDelete = true;
	}

	function closeDelete() {
		showDelete = false;
		deletePin = '';
		deleteError = '';
		deleteLoading = false;
		deletePhase = 'pin';
		deleteShakeKey = 0;
	}

	// Verify PIN (via exportSeed — reveals nothing, just verifies) before the
	// destructive confirm dialog can appear.
	async function submitDeletePin() {
		deleteError = '';
		if (deletePin.length < PIN_LENGTH) {
			deleteError = $_('screen.register.error_too_short');
			return;
		}
		deleteLoading = true;
		try {
			await exportSeed(deletePin);
			deletePhase = 'confirm';
		} catch (e) {
			if (e instanceof InvalidPinError) {
				deleteError = $_('settings.delete.wrong_pin');
			} else if (e instanceof Error) {
				deleteError = e.message;
			} else {
				deleteError = $_('common.error');
			}
			deletePin = '';
			deleteShakeKey += 1;
		} finally {
			deleteLoading = false;
		}
	}

	function handleDeletePinDigit(digit: string) {
		deleteError = '';
		if (deleteLoading) return;
		if (deletePin.length >= PIN_LENGTH) return;
		deletePin += digit;
		if (deletePin.length === PIN_LENGTH) void submitDeletePin();
	}

	function handleDeletePinBackspace() {
		deleteError = '';
		if (deleteLoading) return;
		deletePin = deletePin.slice(0, -1);
	}

	// Full wipe is permanent — only runs after PIN verify + explicit confirm.
	async function confirmDelete() {
		deleteError = '';
		deleteLoading = true;
		try {
			await deleteWallet();
			closeDelete();
			navigateTo('setup');
			if (typeof window !== 'undefined') {
				window.location.hash = '/setup';
			}
		} catch (e) {
			deleteError = e instanceof Error ? e.message : $_('common.error');
		} finally {
			deleteLoading = false;
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

		<!-- ─── PIN & Security Section (TASK-220) ──────────── -->
		<Card variant="basic" padding="md">
			<div class="section">
				<Heading level="h4">{$_('screen.settings.security_section')}</Heading>

				<!-- TASK-220: Change PIN -->
				<ListItem
					title={$_('settings.change_pin.title')}
					onclick={openChangePin}
				>
					{#snippet trailing()}
						<ArrowRight size={16} />
					{/snippet}
				</ListItem>

				<Divider />

				<!-- TASK-220: PIN keypad shuffle toggle (default off) -->
				<div class="toggle-row">
					<Toggle
						checked={pinShuffle}
						onchange={handlePinShuffleToggle}
						ariaLabel={$_('settings.pin_shuffle.title')}
					/>
					<div class="toggle-row-body">
						<Body size="sm" weight="semibold">{$_('settings.pin_shuffle.title')}</Body>
						<Body size="sm" color="secondary">{$_('settings.pin_shuffle.description')}</Body>
					</div>
				</div>
			</div>
		</Card>

		<!-- ─── TASK-FIX-321: Display Section removed (fee return badge always ON) ──── -->

		<!-- ─── Auto-lock Section (TASK-210) ───────────────── -->
		<Card variant="basic" padding="md">
			<div class="section">
				<Heading level="h4">{$_('screen.settings.autolock_section')}</Heading>
				<Body size="sm" color="secondary">{$_('screen.settings.autolock_description')}</Body>

				<ListItem
					title={$_('screen.settings.autolock_section')}
					onclick={openAutolockPicker}
				>
					{#snippet trailing()}
						<span class="autolock-value">
							{#if autoLockTimeout === 0}
								{$_('settings.autolock.never')}
							{:else}
								{autoLockTimeout} {$_('settings.autolock.minutes')}
							{/if}
						</span>
						<ArrowRight size={16} />
					{/snippet}
				</ListItem>

				{#if autoLockTimeout === 0}
					<p class="autolock-warning" role="alert">
						{$_('settings.autolock.warning')}
					</p>
				{/if}

				<!-- TASK-218: Manual "lock now" button -->
				<Button variant="secondary" onclick={handleLockNow} ariaLabel={$_('settings.lock_now')}>
					{#snippet children()}{$_('settings.lock_now')}{/snippet}
				</Button>
			</div>
		</Card>

		<!-- ─── Backup Section (TASK-265) ────────────────────── -->
		<Card variant="basic" padding="md">
			<div class="section">
				<Heading level="h4">{$_('settings.backup.title')}</Heading>
				<Body size="sm" color="secondary">{$_('settings.backup.description')}</Body>

				<ListItem
					title={$_('settings.backup.show_seed')}
					onclick={openBackup}
				>
					{#snippet trailing()}
						<ArrowRight size={16} />
					{/snippet}
				</ListItem>
			</div>
		</Card>

		<!-- ─── Delete Wallet Data Section (TASK-265) ──────── -->
		<Card variant="basic" padding="md">
			<div class="section">
				<Heading level="h4">{$_('settings.delete.title')}</Heading>
				<Button
					variant="secondary"
					onclick={openDelete}
					ariaLabel={$_('settings.delete.button')}
				>
					{#snippet children()}{$_('settings.delete.button')}{/snippet}
				</Button>
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

	<!-- TASK-210: Auto-lock timeout picker (bottom sheet) -->
	<Modal
		open={showAutolockPicker}
		onclose={closeAutolockPicker}
		variant="bottomsheet"
		title={$_('screen.settings.autolock_section')}
	>
		<div class="autolock-options" role="group" aria-label={$_('screen.settings.autolock_section')}>
			{#each AUTOLOCK_OPTIONS as option (option)}
				<button
					type="button"
					class="autolock-option-btn"
					class:active={autoLockTimeout === option}
					aria-pressed={autoLockTimeout === option}
					onclick={() => selectAutolockOption(option)}
				>
					<span>
						{#if option === 0}
							{$_('settings.autolock.never')}
						{:else}
							{option} {$_('settings.autolock.minutes')}
						{/if}
					</span>
					{#if autoLockTimeout === option}
						<Check size={18} />
					{/if}
				</button>
			{/each}
		</div>
	</Modal>

	<!-- TASK-220: Change PIN modal (3-step sequential numpad flow) -->
	<Modal open={showChangePin} onclose={closeChangePin} title={$_('settings.change_pin.title')}>
		<div class="change-pin-form">
			<!-- step header: back button (steps 2-3) + step indicator -->
			<div class="change-pin-step-header">
				{#if changePinStep > 1}
					<button
						type="button"
						class="change-pin-back"
						onclick={handleStepBack}
						aria-label={$_('common.back')}
					>
						<ArrowLeft size={20} />
					</button>
				{:else}
					<span class="change-pin-back-spacer" aria-hidden="true"></span>
				{/if}
				<Body size="sm" color="secondary">
					{$_('settings.change_pin.step_indicator', { values: { step: changePinStep, total: 3 } })}
				</Body>
				<span class="change-pin-back-spacer" aria-hidden="true"></span>
			</div>

			<Heading level="h4" align="center">{changePinStepTitle}</Heading>

			<div class="change-pin-entry">
				<PinDots
					length={changePinDotsLength}
					total={PIN_LENGTH}
					error={!!changePinError}
					shakeKey={changePinShakeKey}
				/>
				<Keypad
					onDigit={handlePinDigit}
					onBackspace={handlePinBackspace}
					disabled={changePinLoading}
					shuffle={pinShuffle}
				/>
			</div>

			{#if changePinError}
				<p class="change-pin-error" role="alert">{changePinError}</p>
			{/if}
		</div>
	</Modal>

	<!-- TASK-265: Backup modal — PIN verify → SeedGrid (12-word) -->
	<Modal open={showBackup} onclose={closeBackup} title={$_('settings.backup.title')}>
		<div class="backup-form">
			{#if backupPhase === 'pin'}
				<Body size="sm" color="secondary" align="center">
					{$_('settings.backup.verify_prompt')}
				</Body>
				<div class="change-pin-entry">
					<PinDots
						length={backupPin.length}
						total={PIN_LENGTH}
						error={!!backupError}
						shakeKey={backupShakeKey}
					/>
					<Keypad
						onDigit={handleBackupPinDigit}
						onBackspace={handleBackupPinBackspace}
						disabled={backupLoading}
						shuffle={pinShuffle}
					/>
				</div>
				{#if backupError}
					<p class="change-pin-error" role="alert">{backupError}</p>
				{/if}
			{:else}
				<!-- no-screenshot banner (reuses create-flow copy) -->
				<div class="no-screenshot-banner" role="note">
					<Body size="sm" weight="medium">{$_('recovery.warning.title')}</Body>
					<Body size="sm" color="secondary">{$_('recovery.warning.no_screenshot')}</Body>
				</div>
				<SeedGrid words={backupSeedWords} />
				<ul class="paper-warnings">
					<li><Body size="sm" color="secondary">{$_('recovery.warning.paper_only')}</Body></li>
					<li><Body size="sm" color="secondary">{$_('recovery.warning.never_share')}</Body></li>
					<li><Body size="sm" color="secondary">{$_('recovery.warning.anyone_access')}</Body></li>
					<li><Body size="sm" color="secondary">{$_('recovery.warning.lose_access')}</Body></li>
				</ul>
			{/if}
		</div>
	</Modal>

	<!-- TASK-265: Delete modal — PIN verify → confirm dialog (strong warning) -->
	<Modal open={showDelete} onclose={closeDelete} title={$_('settings.delete.title')}>
		<div class="backup-form">
			{#if deletePhase === 'pin'}
				<Body size="sm" color="secondary" align="center">
					{$_('settings.delete.verify_prompt')}
				</Body>
				<div class="change-pin-entry">
					<PinDots
						length={deletePin.length}
						total={PIN_LENGTH}
						error={!!deleteError}
						shakeKey={deleteShakeKey}
					/>
					<Keypad
						onDigit={handleDeletePinDigit}
						onBackspace={handleDeletePinBackspace}
						disabled={deleteLoading}
						shuffle={pinShuffle}
					/>
				</div>
				{#if deleteError}
					<p class="change-pin-error" role="alert">{deleteError}</p>
				{/if}
			{:else}
				<div class="delete-warning" role="alert">
					<Heading level="h4">{$_('settings.delete.confirm_title')}</Heading>
					<Body size="sm">{$_('settings.delete.warning')}</Body>
					<Body size="sm" color="secondary">{$_('settings.delete.confirm_body')}</Body>
				</div>
				{#if deleteError}
					<p class="change-pin-error" role="alert">{deleteError}</p>
				{/if}
				<div class="delete-actions">
					<Button variant="ghost" onclick={closeDelete} ariaLabel={$_('common.cancel')}>
						{#snippet children()}{$_('common.cancel')}{/snippet}
					</Button>
					<Button
						variant="primary"
						onclick={confirmDelete}
						loading={deleteLoading}
						ariaLabel={$_('settings.delete.confirm_button')}
					>
						{#snippet children()}{$_('settings.delete.confirm_button')}{/snippet}
					</Button>
				</div>
			{/if}
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
		background: var(--color-primary);
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

	/* Auto-lock timeout current value (trailing) */
	.autolock-value {
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-medium);
		color: var(--color-text-secondary);
	}

	.autolock-warning {
		margin: 0;
		font-size: var(--font-size-sm);
		color: var(--color-warning);
		line-height: var(--line-height-normal);
	}

	/* TASK-210: Auto-lock timeout picker (bottom-sheet options) */
	.autolock-options {
		display: flex;
		flex-direction: column;
		gap: var(--space-sm);
	}

	.autolock-option-btn {
		display: flex;
		align-items: center;
		justify-content: space-between;
		width: 100%;
		padding: var(--space-sm) var(--space-md);
		min-height: 44px;
		font-family: var(--font-family);
		font-size: var(--font-size-md);
		font-weight: var(--font-weight-medium);
		color: var(--color-text);
		background: var(--color-surface-variant);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		cursor: pointer;
		transition: all var(--transition-fast);
	}

	.autolock-option-btn:hover {
		background: var(--color-surface);
		border-color: var(--color-primary);
	}

	.autolock-option-btn.active {
		color: var(--color-primary-contrast);
		background: var(--color-primary);
		border-color: var(--color-primary);
	}

	.autolock-option-btn:focus-visible {
		outline: 2px solid var(--color-primary);
		outline-offset: 2px;
	}

	.detail-row {
		display: flex;
		justify-content: space-between;
	}

	/* TASK-220: PIN keypad shuffle toggle row */
	.toggle-row {
		display: flex;
		align-items: center;
		gap: var(--space-md);
		padding: var(--space-sm) 0;
	}

	.toggle-row-body {
		display: flex;
		flex-direction: column;
		gap: 2px;
		flex: 1;
		min-width: 0;
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

	.change-pin-step-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-sm);
	}

	.change-pin-back {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 36px;
		height: 36px;
		padding: 0;
		border: none;
		border-radius: var(--radius-full);
		background: transparent;
		color: var(--color-text-secondary);
		cursor: pointer;
		flex-shrink: 0;
	}

	.change-pin-back:hover,
	.change-pin-back:focus-visible {
		background: var(--color-surface-variant);
		color: var(--color-text);
	}

	.change-pin-back-spacer {
		width: 36px;
		flex-shrink: 0;
	}

	.change-pin-entry {
		display: flex;
		flex-direction: column;
		gap: var(--space-xs);
	}

	.bottom-spacer {
		height: 80px;
	}

	/* TASK-265: Backup / Delete modal forms */
	.backup-form {
		display: flex;
		flex-direction: column;
		gap: var(--space-sm);
		min-width: 280px;
	}

	.no-screenshot-banner {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: var(--space-sm) var(--space-md);
		background: var(--color-surface-variant);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
	}

	.paper-warnings {
		margin: 0;
		padding-left: var(--space-lg);
		display: flex;
		flex-direction: column;
		gap: var(--space-xs);
	}

	.delete-warning {
		display: flex;
		flex-direction: column;
		gap: var(--space-sm);
		padding: var(--space-md);
		background: rgba(211, 47, 47, 0.12);                                  /* fallback red #d32f2f */
		background: color-mix(in srgb, var(--color-error) 12%, transparent);
		border: 1px solid var(--color-error);
		border-radius: var(--radius-md);
	}

	.delete-actions {
		display: flex;
		gap: var(--space-sm);
		justify-content: flex-end;
		margin-top: var(--space-xs);
	}
</style>
