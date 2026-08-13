<script lang="ts">
	import { _ } from 'svelte-i18n';
	import Modal from '$lib/components/ui/Modal.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Input from '$lib/components/ui/Input.svelte';
	import { unlockWallet } from '$lib/wallet/state';
	import { InvalidPinError } from '$lib/wallet/errors';
	import {
		getLockoutStatus,
		recordFailure,
		recordSuccess,
		type LockoutStatus
	} from '$lib/wallet/lockout';

	interface Props {
		open: boolean;
		onunlock: () => void;
		oncancel: () => void;
	}

	let { open, onunlock, oncancel }: Props = $props();

	let pin: string = $state('');
	let error: string = $state('');
	let loading: boolean = $state(false);
	let lockUntil: number = $state(0);
	let lockLevel: 'soft' | 'hard' = $state('soft');
	let nowTick: number = $state(Date.now());

	// Lockout state (derived from lockUntil + ticking clock).
	const remainingMs = $derived(Math.max(0, lockUntil - nowTick));
	const locked = $derived(remainingMs > 0);
	const countdownLabel = $derived(formatCountdown(remainingMs));

	function formatCountdown(ms: number): string {
		const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
		const minutes = Math.floor(totalSeconds / 60);
		const seconds = totalSeconds % 60;
		return `${minutes}:${seconds.toString().padStart(2, '0')}`;
	}

	function applyLockoutStatus(status: LockoutStatus) {
		lockUntil = status.locked ? status.lockUntil : 0;
		lockLevel = status.level === 'hard' ? 'hard' : 'soft';
		nowTick = Date.now();
	}

	async function refreshLockout() {
		try {
			applyLockoutStatus(await getLockoutStatus());
		} catch {
			// Fail open — cannot determine lockout; the submit path re-checks.
		}
	}

	// Re-check lockout whenever the unlock surface opens.
	$effect(() => {
		if (open) {
			refreshLockout();
		}
	});

	// Live countdown tick while locked out.
	$effect(() => {
		if (!open || lockUntil <= 0) return;
		const timer = setInterval(() => {
			nowTick = Date.now();
			if (nowTick >= lockUntil) {
				lockUntil = 0;
			}
		}, 1000);
		return () => clearInterval(timer);
	});

	async function handleSubmit() {
		loading = true;
		error = '';
		try {
			// F-027-002: block unlock attempts while rate-limited.
			const status = await getLockoutStatus();
			if (status.locked) {
				applyLockoutStatus(status);
				return;
			}
			if (pin.length < 4) {
				error = $_('screen.register.error_pin_length');
				return;
			}
			await unlockWallet(pin);
			pin = '';
			await recordSuccess();
			onunlock();
		} catch (e) {
			if (e instanceof InvalidPinError) {
				const status = await recordFailure();
				applyLockoutStatus(status);
				if (!status.locked) {
					error = $_('screen.register.error_wrong_pin');
				}
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

		{#if locked}
			<p class="unlock-locked" role="alert" aria-live="polite">
				{lockLevel === 'hard'
					? $_('unlock.locked_hard', { values: { time: countdownLabel } })
					: $_('unlock.locked_soft', { values: { time: countdownLabel } })}
			</p>
		{/if}

		<Input
			type="password"
			placeholder="PIN"
			value={pin}
			oninput={(e) => (pin = (e.target as HTMLInputElement).value)}
			maxlength={4}
			disabled={locked}
		/>

		{#if error && !locked}
			<p class="unlock-error">{error}</p>
		{/if}

		<div class="unlock-actions">
			<Button variant="secondary" onclick={handleCancel}>
				{$_('common.cancel')}
			</Button>
			<Button variant="primary" onclick={handleSubmit} disabled={loading || locked}>
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
	.unlock-locked {
		color: var(--color-warning, var(--color-error));
		font-size: var(--text-sm);
		margin: 0;
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
