/**
 * TASK-FIX-iter5 — prefix strip + lightning-address routing (Send + App).
 *
 * Mirrors the mock surface from Send.lnurl.test.ts. Covers the four cases
 * the fix must not regress:
 *   1. bolt11 with `lightning:` prefix → canonical form in textarea
 *   2. bolt11 with `bitcoin:` prefix   → canonical form in textarea
 *   3. lnurl bech32 with `lightning:` prefix → resolved as lnurl
 *   4. lightning address with `lightning:` prefix → resolved as LA
 *   5. paste `lightning:lnbc1...` into textarea → resolves as bolt11
 *   6. Enter keydown (handleInvoiceKeydown) strips prefix
 *   7. Send-button click (handleSendClick) strips prefix
 *
 * App.svelte routing (lightning:alice@domain.tld → Send) is exercised
 * end-to-end via the real `handleQRResult` path: render App, capture
 * QRScanner's stub props, call onDecode(scanString), assert navigateTo.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { tick } from 'svelte';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/svelte';
import { render as renderApp } from '@testing-library/svelte/svelte5';
import Send from '../../screens/Send.svelte';
import App from '../../App.svelte';

// ── Hoisted test doubles (usable inside hoisted vi.mock factories) ──
const h = vi.hoisted(() => {
	/** Minimal Svelte 5 component stub that renders a testid marker + captures props. */
	const capturedProps: Record<string, Record<string, unknown>> = {};
	function stub(name: string) {
		return function StubComponent(anchor: Node, props: Record<string, unknown>) {
			capturedProps[name] = props;
			const el = document.createElement('div');
			el.setAttribute('data-testid', name);
			el.textContent = name;
			anchor.parentNode?.insertBefore(el, anchor);
			return {
				update() {},
				mount() {},
				destroy() {
					el.remove();
				}
			};
		};
	}
	/** Minimal Svelte store (subscribe/set). */
	function makeStore<T>(initial: T) {
		let value = initial;
		const listeners = new Set<(v: T) => void>();
		return {
			subscribe(fn: (v: T) => void) {
				fn(value);
				listeners.add(fn);
				return () => listeners.delete(fn);
			},
			set(v: T) {
				value = v;
				for (const fn of [...listeners]) fn(v);
			}
		};
	}
	return {
		stub,
		capturedProps,
		makeStore,
		mockGetWalletStatus: vi.fn(),
		mockTryAutoUnlock: vi.fn()
	};
});

vi.mock('svelte-i18n', () => {
	const store = {
		subscribe(fn: (val: (k: string) => string) => void) {
			fn((k: string) => k);
			return () => {};
		}
	};
	return {
		_: store,
		locale: { subscribe(fn: (v: string) => void) { fn('en'); return () => {}; }, set() {} },
		init() {}, register() {},
		getLocaleFromNavigator() { return 'en'; }
	};
});

const mockNavigateTo = vi.fn();
vi.mock('$lib/router', () => ({
	navigateTo: (...args: unknown[]) => mockNavigateTo(...args),
	getCurrentScreen: () => 'send',
	onRouteChange: () => () => {},
	getHashParam: () => null,
	clearHashParams: vi.fn()
}));

vi.mock('$lib/wallet/store', () => ({
	getMintConfig: () => ({ name: 'Test Mint', url: 'https://mint.lnw.cash' }),
	getActiveMintUrl: () => 'https://mint.lnw.cash',
	setActiveMintUrl: vi.fn(),
	activeMintStore: h.makeStore('https://mint.lnw.cash')
}));

const mockMeltFlow = vi.fn();
vi.mock('$lib/wallet/melt', () => ({
	meltFlow: (...args: unknown[]) => mockMeltFlow(...args)
}));

vi.mock('$lib/wallet/transfer', () => ({
	sendTokens: vi.fn().mockResolvedValue({ token: 'cashuAeyJ0', amount: 1, mint: 'https://mint.lnw.cash' })
}));

vi.mock('$lib/wallet/balance', () => ({
	getBalance: () => Promise.resolve({ total: 0, byMint: {}, proofCount: 0, lastUpdated: Date.now() }),
	getBalanceByMint: () => Promise.resolve(0)
}));

vi.mock('$lib/cashu/client', () => ({
	requestMeltQuote: vi.fn(),
	checkMintQuote: vi.fn(async () => ({ state: 'UNPAID', paid: false })),
	CashuError: class CashuError extends Error { status?: number; constructor(m: string, s?: number) { super(m); this.status = s; } }
}));

vi.mock('$lib/wallet/errors', () => ({
	InsufficientFundsError: class InsufficientFundsError extends Error {},
	WalletLockedError: class WalletLockedError extends Error {}
}));

const mockDecodeBolt11 = vi.fn();
vi.mock('$lib/wallet/bolt11', () => ({
	decodeBolt11: (inv: string) => mockDecodeBolt11(inv),
	isValidBolt11: () => true
}));

// App.svelte dependencies
vi.mock('$lib/wallet/state', () => ({
	getWalletStatus: (...a: unknown[]) => h.mockGetWalletStatus(...a),
	tryAutoUnlock: (...a: unknown[]) => h.mockTryAutoUnlock(...a)
}));
vi.mock('$lib/pwa-install', () => ({
	initPwaInstall: vi.fn(() => () => {}),
	onCanInstallChange: vi.fn(() => () => {}),
	canInstallNow: () => false,
	isStandalone: () => true,
	isInstallDismissed: () => true,
	dismissInstall: vi.fn(),
	resetInstallDismissed: vi.fn(),
	triggerInstall: vi.fn(async () => false)
}));
vi.mock('$lib/offline-indicator', () => ({
	isOnline: () => true,
	wasOffline: () => false,
	onConnectivityChange: vi.fn(() => () => {}),
	trackWasOffline: vi.fn(() => () => {})
}));
vi.mock('$lib/wallet/autolock', () => ({
	startAutoLock: vi.fn(() => () => {}),
	walletLockedStore: h.makeStore(false)
}));
vi.mock('$lib/stores/toast', () => ({
	showToast: vi.fn(),
	toastMessage: h.makeStore<string | null>(null),
	toastType: h.makeStore('info')
}));
vi.mock('$lib/design/theme', () => ({
	themeMode: h.makeStore('system'),
	resolveTheme: vi.fn((m: string) => m),
	applyThemeDom: vi.fn()
}));
vi.mock('$lib/storage/db', () => ({
	getTransactions: vi.fn(async () => []),
	updateTransaction: vi.fn(async () => {})
}));
vi.mock('$lib/stores/mint-events', () => ({
	notifyMintConfirmed: vi.fn(),
	mintBanner: h.makeStore({ show: false, amount: 0 })
}));
vi.mock('$lib/stores/scannedQR', () => ({
	scannedQRValue: { set: vi.fn(), subscribe: vi.fn(() => () => {}) }
}));

vi.mock('$lib/iconly/Iconly.svelte', () => ({ default: h.stub('iconly-stub') }));
vi.mock('../../screens/Home.svelte', () => ({ default: h.stub('home-stub') }));
vi.mock('../../screens/Receive.svelte', () => ({ default: h.stub('receive-stub') }));
// NOTE: Send.svelte is the REAL component — we test its prefix-strip behaviour
// in the first describe. App.svelte will mount it after navigateTo('send') in
// the second describe.
vi.mock('../../screens/History.svelte', () => ({ default: h.stub('history-stub') }));
vi.mock('../../screens/Settings.svelte', () => ({ default: h.stub('settings-stub') }));
vi.mock('../../screens/Setup.svelte', () => ({ default: h.stub('setup-stub') }));
vi.mock('../../components/BottomNav.svelte', () => ({ default: h.stub('bottomnav-stub') }));
vi.mock('../../components/TopAppBar.svelte', () => ({ default: h.stub('topappbar-stub') }));
vi.mock('$lib/components/icons/ArrowLeft.svelte', () => ({ default: h.stub('arrowleft-stub') }));
vi.mock('$lib/components/QRScanner.svelte', () => ({ default: h.stub('qrscanner-stub') }));
vi.mock('../../components/SplashScreen.svelte', () => ({ default: h.stub('splash-stub') }));
vi.mock('../../components/ErrorBoundary.svelte', () => ({ default: h.stub('errorboundary-stub') }));
vi.mock('../../components/OfflineIndicator.svelte', () => ({ default: h.stub('offlineindicator-stub') }));
vi.mock('../../components/PwaInstallPrompt.svelte', () => ({ default: h.stub('pwainstall-stub') }));

const PAY_INFO = {
	tag: 'payRequest',
	callback: 'https://coinos.io/callback',
	minSendable: 1000,
	maxSendable: 100000000,
	metadata: '[["text/plain","Paying PrukS@coinos.io"]]',
	commentAllowed: 100
};

const VALID_BOLT11 =
	'lnbc2500u1pvjluezpp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypqdq';

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json' }
	});
}

function validDecode() {
	return {
		network: 'mainnet',
		amountSat: 1,
		paymentHash: 'ab',
		description: '',
		expiry: 3600,
		timestamp: 0,
		hrp: 'lnbc',
		tags: new Map()
	};
}

describe('Send — prefix strip (TASK-FIX-iter5)', () => {
	let fetchMock: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		vi.clearAllMocks();
		mockMeltFlow.mockResolvedValue({ success: true, preimage: 'ab', feeReserve: 0, spentAmount: 1 });
		mockDecodeBolt11.mockReturnValue(validDecode());
		fetchMock = vi.fn(async (input: string | URL | Request) => {
			const url = typeof input === 'string' ? input : input.toString();
			if (url.includes('/.well-known/lnurlp/')) return jsonResponse(PAY_INFO);
			if (url.includes('service.com')) return jsonResponse(PAY_INFO);
			if (url.includes('/callback')) return jsonResponse({ pr: 'lnbc1testinvoice' });
			throw new Error('unexpected fetch: ' + url);
		});
		vi.stubGlobal('fetch', fetchMock);
	});

	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
	});

	it('strips lightning: prefix from pasted bolt11 (textarea shows canonical form)', async () => {
		render(Send, { defaultMintUrl: 'https://mint.lnw.cash' });
		const textarea = document.querySelector('.invoice-textarea') as HTMLTextAreaElement;

		await fireEvent.paste(textarea, {
			clipboardData: { getData: () => `lightning:${VALID_BOLT11}` }
		});

		// textarea reflects canonical form (no prefix)
		expect(textarea.value).toBe(VALID_BOLT11);
		// bolt11 auto-validated → preview rendered (check_fee button visible)
		expect(await screen.findByText('screen.send.check_fee')).toBeTruthy();
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('strips bitcoin: prefix from pasted bolt11', async () => {
		render(Send, { defaultMintUrl: 'https://mint.lnw.cash' });
		const textarea = document.querySelector('.invoice-textarea') as HTMLTextAreaElement;

		await fireEvent.paste(textarea, {
			clipboardData: { getData: () => `bitcoin:${VALID_BOLT11}` }
		});

		expect(textarea.value).toBe(VALID_BOLT11);
		expect(await screen.findByText('screen.send.check_fee')).toBeTruthy();
	});

	it('strips lightning: prefix from pasted lnurl bech32 (resolves as lnurl)', async () => {
		render(Send, { defaultMintUrl: 'https://mint.lnw.cash' });
		const textarea = document.querySelector('.invoice-textarea') as HTMLTextAreaElement;

		const LNURL_BECH32 =
			'LNURL1DP68GURN8GHJ7UM9WFMXJCM99E3K7MF0V9CXJ0M385EKVCENXC6R2C35XVUKXEFCV5MKVV34X5EKZD3EV56NYD3HXQURZEPEXEJXXEPNXSCRVWFNV9NXZCN9XQ6XYEFHVGCXXCMYXYMNSERXFQ5FNS';

		await fireEvent.paste(textarea, {
			clipboardData: { getData: () => `lightning:${LNURL_BECH32}` }
		});

		// resolve hit coinos.io (lnurl bech32 path) — proves the strip
		expect(await screen.findByText('screen.send.lnaddr.pay_to coinos.io')).toBeTruthy();
	});

	it('strips lightning: prefix from pasted lightning address (resolves as LA)', async () => {
		render(Send, { defaultMintUrl: 'https://mint.lnw.cash' });
		const textarea = document.querySelector('.invoice-textarea') as HTMLTextAreaElement;

		await fireEvent.paste(textarea, {
			clipboardData: { getData: () => 'lightning:PrukS@coinos.io' }
		});

		// resolve rendered (proves strip happened) — canonical form was used by detectInputType
		expect(await screen.findByText('screen.send.lnaddr.pay_to PrukS@coinos.io')).toBeTruthy();
	});

	it('paste lightning:lnbc1... into textarea → resolves as bolt11 (canonical form)', async () => {
		render(Send, { defaultMintUrl: 'https://mint.lnw.cash' });
		const textarea = document.querySelector('.invoice-textarea') as HTMLTextAreaElement;

		await fireEvent.paste(textarea, {
			clipboardData: { getData: () => `lightning:${VALID_BOLT11}` }
		});

		// canonical form starts with lnbc → bolt11 → preview rendered
		expect(await screen.findByText('screen.send.check_fee')).toBeTruthy();
	});

	it('handleInvoiceKeydown (Enter) strips prefix before classify', async () => {
		render(Send, { defaultMintUrl: 'https://mint.lnw.cash' });
		const textarea = document.querySelector('.invoice-textarea') as HTMLTextAreaElement;

		await fireEvent.input(textarea, { target: { value: 'lightning:PrukS@coinos.io' } });
		await fireEvent.keyDown(textarea, { key: 'Enter' });

		// resolve rendered (proves strip happened)
		expect(await screen.findByText('screen.send.lnaddr.pay_to PrukS@coinos.io')).toBeTruthy();
	});

	it('handleSendClick (Send button) strips prefix before classify', async () => {
		render(Send, { defaultMintUrl: 'https://mint.lnw.cash' });
		const textarea = document.querySelector('.invoice-textarea') as HTMLTextAreaElement;

		await fireEvent.input(textarea, { target: { value: 'lightning:PrukS@coinos.io' } });

		const sendButton = screen.getByRole('button', { name: 'screen.send.lnaddr.send_button' });
		await fireEvent.click(sendButton);

		// resolve rendered (proves strip happened)
		expect(await screen.findByText('screen.send.lnaddr.pay_to PrukS@coinos.io')).toBeTruthy();
	});

	// ─── TASK-FIX-iter5 (uppercase): bech32 is case-insensitive per BIP-173.
	// detectInputType must accept LNBC1..., LNURL1... (uppercase) the same as
	// the lowercase canonical form. The store path is exercised by the
	// App.svelte describe block below; these tests cover the paste / type path
	// that also feeds detectInputType.
	const UPPERCASE_BOLT11 =
		'LNBC1U1P4G6HPFPP5V8JL97YSTV2KZQMXU4FPV2NWP4E5TNVJXXVDR9HEAVJ35LTQEFNSDQDF3S5X6RFWDCXZCQZZSXQYZ5VQSP58JPDUPFEWKKP6JFVFE9WF5LAJXSR3Z8Z2XT0MU5MQ9NGA6Z8GT8Q9QXPQYSGQ56LL9S4N58Z39468FDGLFF75G0RCW5N73E5CSSRNSDL60EFA8Y5NAEQHHCNGE0G229X2V5EJHLLLMEZ794QLUV9RY3LDHZAUZ0MK3LSPD2CXXT';
	const UPPERCASE_LNURL =
		'LNURL1DP68GURN8GHJ7UM9WFMXJCM99E3K7MF0V9CXJ0M385EKVCENXC6R2C35XVUKXEFCV5MKVV34X5EKZD3EV56NYD3HXQURZEPEXEJXXEPNXSCRVWFNV9NXZCN9XQ6XYEFHVGCXXCMYXYMNSERXFQ5FNS';

	it('bare uppercase bolt11 (LNBC1...) → detects as bolt11 + auto-validates', async () => {
		render(Send, { defaultMintUrl: 'https://mint.lnw.cash' });
		const textarea = document.querySelector('.invoice-textarea') as HTMLTextAreaElement;

		await fireEvent.paste(textarea, {
			clipboardData: { getData: () => UPPERCASE_BOLT11 }
		});

		// detectInputType matches uppercase bolt11 via /^ln(bc|tb|bcrt|sb)/i
		// → mock decodeBolt11 returns valid → check_fee rendered
		expect(await screen.findByText('screen.send.check_fee')).toBeTruthy();
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('prefixed uppercase bolt11 (lightning:LNBC1...) → strips prefix + detects as bolt11', async () => {
		render(Send, { defaultMintUrl: 'https://mint.lnw.cash' });
		const textarea = document.querySelector('.invoice-textarea') as HTMLTextAreaElement;

		await fireEvent.paste(textarea, {
			clipboardData: { getData: () => `lightning:${UPPERCASE_BOLT11}` }
		});

		// stripInputPrefix removes lightning: (case-insensitive) → uppercase
		// bolt11 passed to detectInputType → matches → auto-validates
		expect(await screen.findByText('screen.send.check_fee')).toBeTruthy();
	});

	it('all-uppercase prefixed bolt11 (LIGHTNING:LNBC1...) → case-insensitive strip + detects as bolt11', async () => {
		render(Send, { defaultMintUrl: 'https://mint.lnw.cash' });
		const textarea = document.querySelector('.invoice-textarea') as HTMLTextAreaElement;

		await fireEvent.paste(textarea, {
			clipboardData: { getData: () => `LIGHTNING:${UPPERCASE_BOLT11}` }
		});

		// strip regex is /^(lightning:|bitcoin:)/i so LIGHTNING: is also stripped
		// → detectInputType matches uppercase bolt11 → auto-validates
		expect(await screen.findByText('screen.send.check_fee')).toBeTruthy();
	});

	it('bare uppercase lnurl (LNURL1...) → detects as lnurl + resolves', async () => {
		render(Send, { defaultMintUrl: 'https://mint.lnw.cash' });
		const textarea = document.querySelector('.invoice-textarea') as HTMLTextAreaElement;

		await fireEvent.paste(textarea, {
			clipboardData: { getData: () => UPPERCASE_LNURL }
		});

		// detectInputType matches uppercase lnurl via /^lnurl/i → resolve hits
		// /.well-known/lnurlp/ coinos.io → pay_to coinos.io rendered
		expect(await screen.findByText('screen.send.lnaddr.pay_to coinos.io')).toBeTruthy();
	});

	it('prefixed uppercase lnurl (lightning:LNURL1...) → strips prefix + detects as lnurl + resolves', async () => {
		render(Send, { defaultMintUrl: 'https://mint.lnw.cash' });
		const textarea = document.querySelector('.invoice-textarea') as HTMLTextAreaElement;

		await fireEvent.paste(textarea, {
			clipboardData: { getData: () => `lightning:${UPPERCASE_LNURL}` }
		});

		// strip prefix → uppercase lnurl passed to detectInputType → matches
		// → resolve fires → pay_to coinos.io rendered
		expect(await screen.findByText('screen.send.lnaddr.pay_to coinos.io')).toBeTruthy();
	});
});

// ────────────────────────────────────────────────────────────────────
// App.svelte — handleQRResult LA routing (TASK-FIX-iter5)
//
// We mount the real App.svelte with leaf screens stubbed, then drive the
// real `handleQRResult` via the captured QRScanner stub's onDecode prop.
// This is a true end-to-end test of Gap-1 (strip before store) + Gap-2
// (LA branch in routing switch).
// ────────────────────────────────────────────────────────────────────
type WalletStateShape = {
	state: 'UNINITIALIZED' | 'LOCKED' | 'UNLOCKED';
	walletName: string | null;
	createdAt: number | null;
};

function setWalletByState(state: WalletStateShape['state']) {
	h.mockGetWalletStatus.mockReturnValue({
		state,
		walletName: state === 'UNINITIALIZED' ? null : 'LNWCASH Wallet',
		createdAt: state === 'UNINITIALIZED' ? null : 1
	});
}

describe('App.svelte — handleQRResult LA routing (TASK-FIX-iter5)', () => {
	beforeEach(() => {
		history.replaceState(null, '', '/');
		vi.clearAllMocks();
		setWalletByState('UNLOCKED');
		h.mockTryAutoUnlock.mockResolvedValue(true);
		// Pre-clear captured props from any prior test
		for (const k of Object.keys(h.capturedProps)) delete h.capturedProps[k];
	});

	afterEach(() => {
		cleanup();
	});

	async function mountAndScan(scan: string): Promise<void> {
		renderApp(App, {});
		// wait for the Home stub to mount → captures onQRScan prop
		await waitFor(() => expect(h.capturedProps['home-stub']).toBeTruthy());
		const homeProps = h.capturedProps['home-stub'] as
			| { onQRScan?: () => void }
			| undefined;
		expect(homeProps?.onQRScan).toBeTruthy();
		// Trigger the QR scan overlay → QRScanner stub now mounts with onDecode
		homeProps!.onQRScan!();
		await waitFor(() => expect(h.capturedProps['qrscanner-stub']).toBeTruthy());
		const qrProps = h.capturedProps['qrscanner-stub'] as
			| { onDecode?: (s: string) => void; onClose?: () => void }
			| undefined;
		expect(qrProps?.onDecode).toBeTruthy();
		// Real handleQRResult is async; await its microtask flush
		await qrProps!.onDecode!(scan);
		// small wait for the navigateTo side-effect
		await new Promise((r) => setTimeout(r, 10));
	}

	it('routes bare alice@domain.tld to send screen', async () => {
		await mountAndScan('alice@lnwallet.example.com');
		expect(mockNavigateTo).toHaveBeenCalledWith('send');
	});

	it('routes lightning:alice@domain.tld to send screen', async () => {
		await mountAndScan('lightning:alice@lnwallet.example.com');
		expect(mockNavigateTo).toHaveBeenCalledWith('send');
	});
});

// ────────────────────────────────────────────────────────────────────
// App.svelte — case-preserving QR storage (TASK-FIX-iter5 uppercase)
//
// Verify the storage-side decision in handleQRResult:
//   bolt11 / lnurl bech32 → lowercased before scannedQRValue.set
//   lightning address     → case preserved (email-style is case-sensitive
//                           on the LHS, and the domain is forced lowercase
//                           inside parseLightningAddress — so storing the
//                           original case is safe + correct).
// We pull the mocked scannedQRValue out of the vi.mock cache so we can
// inspect the exact set() argument App.svelte wrote.
// ────────────────────────────────────────────────────────────────────

async function mountAndScanCheckStore(
	scan: string
): Promise<{ setMock: ReturnType<typeof vi.fn> }> {
	renderApp(App, {});
	await waitFor(() => expect(h.capturedProps['home-stub']).toBeTruthy());
	const homeProps = h.capturedProps['home-stub'] as
		| { onQRScan?: () => void }
		| undefined;
	homeProps!.onQRScan!();
	await waitFor(() => expect(h.capturedProps['qrscanner-stub']).toBeTruthy());
	const qrProps = h.capturedProps['qrscanner-stub'] as
		| { onDecode?: (s: string) => void; onClose?: () => void }
		| undefined;
	await qrProps!.onDecode!(scan);
	await new Promise((r) => setTimeout(r, 10));
	// Pull the mocked store AFTER App has imported + used it (factory
	// returns a stable object across the file).
	const { scannedQRValue } = await import('$lib/stores/scannedQR');
	return { setMock: scannedQRValue.set as ReturnType<typeof vi.fn> };
}

describe('App.svelte — case-preserving QR storage (TASK-FIX-iter5 uppercase)', () => {
	beforeEach(() => {
		history.replaceState(null, '', '/');
		vi.clearAllMocks();
		setWalletByState('UNLOCKED');
		h.mockTryAutoUnlock.mockResolvedValue(true);
		for (const k of Object.keys(h.capturedProps)) delete h.capturedProps[k];
	});

	afterEach(() => {
		cleanup();
	});

	it('lowercases uppercase bolt11 in store (lightning:LNBC1... → lnbc1...)', async () => {
		const UPPERCASE_BOLT11 =
			'LNBC1U1P4G6HPFPP5V8JL97YSTV2KZQMXU4FPV2NWP4E5TNVJXXVDR9HEAVJ35LTQEFNSDQDF3S5X6RFWDCXZCQZZSXQYZ5VQSP58JPDUPFEWKKP6JFVFE9WF5LAJXSR3Z8Z2XT0MU5MQ9NGA6Z8GT8Q9QXPQYSGQ56LL9S4N58Z39468FDGLFF75G0RCW5N73E5CSSRNSDL60EFA8Y5NAEQHHCNGE0G229X2V5EJHLLLMEZ794QLUV9RY3LDHZAUZ0MK3LSPD2CXXT';

		const { setMock } = await mountAndScanCheckStore(`lightning:${UPPERCASE_BOLT11}`);

		expect(mockNavigateTo).toHaveBeenCalledWith('send');
		// looksLikeLightningAddress = false (no '@') → lowercased
		expect(setMock).toHaveBeenCalledWith(UPPERCASE_BOLT11.toLowerCase());
	});

	it('lowercases uppercase lnurl in store (lightning:LNURL1... → lnurl1...)', async () => {
		const UPPERCASE_LNURL =
			'LNURL1DP68GURN8GHJ7UM9WFMXJCM99E3K7MF0V9CXJ0M385EKVCENXC6R2C35XVUKXEFCV5MKVV34X5EKZD3EV56NYD3HXQURZEPEXEJXXEPNXSCRVWFNV9NXZCN9XQ6XYEFHVGCXXCMYXYMNSERXFQ5FNS';

		const { setMock } = await mountAndScanCheckStore(`lightning:${UPPERCASE_LNURL}`);

		expect(mockNavigateTo).toHaveBeenCalledWith('send');
		expect(setMock).toHaveBeenCalledWith(UPPERCASE_LNURL.toLowerCase());
	});

	it('preserves mixed-case LA in store (lightning:Alice@lnwallet.example.com → Alice@lnwallet.example.com)', async () => {
		const { setMock } = await mountAndScanCheckStore(
			'lightning:Alice@lnwallet.example.com'
		);

		expect(mockNavigateTo).toHaveBeenCalledWith('send');
		// looksLikeLightningAddress = true (has '@') → original case preserved
		expect(setMock).toHaveBeenCalledWith('Alice@lnwallet.example.com');
	});

	it('preserves mixed-case bare LA in store (Alice@LNWALLET.EXAMPLE.COM → Alice@LNWALLET.EXAMPLE.COM)', async () => {
		// Domain is uppercased intentionally — store must NOT lowercase it,
		// because parseLightningAddress lowercases the domain internally on
		// resolve. The store is the raw input; case-preserving is the policy.
		const { setMock } = await mountAndScanCheckStore('Alice@LNWALLET.EXAMPLE.COM');

		expect(mockNavigateTo).toHaveBeenCalledWith('send');
		expect(setMock).toHaveBeenCalledWith('Alice@LNWALLET.EXAMPLE.COM');
	});
});
