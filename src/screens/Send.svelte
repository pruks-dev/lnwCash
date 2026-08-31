<script lang="ts">
	/**
	 * Send Screen — TASK-066 Complete Redesign
	 *
	 * Two tabs: Lightning (invoice payment) + Cashu (token creation)
	 *
	 * Lightning tab flow:
	 *   idle → paste invoice → auto-validate → preview amount + description
	 *   → check fee (loading) → display fee + total → confirm button (red/orange)
	 *   → confirmation dialog → full-screen sending → success
	 *
	 * Cashu tab flow:
	 *   idle → enter amount (numpad) → preview → create token (loading)
	 *   → display token + copy → success
	 *
	 * All UI states: idle, validating, fee-calculating, confirming, sending, success, error
	 */
	import { _ } from 'svelte-i18n';
	import { onMount } from 'svelte';
	import { scannedQRValue } from '$lib/stores/scannedQR';
	import { meltFlow, type MeltResult } from '$lib/wallet/melt';
	// TASK-218: wrap melt in a transaction guard so auto-lock defers mid-melt
	import { withTransactionGuard } from '$lib/wallet/autolock';
	import { sendTokens, type SendResult } from '$lib/wallet/transfer';
	import { InsufficientFundsError, WalletLockedError } from '$lib/wallet/errors';
	import { requestMeltQuote, CashuError } from '$lib/cashu/client';
	import { getBalance, getBalanceByMint } from '$lib/wallet/balance';
	import { navigateTo, getHashParam, clearHashParams } from '$lib/router';
	import { getMintConfig } from '$lib/wallet/store';
	import { decodeBolt11, isValidBolt11, type Bolt11Decoded, type Bolt11Error } from '$lib/wallet/bolt11';
	// TASK-280: LNURL-pay + lightning address resolver (TASK-279)
	import {
		isLightningAddress,
		parseLightningAddress,
		resolveLightningAddress,
		resolveLnurl,
		requestLnurlInvoice,
		msatToSat,
		satToMsat,
		LnurlError,
		type LnurlPayInfo
	} from '$lib/wallet/lnurl';

	import Card from '$lib/components/ui/Card.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import Heading from '$lib/components/ui/Heading.svelte';
	import Body from '$lib/components/ui/Body.svelte';
	import Toast from '$lib/components/ui/Toast.svelte';
	import Numpad from '$lib/components/Numpad.svelte';
	import QRDisplay from '$lib/components/QRDisplay.svelte';
	import AnimatedQR from '$lib/components/AnimatedQR.svelte';
	import UnlockPrompt from '../components/UnlockPrompt.svelte';

	import SendIcon from '$lib/components/icons/Send.svelte';
	import Check from '$lib/components/icons/Check.svelte';
	import Time from '$lib/components/icons/Time.svelte';
	import ArrowLeft from '$lib/components/icons/ArrowLeft.svelte';
	import Close from '$lib/components/icons/Close.svelte';

	// TASK-159 Iconly wrapper — unified icon system
	import Iconly from '$lib/iconly/Iconly.svelte';

	interface Props {
		defaultMintUrl?: string;
		onQRScan?: () => void;
	}

	let { defaultMintUrl = '', onQRScan }: Props = $props();

	// ─── Tab state ───────────────────────────────────────────
	type TabKey = 'lightning' | 'cashu';
	let activeTab: TabKey = $state('lightning');

	// ─── Lightning state ─────────────────────────────────────
	type LightningState = 'idle' | 'validating' | 'fee-calculating' | 'confirming' | 'sending' | 'success' | 'error';
	let lightningState: LightningState = $state('idle');
	function isLightningDisabled(): boolean {
		const s: LightningState = lightningState;
		return s === 'sending' || s === 'fee-calculating';
	}
	/**
	 * TASK-FIX-iter5: strip URI scheme prefix (lightning:/bitcoin:) from raw
	 * input so the textarea reflects the canonical form and `detectInputType`
	 * matches the underlying bolt11 / lnurl / lightning-address. Applied at
	 * every entry point that receives user-supplied raw text.
	 */
	function stripInputPrefix(s: string): string {
		return s.replace(/^(lightning:|bitcoin:)/i, '');
	}
	let lightningInvoiceInput: string = $state('');
	let lightningInvoiceAmount: number = $state(0);
	let lightningInvoiceDesc: string = $state('');
	let lightningInvoiceValid: boolean = $state(false);
	let lightningFee: number = $state(0);
	let lightningTotal: number = $state(0);
	let lightningError: string = $state('');
	let lightningResult: MeltResult | null = $state(null);
	let showConfirmDialog: boolean = $state(false);
	let displaySpentAmount: number = $state(0);
	let paidInvoiceAmount: number = $state(0);
	let paidFee: number = $state(0);
	let mintUrl: string = $state('');
	// TASK-297: DOM ref for the invoice textarea — used to focus it when the
	// Send button is pressed on empty/unknown input (no-op otherwise).
	let invoiceTextarea: HTMLTextAreaElement | undefined = $state();

	// ─── LNURL / Lightning address state (TASK-280) ─────────
	// Sub-flow runs inside the Lightning tab. It shares `lightningState`
	// for the melt (sending/success/error) so the melt success UI is reused.
	type LnurlFlowState = 'idle' | 'resolving' | 'ready' | 'requesting' | 'error';
	let lnurlFlowState: LnurlFlowState = $state('idle');
	let lnurlPayInfo: LnurlPayInfo | null = $state(null);
	let lnurlCallback: string = $state('');
	let lnurlDomain: string = $state('');
	let lnurlDescription: string = $state('');
	let lnurlMinSat: number = $state(0);
	let lnurlMaxSat: number = $state(0);
	let lnurlCommentAllowed: number = $state(0);
	let lnurlAmount: string = $state('0');
	let lnurlComment: string = $state('');
	let lnurlInvoice: string = $state('');
	let lnurlError: string = $state('');
	let lastResolvedInput: string = $state('');

	// ─── Cashu state ─────────────────────────────────────────
	type CashuState = 'idle' | 'preview' | 'loading' | 'success' | 'error';
	let cashuState: CashuState = $state('idle');
	function isCashuDisabled(): boolean {
		const s: CashuState = cashuState;
		return s === 'loading';
	}
	let cashuAmount: string = $state('0');
	let cashuToken: string = $state('');
	let cashuError: string = $state('');
	let cashuSendResult: SendResult | null = $state(null);

	// ─── Toast ───────────────────────────────────────────────
	let toastMessage: string = $state('');
	let toastType: 'info' | 'success' | 'error' = $state('info');
	let toastVisible: boolean = $state(false);

	// TASK-092 (F-061): Unlock prompt state for wallet lock fallback
	let showUnlockPrompt: boolean = $state(false);
	let unlockPendingOp: (() => Promise<void>) | null = $state(null);

	function handleUnlockSuccess() {
		showUnlockPrompt = false;
		if (unlockPendingOp) {
			const retry = unlockPendingOp;
			unlockPendingOp = null;
			retry();
		}
	}

	function handleUnlockCancel() {
		showUnlockPrompt = false;
		unlockPendingOp = null;
		// Reset sending states so UI isn't stuck
		if (lightningState === 'sending') {
			lightningState = 'idle';
			showConfirmDialog = false;
		}
		if (cashuState === 'loading') {
			cashuState = 'idle';
		}
	}

	// F-066: Reactive mint URL subscription — propagates from App.svelte via props.
	// The old `!mintUrl` guard has been REMOVED. Now mintUrl always follows
	// defaultMintUrl so that Mint Settings switch immediately updates Send.
	$effect(() => {
		if (defaultMintUrl) {
			if (mintUrl && mintUrl !== defaultMintUrl) {
				// Show toast on mint switch
				try {
					const config = getMintConfig(defaultMintUrl);
					const name = config?.name || defaultMintUrl;
					showToast(`Switched to mint: ${name}`, 'info');
				} catch {
					showToast(`Switched to mint: ${defaultMintUrl}`, 'info');
				}
			}
			mintUrl = defaultMintUrl;
		}
	});

	// TASK-122: Read scanned QR value from shared store (QRScan → Send)
	// TASK-133 (F-V13-010): Also read invoice from URL hash params
	// TASK-280: also accept lightning address + lnurl bech32 from QR / hash
	onMount(() => {
		const unsub = scannedQRValue.subscribe((value) => {
			if (value) {
				const type = detectInputType(value);
				if (type !== 'unknown') {
					lightningInvoiceInput = value;
					scannedQRValue.set(null);
					// Auto-validate / auto-resolve the scanned value
					if (type === 'bolt11') {
						validateInvoiceSimple(value);
					} else {
						resolveLnurlInput(value);
					}
				}
			}
		});

		// TASK-133: Read invoice from URL hash params (#/send?invoice=...)
		const invoiceParam = getHashParam('invoice');
		if (invoiceParam) {
			lightningInvoiceInput = decodeURIComponent(invoiceParam);
			clearHashParams();
			// Auto-validate / auto-resolve the URL param
			const val = lightningInvoiceInput;
			const type = detectInputType(val);
			if (type === 'bolt11') {
				validateInvoiceSimple(val);
			} else if (type === 'lnurl' || type === 'lightning_address') {
				resolveLnurlInput(val);
			}
		}

		return unsub;
	});

	function showToast(message: string, type: 'info' | 'success' | 'error' = 'info') {
		toastMessage = message;
		toastType = type;
		toastVisible = true;
	}

	// ─── Thin wrapper: melt quote with unit (Nutshell compat) ─
	/**
	 * Thin wrapper over requestMeltQuote — includes `unit: "sat"` required by Nutshell.
	 */
	async function requestMeltQuoteWithUnit(mintUrl: string, invoice: string, amount?: number): Promise<{ quote: string; amount: number; fee_reserve: number; state: string }> {
		const url = `${mintUrl.replace(/\/+$/, '')}/v1/melt/quote/bolt11`;
		const body: Record<string, unknown> = { request: invoice, unit: 'sat' };
		if (amount !== undefined) body.amount = amount;
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), 15_000);
		try {
			const res = await fetch(url, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
				body: JSON.stringify(body),
				signal: controller.signal
			});
			if (!res.ok) {
				const errData = await res.json().catch(() => ({}));
				throw new CashuError(`HTTP ${res.status}: ${(errData as Record<string,unknown>).detail || res.statusText}`, res.status);
			}
			return await res.json() as { quote: string; amount: number; fee_reserve: number; state: string };
		} finally {
			clearTimeout(timeout);
		}
	}

	// ─── Error mapping: melt/token API errors → user-friendly ──
	function mapMeltError(error: unknown): string {
		if (error instanceof InsufficientFundsError) {
			return $_('screen.send.error_insufficient');
		}
		if (error instanceof CashuError) {
			if (error.status === 404) return $_('screen.send.error_melt_fail');
			if (error.status && error.status >= 500) return $_('screen.send.error_melt_fail');
			return $_('screen.send.error_melt_fail');
		}
		if (error instanceof Error) {
			const msg = error.message.toLowerCase();
			if (msg.includes('insufficient') || msg.includes('not enough'))
				return $_('screen.send.error_insufficient');
			if (msg.includes('fetch') || msg.includes('network') || msg.includes('unreachable'))
				return $_('screen.send.mint_unreachable');
			if (msg.includes('already spent'))
				return $_('screen.send.error_already_spent');
		}
		return $_('screen.send.error_melt_fail');
	}

	// ─── Balance refresh after send operations ───────────────
	async function refreshBalance(): Promise<number> {
		try {
			if (mintUrl.trim()) {
				return await getBalanceByMint(mintUrl.trim());
			}
			const bal = await getBalance();
			return bal.total;
		} catch {
			return 0;
		}
	}

	// ─── Lightning tab handlers ──────────────────────────────

	/** Reset Lightning-tab input state + any in-flight LNURL sub-flow. */
	function resetLightningInputState() {
		lightningInvoiceValid = false;
		lightningInvoiceAmount = 0;
		lightningInvoiceDesc = '';
		lightningFee = 0;
		lightningTotal = 0;
		lightningError = '';
		lightningState = 'idle';
		resetLnurlFlow();
	}

	/**
	 * TASK-290: typing does NOT auto-resolve a lightning address / lnurl —
	 * there is no checksum, so a partially-typed address (e.g. `user@dom`)
	 * always fails prematurely. Address/lnurl resolve now waits for Enter or
	 * paste. bolt11 (lnbc) keeps auto-validating because it has a checksum.
	 */
	function handleInvoiceInput(e: Event) {
		lightningInvoiceInput = (e.target as HTMLTextAreaElement).value;
		resetLightningInputState();

		// bolt11 auto-validates on input (unchanged); lnurl/address does NOT.
		const text = lightningInvoiceInput.trim();
		if (detectInputType(text) === 'bolt11') {
			validateInvoiceSimple(text);
		}
	}

	/**
	 * TASK-290: Enter resolves a lightning address / lnurl (preventDefault to
	 * avoid inserting a newline). bolt11 re-validates harmlessly (it already
	 * auto-validated on input).
	 */
	function handleInvoiceKeydown(e: KeyboardEvent) {
		if (e.key !== 'Enter') return;
		e.preventDefault();
		// TASK-FIX-iter5: strip scheme prefix before classify/resolve
		const raw = stripInputPrefix(lightningInvoiceInput);
		lightningInvoiceInput = raw;
		const text = raw.trim();
		const type = detectInputType(text);
		if (type === 'lnurl' || type === 'lightning_address') {
			resolveLnurlInput(text);
		} else if (type === 'bolt11') {
			validateInvoiceSimple(text);
		}
	}

	/**
	 * TASK-290: paste auto-resolves a lightning address / lnurl (a paste carries
	 * a complete address, unlike char-by-char typing). preventDefault so the
	 * follow-up `input` event does not reset the resolve we just kicked off.
	 */
	function handleInvoicePaste(e: ClipboardEvent) {
		const pasted = e.clipboardData?.getData('text/plain') ?? '';
		if (!pasted) return;
		e.preventDefault();
		// TASK-FIX-iter5: strip scheme prefix before writing back
		const stripped = stripInputPrefix(pasted);
		lightningInvoiceInput = stripped;
		resetLightningInputState();
		const text = stripped.trim();
		const type = detectInputType(text);
		if (type === 'bolt11') {
			validateInvoiceSimple(text);
		} else if (type === 'lnurl' || type === 'lightning_address') {
			resolveLnurlInput(text);
		}
	}

	/**
	 * TASK-297: unified "Send" button — shown always (except when the bolt11
	 * preview is active or a LNURL resolve has left idle). It dispatches by
	 * input type, superseding TASK-293's Resolve button (which was rendered
	 * only for lnurl / lightning address):
	 *   bolt11             → validateInvoiceSimple
	 *   lnurl / address    → resolveLnurlInput
	 *   unknown / empty    → no-op (focus the textarea so the user can type/paste)
	 */
	function handleSendClick() {
		// TASK-FIX-iter5: strip scheme prefix before classify/resolve
		const raw = stripInputPrefix(lightningInvoiceInput);
		lightningInvoiceInput = raw;
		const text = raw.trim();
		const type = detectInputType(text);
		if (type === 'bolt11') {
			validateInvoiceSimple(text);
		} else if (type === 'lnurl' || type === 'lightning_address') {
			resolveLnurlInput(text);
		} else {
			invoiceTextarea?.focus();
		}
	}

	/**
	 * F-062: Validate bolt11 invoice using full bech32 decoder.
	 * Validates checksum, extracts amount, description, and payment hash.
	 * Rejects invalid invoices early before melt flow.
	 */
	function validateInvoiceSimple(invoice: string) {
		lightningState = 'validating';

		const result = decodeBolt11(invoice);

		if ('code' in result) {
			// Invalid invoice — reject
			lightningError = $_('screen.send.error_invalid_invoice');
			lightningState = 'error';
			lightningInvoiceValid = false;
			return;
		}

		// Valid invoice — extract details
		lightningInvoiceAmount = result.amountSat;
		lightningInvoiceDesc = result.description || formatBolt11Summary(result);
		lightningInvoiceValid = true;
		lightningState = 'idle';
	}

	/** Format a brief summary from bolt11 decoded data */
	function formatBolt11Summary(decoded: Bolt11Decoded): string {
		const parts: string[] = [];
		if (decoded.amountSat > 0) {
			parts.push(`${formatSat(decoded.amountSat)} sat`);
		}
		if (decoded.paymentHash) {
			parts.push(`hash: ${decoded.paymentHash.substring(0, 8)}...`);
		}
		return parts.length > 0 ? parts.join(' — ') : decoded.hrp;
	}

	// ─── TASK-280: LNURL / lightning address flow ───────────

	type InputType = 'bolt11' | 'lnurl' | 'lightning_address' | 'unknown';

	/**
	 * Classify a pasted/scanned string:
	 *   - bolt11 invoice (lnbc / lntb / lnbcrt)
	 *   - lnurl bech32 (lnurl1...)
	 *   - lightning address (username@domain, no scheme)
	 *   - unknown
	 */
	function detectInputType(text: string): InputType {
		const trimmed = text.trim();
		if (!trimmed) return 'unknown';
		// bolt11/lnurl bech32 are case-insensitive (BIP-173 / BOLT-11 spec).
		// Use regex /i so uppercase LNBC1..., LnBc1..., etc. all match.
		// Lightning Address is case-sensitive (email-like) — pass original.
		if (/^ln(bc|tb|bcrt|sb)/i.test(trimmed)) {
			return 'bolt11';
		}
		if (/^lnurl/i.test(trimmed)) {
			return 'lnurl';
		}
		if (isLightningAddress(trimmed)) return 'lightning_address';
		return 'unknown';
	}

	function resetLnurlFlow() {
		lnurlFlowState = 'idle';
		lnurlPayInfo = null;
		lnurlCallback = '';
		lnurlDomain = '';
		lnurlDescription = '';
		lnurlMinSat = 0;
		lnurlMaxSat = 0;
		lnurlCommentAllowed = 0;
		lnurlAmount = '0';
		lnurlComment = '';
		lnurlInvoice = '';
		lnurlError = '';
		lastResolvedInput = '';
	}

	/** Map LNURL resolve/request errors to i18n messages. */
	function mapLnurlError(error: unknown, phase: 'resolve' | 'invoice'): string {
		if (error instanceof LnurlError) {
			if (error.code === 'invalid_tag') return $_('screen.send.lnaddr.error_tag');
			if (phase === 'invoice' && (error.code === 'invalid_response' || error.code === 'http_error')) {
				return $_('screen.send.lnaddr.error_invoice');
			}
			return $_('screen.send.lnaddr.error_resolve');
		}
		return phase === 'invoice'
			? $_('screen.send.lnaddr.error_invoice')
			: $_('screen.send.lnaddr.error_resolve');
	}

	/**
	 * Resolve a lightning address or lnurl bech32 → LnurlPayInfo.
	 * On success: populate description/domain/min/max and set state 'ready'.
	 * On failure: state 'error' with a clear i18n message.
	 */
	async function resolveLnurlInput(input: string): Promise<void> {
		if (input === lastResolvedInput && lnurlFlowState !== 'idle') return;
		const type = detectInputType(input);
		if (type !== 'lnurl' && type !== 'lightning_address') return;
		lastResolvedInput = input;
		lnurlFlowState = 'resolving';
		lnurlError = '';

		try {
			let domain = '';
			if (type === 'lightning_address') {
				const parsed = parseLightningAddress(input);
				if (!parsed) {
					lnurlError = $_('screen.send.lnaddr.error_resolve');
					lnurlFlowState = 'error';
					return;
				}
				domain = parsed.domain;
				const resolved = await resolveLightningAddress(parsed.username, parsed.domain);
				lnurlPayInfo = resolved.info;
				lnurlCallback = resolved.callbackUrl;
			} else {
				const resolved = await resolveLnurl(input);
				lnurlPayInfo = resolved.info;
				lnurlCallback = resolved.callbackUrl;
				// Derive display domain from the callback URL (validated http/https).
				try {
					domain = new URL(resolved.callbackUrl).hostname;
				} catch {
					domain = '';
				}
			}

			lnurlDomain = domain;
			// TASK-302 (HOT-FIX): ignore the server's metadata description — always
			// show "Pay to {address/domain}". lightning address → the user's input;
			// lnurl bech32 → the callback host (lnurlDomain state).
			lnurlDescription =
				type === 'lightning_address'
					? `${$_('screen.send.lnaddr.pay_to')} ${input.trim()}`
					: `${$_('screen.send.lnaddr.pay_to')} ${domain}`;
			lnurlMinSat = msatToSat(lnurlPayInfo.minSendable);
			lnurlMaxSat = msatToSat(lnurlPayInfo.maxSendable);
			lnurlCommentAllowed =
				typeof lnurlPayInfo.commentAllowed === 'number' ? lnurlPayInfo.commentAllowed : 0;
			lnurlFlowState = 'ready';
		} catch (err) {
			lnurlError = mapLnurlError(err, 'resolve');
			lnurlFlowState = 'error';
		}
	}

	/**
	 * Validate amount → request bolt11 invoice → verify → feed meltFlow.
	 * Reuses the exact same melt path (withTransactionGuard + WalletLockedError)
	 * as the bolt11 invoice flow.
	 */
	async function handleLnurlRequestInvoice(): Promise<void> {
		if (lnurlFlowState !== 'ready' && lnurlFlowState !== 'error') return;
		if (!lnurlPayInfo || !lnurlCallback) {
			lnurlError = $_('screen.send.lnaddr.error_resolve');
			lnurlFlowState = 'error';
			return;
		}

		const amountSatFloat = parseFloat(lnurlAmount);
		if (isNaN(amountSatFloat) || amountSatFloat <= 0) {
			lnurlError = $_('screen.send.lnaddr.error_no_amount');
			lnurlFlowState = 'error';
			return;
		}
		const amountSat = Math.floor(amountSatFloat);
		const amountMsat = satToMsat(amountSat);

		// amount_sat * 1000 ∈ [minSendable, maxSendable]
		if (amountMsat < lnurlPayInfo.minSendable || amountMsat > lnurlPayInfo.maxSendable) {
			lnurlError = $_('screen.send.lnaddr.error_min_max', {
				values: { min: formatSat(lnurlMinSat), max: formatSat(lnurlMaxSat) }
			});
			lnurlFlowState = 'error';
			return;
		}

		lnurlFlowState = 'requesting';
		lnurlError = '';

		try {
			const comment = lnurlCommentAllowed > 0 && lnurlComment.trim() !== '' ? lnurlComment.trim() : undefined;
			const pr = await requestLnurlInvoice(lnurlCallback, amountMsat, comment);

			// Verify the returned bolt11 invoice before feeding meltFlow.
			const decoded = decodeBolt11(pr);
			if ('code' in decoded) {
				lnurlError = $_('screen.send.lnaddr.error_invoice');
				lnurlFlowState = 'error';
				return;
			}
			if (decoded.amountSat > 0 && decoded.amountSat !== amountSat) {
				lnurlError = $_('screen.send.lnaddr.error_amount_mismatch');
				lnurlFlowState = 'error';
				return;
			}

			lnurlInvoice = pr;
			// Feed meltFlow — same path as bolt11 (reuse, do NOT modify melt.ts).
			await executeMelt(pr, amountSat);
			// Restore the retry-able state (on melt failure the shared success/error
			// UI takes over; this keeps the LNURL numpad enabled for a retry).
			lnurlFlowState = 'ready';
		} catch (err) {
			lnurlError = mapLnurlError(err, 'invoice');
			lnurlFlowState = 'error';
		}
	}

	async function handlePasteInvoice() {
		try {
			const text = await navigator.clipboard.readText();
			if (text) {
				// TASK-FIX-iter5: strip scheme prefix before writing back
				const stripped = stripInputPrefix(text);
				lightningInvoiceInput = stripped;
				const type = detectInputType(stripped);
				if (type === 'bolt11') {
					validateInvoiceSimple(stripped);
				} else if (type === 'lnurl' || type === 'lightning_address') {
					resolveLnurlInput(stripped);
				}
			}
		} catch {
			showToast($_('common.error_clipboard'), 'error');
		}
	}

	async function handleCheckFee() {
		if (!lightningInvoiceValid) return;
		if (!mintUrl.trim()) {
			lightningError = $_('common.error_mint_url_required');
			lightningState = 'error';
			return;
		}

		lightningState = 'fee-calculating';
		lightningError = '';

		try {
			// Call melt quote to get fee estimate — use thin wrapper with unit support (TASK-068)
			const quote = await requestMeltQuoteWithUnit(mintUrl.trim(), lightningInvoiceInput.trim(), lightningInvoiceAmount || undefined);
			lightningFee = quote.fee_reserve ?? 0;
			lightningTotal = (lightningInvoiceAmount || 1) + lightningFee;
			lightningState = 'idle';
		} catch (e) {
			// Fee check failed — still allow sending with estimated fee=0
			lightningFee = 0;
			lightningTotal = lightningInvoiceAmount || 1;
			lightningState = 'idle';
			if (e instanceof CashuError) {
				lightningError = $_('screen.send.error_melt_fail');
				lightningState = 'error';
			} else if (e instanceof Error && (e.message.includes('unreachable') || e.message.includes('fetch'))) {
				lightningError = $_('screen.send.mint_unreachable');
				lightningState = 'error';
			}
		}
	}

	function handleConfirmSend() {
		if (!lightningInvoiceValid && lightningInvoiceAmount <= 0) return;
		lightningState = 'confirming';
		showConfirmDialog = true;
	}

	function cancelConfirm() {
		showConfirmDialog = false;
		lightningState = lightningError ? 'error' : 'idle';
	}

	async function executeLightningSend() {
		await executeMelt(lightningInvoiceInput.trim(), lightningInvoiceAmount || 1);
	}

	/**
	 * TASK-280: Shared melt executor — reused by both the bolt11 invoice flow
	 * and the LNURL/lightning address flow. DO NOT modify melt.ts (reuse meltFlow).
	 */
	async function executeMelt(invoice: string, amountSat: number): Promise<void> {
		showConfirmDialog = false;
		lightningState = 'sending';
		lightningError = '';

		try {
			// TASK-218: withTransactionGuard defers auto-lock while the melt
			// is in flight so the wallet is never locked mid-transaction.
			const res = await withTransactionGuard(async () =>
				meltFlow(mintUrl.trim(), invoice, amountSat)
			);
			lightningResult = res;

			if (res.success) {
				// Refresh balance from IndexedDB after successful melt
				await refreshBalance();
				lightningState = 'success';
				displaySpentAmount = res.spentAmount;
				paidInvoiceAmount = amountSat;
				paidFee = res.feeReserve ?? 0;
				animateBalance(0, res.spentAmount);
				showToast($_('screen.send.success_payment'), 'success');
			} else {
				lightningError = res.error || $_('screen.send.error_melt_fail');
				lightningState = 'error';
				showToast(lightningError, 'error');
			}
		} catch (e) {
			// TASK-092 (F-061): Wallet lock fallback — show unlock prompt + retry
			if (e instanceof WalletLockedError) {
				lightningState = 'idle';
				showConfirmDialog = false;
				unlockPendingOp = () => executeMelt(invoice, amountSat);
				showUnlockPrompt = true;
				return;
			}
			lightningError = mapMeltError(e);
			lightningState = 'error';
			showToast(lightningError, 'error');
		}
	}

	function animateBalance(from: number, to: number) {
		const duration = 1000;
		const start = performance.now();
		function step(now: number) {
			const elapsed = now - start;
			const progress = Math.min(elapsed / duration, 1);
			const eased = 1 - Math.pow(1 - progress, 3);
			displaySpentAmount = Math.round(from + (to - from) * eased);
			if (progress < 1) {
				requestAnimationFrame(step);
			} else {
				displaySpentAmount = to;
			}
		}
		requestAnimationFrame(step);
	}

	function resetLightning() {
		lightningState = 'idle';
		lightningInvoiceInput = '';
		lightningInvoiceAmount = 0;
		lightningInvoiceDesc = '';
		lightningInvoiceValid = false;
		lightningFee = 0;
		lightningTotal = 0;
		lightningError = '';
		lightningResult = null;
		showConfirmDialog = false;
		displaySpentAmount = 0;
		paidInvoiceAmount = 0;
		paidFee = 0;
		resetLnurlFlow();
	}

	// ─── Cashu tab handlers ──────────────────────────────────

	function handleCashuAmountChange(value: string) {
		cashuAmount = value;
		cashuState = 'idle';
		cashuToken = '';
	}

	function handlePreviewToken() {
		const amount = parseFloat(cashuAmount);
		if (isNaN(amount) || amount <= 0) {
			cashuError = $_('screen.send.amount_required');
			cashuState = 'error';
			return;
		}
		cashuState = 'preview';
	}

	async function handleCreateToken() {
		const amount = parseFloat(cashuAmount);
		if (isNaN(amount) || amount <= 0) return;
		if (!mintUrl.trim()) {
			cashuError = $_('common.error_mint_url_required');
			cashuState = 'error';
			return;
		}

		cashuState = 'loading';
		cashuError = '';

		try {
			const result = await sendTokens(Math.floor(amount), mintUrl.trim());
			cashuSendResult = result;
			cashuToken = result.token;
			// Refresh balance after token creation (proofs were marked spent)
			await refreshBalance();
			cashuState = 'success';
			showToast($_('screen.send.token_created'), 'success');
		} catch (e) {
			// TASK-092 (F-061): Wallet lock fallback — show unlock prompt + retry
			if (e instanceof WalletLockedError) {
				cashuState = 'idle';
				unlockPendingOp = () => handleCreateToken();
				showUnlockPrompt = true;
				return;
			}
			cashuError = mapMeltError(e);
			cashuState = 'error';
			showToast(cashuError, 'error');
		}
	}

	function resetCashu() {
		cashuState = 'idle';
		cashuAmount = '0';
		cashuToken = '';
		cashuError = '';
		cashuSendResult = null;
	}

	function handleBack() {
		navigateTo('home');
	}

	function handleOkAndNavigate() {
		resetLightning();
		resetCashu();
		navigateTo('home');
	}

	function formatSat(amount: number): string {
		return new Intl.NumberFormat().format(amount);
	}
</script>

<div class="send-screen" role="main" aria-label={$_('screen.send.title')}>

	<!-- Header -->
	<div class="screen-header">
		<button type="button" class="back-btn" onclick={handleBack} aria-label={$_('common.back')}>
			<ArrowLeft size={24} />
		</button>
		<Heading level="h2">{$_('screen.send.title')}</Heading>
		<div class="header-spacer"></div>
	</div>

	<!-- Tabs -->
	<div class="tab-bar" role="tablist">
		<button
			type="button"
			role="tab"
			class="tab-btn"
			class:tab-active={activeTab === 'lightning'}
			aria-selected={activeTab === 'lightning'}
			onclick={() => activeTab = 'lightning'}
		>
			<Iconly name="Lightning" size={18} /> {$_('screen.send.tab_lightning')}
		</button>
		<button
			type="button"
			role="tab"
			class="tab-btn"
			class:tab-active={activeTab === 'cashu'}
			aria-selected={activeTab === 'cashu'}
			onclick={() => activeTab = 'cashu'}
		>
			<Iconly name="Banknote" size={18} /> {$_('screen.send.tab_cashu')}
		</button>
	</div>

	<!-- ══════════════════ LIGHTNING TAB ══════════════════ -->
	{#if activeTab === 'lightning'}
		<div class="tab-content" role="tabpanel">
			{#if lightningState === 'sending'}
				<div class="inline-sending" role="alert" aria-live="assertive">
					<div class="spinner-lg"></div>
					<Heading level="h3" align="center">{$_('screen.send.sending')}</Heading>
					<Body size="md" color="secondary">{$_('screen.send.do_not_close')}</Body>
				</div>
			{:else if lightningState === 'success'}
				<div class="success-expand">
					<Card variant="basic" padding="lg">
						<div class="success-section" data-flow="send-lightning">
							<span class="success-icon" aria-hidden="true">
								<Check size={64} />
							</span>
							<Heading level="h3" align="center">{$_('screen.send.success_title')}</Heading>
							<div class="spent-amount">
								<span class="spent-value">{formatSat(paidInvoiceAmount)}</span>
								<span class="spent-unit">{$_('screen.balance.sats')}</span>
							</div>
							<Body size="sm" color="secondary">
								{$_('screen.send.amount_sent', { values: { amount: formatSat(paidInvoiceAmount) } })}
							</Body>
							<div class="success-rows" role="list" aria-label={$_('screen.send.success_title')}>
								<!-- Row 1: Amount (always shown) -->
								<div class="success-row" role="listitem">
									<Body size="sm" color="secondary">{$_('screen.send.success_amount_label')}</Body>
									<Body size="sm" weight="semibold">
										{formatSat(paidInvoiceAmount)} {$_('screen.balance.sats')}
									</Body>
								</div>
								<!-- Row 2: Fee (conditional — only if fee > 0; combined: overpaid → fee_with_reserve, normal → fee) -->
								{#if paidFee > 0 && !(lightningResult?.actualFee != null && lightningResult?.feeReserve != null && lightningResult.actualFee < lightningResult.feeReserve)}
									<div class="success-row" role="listitem">
										<Body size="sm" color="secondary">{$_('screen.send.success_fee_label')}</Body>
										<Body size="sm" weight="semibold">
											{#if lightningResult?.actualFee != null && lightningResult?.feeReserve != null && lightningResult.actualFee < lightningResult.feeReserve}
												<!-- Overpaid (NUT-08): mint returned change, actualFee < feeReserve -->
												{$_('send.success.fee_with_reserve', {
													values: {
														actual: lightningResult.actualFee,
														reserve: lightningResult.feeReserve
													}
												})}
											{:else}
												<!-- Normal: show paidFee as sat amount -->
												{formatSat(paidFee)} {$_('screen.balance.sats')}
											{/if}
										</Body>
									</div>
									<!-- Row 3: Total (conditional — only if fee > 0) -->
									<div class="success-row" role="listitem">
										<Body size="sm" weight="semibold">{$_('screen.send.success_total_label')}</Body>
										<Body size="sm" weight="bold">
											{formatSat(paidInvoiceAmount + paidFee)} {$_('screen.balance.sats')}
										</Body>
									</div>
								{/if}
								<!-- Row 4: Preimage (conditional — only if preimage available) -->
								{#if lightningResult?.preimage}
									<div class="success-row" role="listitem">
										<Body size="sm" color="secondary">{$_('screen.send.success_preimage_label')}</Body>
										<div class="mono-text">
											<Body size="sm" weight="semibold" truncate>
												{lightningResult.preimage.substring(0, 16)}...
											</Body>
										</div>
									</div>
								{/if}
								<!-- Row 5: Time (always shown) -->
								<div class="success-row" role="listitem">
									<Body size="sm" color="secondary">{$_('screen.send.success_time_label')}</Body>
									<Body size="sm" weight="semibold">
										<Time size={14} />
										<span>{new Date().toLocaleTimeString()}</span>
									</Body>
								</div>
							</div>
							<button type="button" class="success-cta" onclick={handleOkAndNavigate}>
								{$_('common.ok')}
							</button>
						</div>
					</Card>
				</div>
			{:else}
				{#if lnurlFlowState === 'idle' || lnurlFlowState === 'error'}
					<Card variant="basic" padding="lg">
						<div class="paste-input-section">
							<Heading level="h3">{$_('screen.send.enter_invoice')}</Heading>
							<textarea
								class="paste-textarea"
								value={lightningInvoiceInput}
								bind:this={invoiceTextarea}
								oninput={handleInvoiceInput}
								onpaste={handleInvoicePaste}
								onkeydown={handleInvoiceKeydown}
							placeholder={$_('screen.send.invoice_placeholder')}
							rows={5}
							disabled={lightningState === 'fee-calculating'}
								aria-label={$_('screen.send.enter_invoice')}
							></textarea>
							<!-- ITER-5: reorder input section top→bottom:
							     textarea → Paste/QR → hint → Send (bottom-most). -->
							<div class="paste-input-actions">
								<Button variant="ghost" size="sm" onclick={handlePasteInvoice}>
									{#snippet children()}{$_('common.paste')}{/snippet}
								</Button>
								{#if onQRScan}
									<Button variant="ghost" size="sm" onclick={onQRScan}>
										{#snippet children()}<span class="scan-btn-content"><Iconly name="Scan" size={14} /> {$_('common.scan_qr')}</span>{/snippet}
									</Button>
								{/if}
							</div>
							<p class="paste-hint">{$_('screen.send.lnaddr.enter_hint')}</p>
							{#if !lightningInvoiceValid && lnurlFlowState === 'idle'}
								<Button
									variant="primary"
									size="md"
									onclick={handleSendClick}
									ariaLabel={$_('screen.send.lnaddr.send_button')}
								>
									{#snippet children()}{$_('screen.send.lnaddr.send_button')}{/snippet}
								</Button>
							{/if}
						</div>
					</Card>
				{/if}

				{#if lnurlFlowState !== 'idle'}
					{#if lnurlFlowState === 'resolving'}
						<Card variant="basic" padding="lg">
							<div class="loading-section">
								<div class="spinner-lg"></div>
								<Body size="md" color="secondary">{$_('screen.send.lnaddr.resolving')}</Body>
							</div>
						</Card>
					{:else if lnurlPayInfo}
						<!-- TASK-303 (HOT-FIX): ONE compact LNURL card — back + preview +
						     amount + numpad + comment merged into a single Card (was 3 cards
						     + standalone numpad). Layout (top→bottom): back → "Pay to" +
						     min/max (1 line) → amount display → numpad → comment (above
						     Request invoice) → Request invoice. All features kept. -->
						<Card variant="basic" padding="md">
							<div class="lnurl-card" data-flow="send-lnurl">
								<!-- TASK-287: back button. This branch is only reachable when
								     lnurlPayInfo is set, i.e. state ∈ {ready, requesting, error}
								     (the sibling `resolving` branch renders first, and the whole
								     block sits inside `{#if lnurlFlowState !== 'idle'}`), so it is
								     never shown while idle or resolving. -->
								<button
									type="button"
									class="lnaddr-back-btn"
									onclick={resetLnurlFlow}
									aria-label={$_('screen.send.lnaddr.back')}
								>
									<ArrowLeft size={16} />
									<span>{$_('screen.send.lnaddr.back')}</span>
								</button>
							<!-- TASK-304 (HOT-FIX rev23): 2-line LNURL preview — "Pay to …"
							     (prominent semibold, center) on top + min/max (small dim,
							     center) below. GAP between preview group and amount group. -->
							<div class="lnaddr-preview">
								{#if lnurlDescription}
									<span class="lnaddr-desc">{lnurlDescription}</span>
								{/if}
								{#if lnurlMinSat > 0 || lnurlMaxSat > 0}
									<span class="lnaddr-minmax">{formatSat(lnurlMinSat)}–{formatSat(lnurlMaxSat)} {$_('screen.balance.sats')}</span>
								{/if}
							</div>

								<div class="amount-section">
									<Body size="sm" color="secondary">{$_('screen.send.amount_label')}</Body>
									<div class="amount-display" aria-live="polite">
										<span class="amount-value">{lnurlAmount === '0' ? '0' : lnurlAmount}</span>
										<span class="amount-unit">{$_('screen.balance.sats')}</span>
									</div>
								</div>

								<Numpad
									value={lnurlAmount}
									onchange={(v) => { lnurlAmount = v; lnurlError = ''; }}
									onconfirm={handleLnurlRequestInvoice}
									confirmLabel={lnurlFlowState === 'requesting' ? $_('screen.send.lnaddr.requesting_invoice') : $_('screen.send.lnaddr.request_invoice')}
									disabled={lnurlFlowState === 'requesting'}
								>
									{#snippet children()}
										{#if lnurlCommentAllowed > 0}
											<div class="comment-section">
												<Body size="sm" color="secondary">{$_('screen.send.lnaddr.comment_label')}</Body>
												<input
													type="text"
													class="comment-input"
													value={lnurlComment}
													oninput={(e) => lnurlComment = (e.target as HTMLInputElement).value}
													maxlength={lnurlCommentAllowed}
													placeholder={$_('screen.send.lnaddr.comment_placeholder')}
													disabled={lnurlFlowState === 'requesting'}
													aria-label={$_('screen.send.lnaddr.comment_label')}
												/>
											</div>
										{/if}
									{/snippet}
								</Numpad>
							</div>
						</Card>
					{/if}

					{#if lnurlFlowState === 'error' && lnurlError}
						<div class="error-banner" role="alert">
							<Body size="sm">{lnurlError}</Body>
							<button type="button" class="error-close" onclick={() => { lnurlError = ''; lnurlFlowState = lnurlPayInfo ? 'ready' : 'idle'; }} aria-label="Dismiss">
								<Close size={16} />
							</button>
						</div>
					{/if}
				{:else if lightningInvoiceValid}
					<Card variant="basic" padding="md">
						<div class="preview-section">
							<div class="detail-row">
								<Body size="sm" color="secondary">{$_('screen.send.amount')}</Body>
								<Body size="sm" weight="semibold">{formatSat(lightningInvoiceAmount)} {$_('screen.balance.sats')}</Body>
							</div>
							{#if lightningInvoiceDesc}
								<div class="detail-row">
									<Body size="sm" color="secondary">{$_('screen.send.description')}</Body>
									<Body size="sm" weight="semibold" truncate>{lightningInvoiceDesc}</Body>
								</div>
							{/if}
						</div>
					</Card>

					{#if lightningFee > 0 || lightningState === 'fee-calculating'}
						<Card variant="basic" padding="md">
							<div class="fee-section">
								<div class="detail-row">
									<Body size="sm" color="secondary">{$_('screen.send.fee')}</Body>
									<Body size="sm" weight="semibold">
										{#if lightningState === 'fee-calculating'}
											<span class="fee-loading">...</span>
										{:else}
											{formatSat(lightningFee)} {$_('screen.balance.sats')}
										{/if}
									</Body>
								</div>
								{#if lightningTotal > 0 && lightningState !== 'fee-calculating'}
									<div class="detail-row detail-row-total">
										<Body size="md" weight="semibold">{$_('screen.send.total')}</Body>
										<span class="text-primary-total">
											<Body size="md" weight="bold">{formatSat(lightningTotal)} {$_('screen.balance.sats')}</Body>
										</span>
									</div>
								{/if}
							</div>
						</Card>
					{/if}

					<div class="action-buttons">
						<Button variant="ghost" size="md" onclick={handleCheckFee} loading={lightningState === 'fee-calculating'}>
							{#snippet children()}{$_('screen.send.check_fee')}{/snippet}
						</Button>
						<button
							type="button"
							class="send-confirm-btn"
							onclick={handleConfirmSend}
						>
							<SendIcon size={18} />
							{$_('screen.send.confirm_send')}
						</button>
					</div>
				{/if}

				{#if lightningState === 'error' && lightningError}
					<div class="error-banner" role="alert">
						<Body size="sm">{lightningError}</Body>
						<button type="button" class="error-close" onclick={() => lightningState = 'idle'} aria-label="Dismiss">
							<Close size={16} />
						</button>
					</div>
				{/if}
			{/if}
		</div>
	{/if}

	<!-- ══════════════════ CASHU TAB ═══════════════════════ -->
	{#if activeTab === 'cashu'}
		<div class="tab-content" role="tabpanel">
			{#if cashuState === 'idle' || cashuState === 'error' || cashuState === 'preview'}
				<Card variant="basic" padding="lg">
					<div class="amount-section">
						<Body size="sm" color="secondary">{$_('screen.send.amount_label')}</Body>
						<div class="amount-display" aria-live="polite">
							<span class="amount-value">{cashuAmount === '0' ? '0' : cashuAmount}</span>
							<span class="amount-unit">{$_('screen.balance.sats')}</span>
						</div>
					</div>
				</Card>

				<Numpad
					value={cashuAmount}
					onchange={handleCashuAmountChange}
					onconfirm={handlePreviewToken}
					confirmLabel={$_('screen.send.preview_token')}
					disabled={isCashuDisabled()}
				/>

				{#if cashuState === 'preview'}
					<Card variant="basic" padding="md">
						<div class="preview-details">
							<Body size="sm" color="secondary">
								{$_('screen.send.preview_token_msg', { values: { amount: cashuAmount } })}
							</Body>
							<div class="detail-row">
								<Body size="sm" color="secondary">{$_('screen.send.mint_url_label')}</Body>
								<Body size="sm" weight="semibold" truncate>{mintUrl}</Body>
							</div>
						</div>
						<div class="preview-actions">
							<Button variant="secondary" size="md" onclick={() => cashuState = 'idle'}>
								{#snippet children()}{$_('common.cancel')}{/snippet}
							</Button>
							<Button variant="primary" size="md" onclick={handleCreateToken}>
								{#snippet children()}{$_('screen.send.create_token')}{/snippet}
							</Button>
						</div>
					</Card>
				{/if}

				{#if cashuState === 'error' && cashuError}
					<div class="error-banner" role="alert">
						<Body size="sm">{cashuError}</Body>
						<button type="button" class="error-close" onclick={() => cashuState = 'idle'} aria-label="Dismiss">
							<Close size={16} />
						</button>
					</div>
				{/if}
			{/if}

			{#if cashuState === 'loading'}
				<div class="loading-section">
					<div class="spinner-lg"></div>
					<Body size="md" color="secondary">{$_('screen.send.creating_token')}</Body>
				</div>
			{/if}

			{#if cashuState === 'success' && cashuToken}
				<Card variant="basic" padding="lg">
					<div class="success-section" data-flow="send-cashu">
						<span class="success-icon" aria-hidden="true">
							<Check size={64} />
						</span>
						<Heading level="h3" align="center">{$_('screen.send.success_title')}</Heading>

						<!-- TASK-402 / NUT-16: Animated QR (UR fragments) for Cashu token at TOP.
						     Full cashuToken passed verbatim (NOT truncated) so UR encoder
						     receives the entire payload. Lightning invoice below still uses
						     the static QRDisplay. -->
						<div class="token-qr-top" aria-label={$_('screen.send.success_token_qr_caption')}>
							<AnimatedQR data={cashuToken} size={300} frameIntervalMs={200} />
						</div>

						<div class="token-display">
							<textarea
								readonly
								class="token-output"
								value={cashuToken}
								rows={3}
								aria-label={$_('screen.send.success_token_label')}
							></textarea>
						</div>

						<div class="success-rows" role="list" aria-label={$_('screen.send.success_title')}>
							<!-- Row 1: Amount (always shown) -->
							<div class="success-row" role="listitem">
								<Body size="sm" color="secondary">{$_('screen.send.success_amount_label')}</Body>
								<Body size="sm" weight="semibold">
									{formatSat(parseInt(cashuAmount) || 0)} {$_('screen.balance.sats')}
								</Body>
							</div>
							<!-- Row 2: Mint (always shown — using default mint url) -->
							<div class="success-row" role="listitem">
								<Body size="sm" color="secondary">{$_('screen.send.success_mint_label')}</Body>
								<Body size="sm" weight="semibold" truncate>{mintUrl}</Body>
							</div>
							<!-- Row 3: Proofs (conditional — only if count known) -->
							{#if cashuSendResult?.amount}
								<div class="success-row" role="listitem">
									<Body size="sm" color="secondary">{$_('screen.send.success_proofs_label')}</Body>
									<Body size="sm" weight="semibold">{formatSat(cashuSendResult.amount)} {$_('screen.balance.sats')}</Body>
								</div>
							{/if}
							<!-- Row 4: Token[Copy] (always shown) -->
							<div class="success-row" role="listitem">
								<Body size="sm" color="secondary">{$_('screen.send.success_token_label')}</Body>
								<Body size="sm" weight="semibold" truncate>
									{cashuToken.substring(0, 24)}...
								</Body>
							</div>
							<!-- Row 5: Time (always shown) -->
							<div class="success-row" role="listitem">
								<Body size="sm" color="secondary">{$_('screen.send.success_time_label')}</Body>
								<Body size="sm" weight="semibold">
									<Time size={14} />
									<span>{new Date().toLocaleTimeString()}</span>
								</Body>
							</div>
						</div>

						<button type="button" class="success-cta" onclick={handleOkAndNavigate}>
							{$_('common.ok')}
						</button>
					</div>
				</Card>
			{/if}
		</div>
	{/if}

	<!-- ══════════════════ CONFIRMATION DIALOG ══════════════ -->
	<Modal open={showConfirmDialog} onclose={cancelConfirm} ariaLabel={$_('screen.send.confirm_title')}>
		{#snippet children()}
			<div class="confirm-dialog">
				<Heading level="h3" align="center">{$_('screen.send.confirm_title')}</Heading>
				<div class="confirm-details">
					<div class="detail-row">
						<Body size="sm" color="secondary">{$_('screen.send.amount')}</Body>
						<Body size="sm" weight="semibold">{formatSat(lightningInvoiceAmount || 1)} {$_('screen.balance.sats')}</Body>
					</div>
					{#if lightningFee > 0}
						<div class="detail-row">
							<Body size="sm" color="secondary">{$_('screen.send.fee')}</Body>
							<Body size="sm" weight="semibold">{formatSat(lightningFee)} {$_('screen.balance.sats')}</Body>
						</div>
						<div class="detail-row detail-row-total">
							<Body size="md" weight="semibold">{$_('screen.send.total')}</Body>
							<span class="text-primary-total">
								<Body size="md" weight="bold">{formatSat(lightningTotal)} {$_('screen.balance.sats')}</Body>
							</span>
						</div>
					{/if}
				</div>
				<span class="text-error-warning">
					<Body size="sm" align="center" weight="semibold">
						<Iconly name="Warning" size={18} /> {$_('screen.send.irreversible_warning')}
					</Body>
				</span>
				<div class="confirm-actions">
					<Button variant="secondary" size="md" onclick={cancelConfirm}>
						{#snippet children()}{$_('common.cancel')}{/snippet}
					</Button>
					<button type="button" class="danger-btn" onclick={executeLightningSend}>
						{$_('screen.send.confirm_send_irreversible')}
					</button>
				</div>
			</div>
		{/snippet}
	</Modal>

	<!-- TASK-092 (F-061): Unlock Prompt — shown when wallet lock detected -->
	<UnlockPrompt
		open={showUnlockPrompt}
		onunlock={handleUnlockSuccess}
		oncancel={handleUnlockCancel}
	/>

	<!-- Toast -->
	<div class="toast-container">
		<Toast
			message={toastMessage}
			type={toastType}
			visible={toastVisible}
			onclose={() => toastVisible = false}
		/>
	</div>

	<div class="bottom-spacer"></div>
</div>

<style>
	.send-screen {
		max-width: 480px;
		margin: 0 auto;
		padding: var(--space-md);
		display: flex;
		flex-direction: column;
		gap: var(--space-md);
	}

	/* ─── Header ──────────────────────── */
	.screen-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-sm);
	}

	.back-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 44px;
		height: 44px;
		border: none;
		border-radius: var(--radius-full);
		background: var(--color-surface-variant);
		color: var(--color-text);
		cursor: pointer;
		transition: background var(--transition-fast);
		flex-shrink: 0;
	}

	.back-btn:hover { background: var(--color-border); }

	.back-btn:focus-visible {
		outline: 2px solid var(--color-primary);
		outline-offset: 2px;
	}

	.header-spacer { width: 44px; }

	/* ─── Tabs ────────────────────────── */
	.tab-bar {
		display: flex;
		gap: 0;
		border-radius: var(--radius-md);
		background: var(--color-surface-variant);
		padding: 3px;
	}

	.tab-btn {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-xs);
		padding: var(--space-sm) var(--space-md);
		border: none;
		border-radius: calc(var(--radius-md) - 2px);
		background: transparent;
		color: var(--color-text-secondary);
		font-family: var(--font-family);
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-medium);
		cursor: pointer;
		transition: all var(--transition-fast);
		-webkit-tap-highlight-color: transparent;
	}

	/* TASK-F-NEW-010: Active tab now uses a soft cyan background tint
	   (rgba 0,188,212 @ 12%) to mark the active state, instead of the
	   2px cyan bottom border from F-NEW-008. Text remains cyan, the
	   Iconly SVG inside inherits currentColor → automatically cyan too.
	   Dark theme variant uses a slightly stronger cyan 400 tint (18%). */
	.tab-active {
		background: rgba(0, 188, 212, 0.12);
		color: var(--color-primary);
		font-weight: var(--font-weight-semibold);
		box-shadow: var(--shadow-sm);
	}

	:global([data-theme='dark']) .tab-active {
		background: rgba(38, 198, 218, 0.18);
		color: var(--color-primary);   /* Cyan 400 on dark */
	}

	.tab-btn:focus-visible {
		outline: 2px solid var(--color-primary);
		outline-offset: 2px;
	}

	.tab-content {
		display: flex;
		flex-direction: column;
		gap: var(--space-md);
	}

	/* ─── Paste Input (ITER-5: unified with Receive.cashu-input-section) ─── */
	.paste-input-section {
		display: flex;
		flex-direction: column;
		/* ITER-5: tighter vertical gap 2px (Commander feedback). */
		gap: 2px;
	}

	.paste-textarea {
		width: 100%;
		margin-top: var(--space-sm);
		padding: var(--space-md);
		border: 1.5px solid var(--color-border);
		border-radius: var(--radius-md);
		font-family: var(--font-family-mono);
		font-size: var(--font-size-sm);
		color: var(--color-text);
		background: var(--color-surface);
		resize: vertical;
		line-height: var(--line-height-normal);
		transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
	}

	.paste-textarea:focus {
		outline: none;
		border-color: var(--color-primary);
		box-shadow: 0 0 0 3px rgba(0, 188, 212, 0.12);
	}

	/* TASK-F-NEW-008: Dark-theme focus halo — uses brighter cyan 400 (#26c6da) + slightly stronger alpha
	   Required :global() wrapper so vite-plugin-svelte does not tree-shake the dark variant. */
	:global([data-theme='dark']) .paste-textarea:focus {
		border-color: var(--color-primary);
		box-shadow: 0 0 0 3px rgba(38, 198, 218, 0.18);
	}

	.paste-textarea:disabled {
		background: var(--color-surface-variant);
		opacity: 0.7;
	}

	/* ITER-5: helper hint under the paste textarea (Enter to resolve) */
	.paste-hint {
		margin: 0;
		font-family: var(--font-family);
		font-size: var(--font-size-xs);
		color: var(--color-text-secondary);
		line-height: var(--line-height-normal);
	}

	.paste-input-actions {
		display: flex;
		gap: var(--space-sm);
		justify-content: flex-end;
	}

	.scan-btn-content {
		display: inline-flex;
		align-items: center;
		gap: 4px;
	}

	/* TASK-305 (HOT-FIX): single gap system — parent `gap` removed so spacing
	   is per-group and never stacked (fixes TASK-303/304 gap + margin stacking).
	   Per-group spacing (top→bottom):
	     back → preview   ~4px   (back sits close to preview)
	     preview → amount ~16px  (amount rises to center)
	     amount → numpad  ~8px   (numpad adds its own internal padding) */
	.lnurl-card {
		display: flex;
		flex-direction: column;
		gap: 0;
	}

	/* ─── LNURL back button (TASK-287) ─── */
	.lnaddr-back-btn {
		display: inline-flex;
		align-items: center;
		justify-content: flex-start;
		gap: var(--space-xs);
		padding: var(--space-xs) 0;
		/* TASK-305 (HOT-FIX): back sits close to preview — small gap (~4px). */
		margin-bottom: var(--space-xs);
		border: none;
		background: transparent;
		color: var(--color-primary);
		font-family: var(--font-family);
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-semibold);
		cursor: pointer;
		transition: color var(--transition-fast);
		-webkit-tap-highlight-color: transparent;
	}

	.lnaddr-back-btn:hover {
		color: var(--color-primary-hover);
	}

	.lnaddr-back-btn:focus-visible {
		outline: 2px solid var(--color-primary);
		outline-offset: 2px;
		border-radius: var(--radius-sm);
	}

	/* ─── Amount Display ──────────────── */
	.amount-section {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-xs);
	}

	.amount-display {
		display: flex;
		align-items: baseline;
		gap: var(--space-xs);
	}

	.amount-value {
		font-family: var(--font-family);
		/* TASK-306 (HOT-FIX): 3xl (32px) → 48px. No --font-size-4xl token
		   exists in tokens.css, so use direct 48px (do NOT modify tokens.css). */
		font-size: 48px;
		font-weight: var(--font-weight-bold);
		color: var(--color-primary);
		line-height: var(--line-height-tight);
		min-width: 1ch;
		text-align: center;
	}

	.amount-unit {
		font-family: var(--font-family);
		font-size: var(--font-size-md);
		font-weight: var(--font-weight-medium);
		color: var(--color-text-secondary);
	}

	/* ─── LNURL comment input (TASK-280) ── */
	.comment-section {
		display: flex;
		flex-direction: column;
		gap: var(--space-sm);
	}

	.comment-input {
		width: 100%;
		padding: var(--space-sm) var(--space-md);
		border: 1.5px solid var(--color-border);
		border-radius: var(--radius-md);
		font-family: var(--font-family);
		font-size: var(--font-size-sm);
		color: var(--color-text);
		background: var(--color-surface);
		line-height: var(--line-height-normal);
		transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
	}

	.comment-input:focus {
		outline: none;
		border-color: var(--color-primary);
		box-shadow: 0 0 0 3px rgba(0, 188, 212, 0.12);
	}

	.comment-input:disabled {
		background: var(--color-surface-variant);
		opacity: 0.7;
	}

	/* ─── Preview / Fee ───────────────── */
	.preview-section,
	.fee-section {
		display: flex;
		flex-direction: column;
		gap: var(--space-sm);
	}

	/* TASK-304 (HOT-FIX rev23): 2-line LNURL preview — "Pay to …"
	   (prominent semibold, center) on top + min/max (small dim, center) below. */
	.lnaddr-preview {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-xs);
		width: 100%;
		text-align: center;
		/* TASK-305 (HOT-FIX): preview ↔ amount gap ~16px (replaces the stacked
		   `margin-top: var(--space-lg)` that was on .amount-section). */
		margin-bottom: var(--space-md);
	}

	.lnaddr-desc {
		font-size: var(--font-size-md);
		font-weight: var(--font-weight-semibold);
		color: var(--color-text);
		max-width: 100%;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.lnaddr-minmax {
		font-size: var(--font-size-xs);
		color: var(--color-text-secondary);
		white-space: nowrap;
	}

	/* TASK-305 (HOT-FIX): amount group spacing — REMOVED the stacked
	   `margin-top: var(--space-lg)` (24px). The preview↔amount gap now lives on
	   .lnaddr-preview (single gap system). This only sets the amount→numpad gap. */
	.lnurl-card .amount-section {
		margin-bottom: var(--space-sm);
	}

	.preview-details {
		display: flex;
		flex-direction: column;
		gap: var(--space-sm);
	}

	.detail-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: var(--space-xs) 0;
		border-bottom: 1px solid var(--color-border);
	}

	/* TASK-161 (F-V18-007): Spacing-only design — 2px cyan border-top removed, padding-top increased to preserve visual rhythm */
	.detail-row-total {
		border-bottom: none;
		padding-top: var(--space-md);
		margin-top: var(--space-sm);
	}

	/* TASK-F-NEW-008: Lightning invoice amount (preview section, first row) — Cyan highlight.
	   Target via :global() to reach the Body child component's <p data-weight="semibold"> element.
	   Scoped to .preview-section (Lightning tab only — Cashu uses .preview-details, not .preview-section). */
	.preview-section .detail-row:first-child :global([data-weight='semibold']) {
		color: var(--color-primary);
		font-weight: var(--font-weight-bold);
	}

	.detail-row:last-child {
		border-bottom: none;
	}

	.preview-actions {
		display: flex;
		gap: var(--space-sm);
		justify-content: flex-end;
		margin-top: var(--space-sm);
	}

	.fee-loading {
		color: var(--color-text-disabled);
	}

	/* ─── Action Buttons ──────────────── */
	.action-buttons {
		display: flex;
		flex-direction: column;
		gap: var(--space-sm);
	}

	.send-confirm-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-sm);
		width: 100%;
		padding: var(--space-md) var(--space-lg);
		border: none;
		border-radius: var(--radius-md);
		font-family: var(--font-family);
		font-size: var(--font-size-md);
		font-weight: var(--font-weight-bold);
		background: var(--color-primary);
		color: var(--color-primary-contrast);
		cursor: pointer;
		transition: all var(--transition-fast);
		-webkit-tap-highlight-color: transparent;
		box-shadow: 0 2px 8px color-mix(in srgb, var(--color-primary) 35%, transparent);
		min-height: 48px;
	}

	.send-confirm-btn:hover:not(:disabled) {
		background: var(--color-primary-hover);
		transform: translateY(-1px);
		box-shadow: 0 4px 16px color-mix(in srgb, var(--color-primary) 40%, transparent);
	}

	.send-confirm-btn:active:not(:disabled) {
		transform: scale(0.97);
	}

	.send-confirm-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.send-confirm-btn:focus-visible {
		outline: 2px solid var(--color-primary);
		outline-offset: 2px;
	}

	/* ─── Loading ─────────────────────── */
	.loading-section {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: var(--space-md);
		padding: var(--space-xl);
		min-height: 200px;
	}

	.spinner-lg {
		width: 40px;
		height: 40px;
		border: 3px solid var(--color-border);
		border-top-color: var(--color-primary);
		border-radius: 50%;
		animation: spin 0.7s linear infinite;
	}

	@keyframes spin {
		to { transform: rotate(360deg); }
	}

	/* ─── Inline Sending (was overlay, now inline) ── */
	.inline-sending {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: var(--space-lg);
		padding: var(--space-xl);
		min-height: 200px;
		animation: expand-in 0.3s ease-out;
	}

	/* ─── Success Expand Animation ────── */
	.success-expand {
		animation: expand-in 0.3s ease-out;
	}

	@keyframes expand-in {
		from {
			opacity: 0;
			transform: translateY(12px);
			max-height: 0;
		}
		to {
			opacity: 1;
			transform: translateY(0);
			max-height: 600px;
		}
	}

	/* ─── Success ─────────────────────── */
	.success-section {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-md);
	}

	/* TASK-161 (F-V18-007): Spacing-only design — border-bottom removed in success state, padding-bottom added to preserve visual rhythm */
	/* TASK-169 (MOD-013): success-section .detail-row removed — replaced by .success-row (Option A) */

	/* TASK-169 / MOD-013: Spacing-only success rows (no borders, gap-based dividers) */
	.success-rows {
		display: flex;
		flex-direction: column;
		gap: var(--space-sm);
		width: 100%;
		padding: var(--space-sm) 0;
	}

	.success-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: var(--space-sm);
		padding: var(--space-sm) 0;
	}

	.success-row :global(svg) {
		vertical-align: middle;
		flex-shrink: 0;
	}

	/* TASK-FIX-320 secondary visual treatment removed in TASK-FIX-323:
	   Row 4 was deleted and merged into Row 2 (combined Fee display). */

	.success-icon {
		color: var(--color-primary);
		animation: check-pop 0.5s ease-out;
	}

	@keyframes check-pop {
		0% { transform: scale(0); opacity: 0; }
		50% { transform: scale(1.2); }
		100% { transform: scale(1); opacity: 1; }
	}

	.spent-amount {
		display: flex;
		align-items: baseline;
		gap: var(--space-xs);
	}

	.spent-value {
		font-family: var(--font-family);
		/* TASK-307 (HOT-FIX): 2xl (24px) → 48px (success screens). Direct 48px. */
		font-size: 48px;
		font-weight: var(--font-weight-bold);
		color: var(--color-primary);
	}

	.spent-unit {
		font-family: var(--font-family);
		font-size: var(--font-size-md);
		font-weight: var(--font-weight-medium);
		color: var(--color-text-secondary);
	}

	.mono-text {
		font-family: var(--font-family-mono);
	}

	.text-primary-total {
		color: var(--color-primary);
	}

	.text-error-warning {
		color: var(--color-error);
	}

	/* ─── Token QR (TOP) — Send Cashu ───── */
	.token-qr-top {
		display: flex;
		justify-content: center;
		padding: var(--space-md) 0;
		width: 100%;
	}

	/* ─── Success CTA (Brand Cyan — F-V18-004) ─ */
	.success-cta {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		padding: var(--space-md) var(--space-lg);
		border: none;
		border-radius: var(--radius-md);
		font-family: var(--font-family);
		font-size: var(--font-size-md);
		font-weight: var(--font-weight-bold);
		background: var(--color-primary);
		color: var(--color-primary-contrast);
		cursor: pointer;
		transition: all var(--transition-fast);
		-webkit-tap-highlight-color: transparent;
		box-shadow: 0 2px 8px color-mix(in srgb, var(--color-primary) 35%, transparent);
		min-height: 48px;
	}

	.success-cta:hover:not(:disabled) {
		background: var(--color-primary-hover);
		transform: translateY(-1px);
		box-shadow: 0 4px 16px color-mix(in srgb, var(--color-primary) 40%, transparent);
	}

	.success-cta:active:not(:disabled) {
		transform: scale(0.97);
	}

	.success-cta:focus-visible {
		outline: 2px solid var(--color-primary);
		outline-offset: 2px;
	}

	/* ─── Token Output ────────────────── */
	.token-display {
		display: flex;
		flex-direction: column;
		gap: var(--space-sm);
		width: 100%;
	}

	.token-output {
		width: 100%;
		padding: var(--space-sm);
		border: 1.5px solid var(--color-border);
		border-radius: var(--radius-sm);
		font-family: var(--font-family-mono);
		font-size: var(--font-size-xs);
		color: var(--color-text);
		background: var(--color-surface-variant);
		resize: none;
		line-height: var(--line-height-normal);
	}

	/* ─── Confirm Dialog (Brand Cyan — TASK-175) ── */
	.confirm-dialog {
		display: flex;
		flex-direction: column;
		gap: var(--space-md);
	}

	.confirm-details {
		display: flex;
		flex-direction: column;
		gap: var(--space-sm);
	}

	.confirm-actions {
		display: flex;
		gap: var(--space-sm);
		justify-content: flex-end;
	}

	.danger-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: var(--space-sm) var(--space-md);
		border: none;
		border-radius: var(--radius-md);
		font-family: var(--font-family);
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-bold);
		background: var(--color-primary);
		color: var(--color-primary-contrast);
		cursor: pointer;
		transition: all var(--transition-fast);
		min-height: 44px;
	}

	.danger-btn:hover:not(:disabled) {
		background: var(--color-primary-hover);
	}

	.danger-btn:active:not(:disabled) {
		transform: scale(0.97);
	}

	.danger-btn:focus-visible {
		outline: 2px solid var(--color-primary);
		outline-offset: 2px;
	}

	/* ─── Error banner moved to src/app.css (global) per ITER-5 ─── */

	/* ─── Toast ───────────────────────── */
	.toast-container {
		position: fixed;
		bottom: 100px;
		left: 50%;
		transform: translateX(-50%);
		z-index: var(--z-toast);
		max-width: 360px;
		width: calc(100% - 2 * var(--space-md));
	}

	.bottom-spacer {
		height: calc(80px + env(safe-area-inset-bottom, 0px));
	}
</style>
