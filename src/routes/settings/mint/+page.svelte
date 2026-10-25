<script lang="ts">
	/**
	 * TASK-049 (D-011) — Mint Settings UI
	 *
	 * Allows users to view, add, switch, and remove Cashu mints.
	 * Integrates with TASK-047 (types), TASK-048 (config/store/discovery),
	 * and TASK-050 (design system components).
	 */
	import { _ } from 'svelte-i18n';
	import * as svelteI18n from 'svelte-i18n';
	import { discoverMintEndpoints } from '$lib/wallet/discovery';
	import {
		discoverMints,
		DEFAULT_TOP_N,
		SEED_MINT_INFO,
		normalizeMintUrl,
		type DiscoveredMint
	} from '$lib/nostr/mint-discover';
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
	// TASK-4002 (INTENT-040 R10+R14 APPROVE rev26+rev31): per-mint spendable
	// balance for the active-card badge + every list row. SPENDABLE-ONLY
	// (INTENT-015 — pending/failed excluded inside proofsDb/balance;
	// UI uses the numbers verbatim, never re-filters).
	import { getMintBalances } from '$lib/wallet/balance';
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

	// ─── Per-mint balances (TASK-4002 — SPENDABLE-ONLY) ──────────
	// Single batched read (one IndexedDB pass — safe for many mints +
	// offline; no network). Loading → skeleton pill; error (e.g. DB
	// unavailable) → badge hidden (never show a stale/wrong number).
	let mintBalances: Record<string, number> = $state({});
	let balancesLoading: boolean = $state(true);
	let balancesError: string = $state('');

	async function loadBalances(): Promise<void> {
		balancesLoading = true;
		balancesError = '';
		try {
			const list = await getMintBalances();
			const next: Record<string, number> = {};
			for (const b of list) next[b.mintUrl] = b.amount;
			mintBalances = next;
		} catch (e) {
			balancesError = e instanceof Error ? e.message : 'balance load failed';
			mintBalances = {};
		} finally {
			balancesLoading = false;
		}
	}

	// Exact-URL lookup (proofs carry the same config URL). Returns null
	// while loading / on error so callers render skeleton / nothing.
	function mintBalance(url: string): number | null {
		if (balancesLoading || balancesError) return null;
		return mintBalances[url] ?? 0;
	}

	// Same grouping as Home.svelte formatSat — no new format util.
	function formatSats(n: number): string {
		return new Intl.NumberFormat().format(n);
	}

	// Add/Edit Modal state
	let showAddModal: boolean = $state(false);
	let addUrl: string = $state('');
	let addUrlError: string = $state('');
	let validating: boolean = $state(false);
	let validatedConfig: MintConfig | null = $state(null);
	let validatedNuts: string[] = $state([]);
	let validateError: string = $state('');
	let saving: boolean = $state(false);

	// ─── Discover (TASK-3801 R5 rework) ─────────────────────
	// rev19+rev20 single-list: metadata จาก seed-probe ล้วน — ยิง /v1/info
	// สดใน list-path = 0 (discoverMints() ข้างในใช้ applySeedInfo + ZERO
	// live fetch; แตะรายตัวค่อย validateMintUrl ทีละราย = flow เดิม).
	// relay มาจาก client defaults — ไม่ hardcode ที่ UI.
	// rev14 คง: ไม่มีเลข rank. ลิสต์เดียวไม่แยกที่มา: live (relay เห็น +
	// มี metadata, infoOk) ∪ seed-online 31 (SEED_MINT_INFO) dedup ด้วย
	// canonical url — live ชนะ (เก็บ review-count สด) — sort มีรีวิวตาม
	// count desc แล้ว seed-only (0) ต่อท้าย. รายการที่ไม่มี metadata
	// (infoOk=false) ไม่แสดงใน UI (นับเฉพาะใน evidence เท่านั้น).
	let discovering: boolean = $state(false);
	let discoverError: string = $state('');
	let discovered: DiscoveredMint[] = $state([]);
	let discoverExpanded: boolean = $state(false);
	let discoverLoaded: boolean = $state(false);
	let discoverSelectedUrl: string | null = $state(null);

	// R4 normalize: canonical สำหรับแสดงผล + ส่ง validate (path คงอยู่ เช่น
	// /Bitcoin, /cashu — trailing slash หลุด → ไม่ชน //v1/info). ห้ามตัด path
	// ทิ้ง: curl proof ว่า origin-strip ได้ 404/410 ส่วน path เต็มได้ 200.
	function displayUrl(m: DiscoveredMint): string {
		return normalizeMintUrl(m.url) ?? m.url;
	}

	function canonicalUrl(raw: string): string {
		return normalizeMintUrl(raw) ?? raw.trim();
	}

	// LIVE = relay เห็น + มี metadata (infoOk จาก applySeedInfo ใน client).
	// รายการ infoOk=false ไม่เข้าลิสต์ (ไม่โชว์ ไม่นับใน UI).

	// SINGLE LIST (R5 rev19+rev20) — live ∪ seed-online dedup ด้วย
	// canonical url; live ชนะ (review-count สดคงอยู่). sort: มีรีวิวตาม
	// count desc (rating รอง) แล้ว seed-only (0) ต่อท้าย. ไม่ hardcode URL เอง.
	function buildSingleList(live: DiscoveredMint[]): DiscoveredMint[] {
		const online = live.filter((m) => m.infoOk);
		const seen = new Set(online.map((m) => canonicalUrl(m.url)));
		const out: DiscoveredMint[] = [...online];
		for (const [key, meta] of Object.entries(SEED_MINT_INFO)) {
			const norm = canonicalUrl(key);
			if (seen.has(norm)) continue;
			seen.add(norm);
			out.push({
				url: norm,
				name: meta.name,
				icon_url: meta.icon_url,
				nuts: [...meta.nuts],
				network: '',
				reviewCount: 0,
				uniqueReviewers: 0,
				rating: null,
				ratingCount: 0,
				infoOk: true,
				relaysSeen: [],
				score: 0
			});
		}
		out.sort(
			(a, b) =>
				b.reviewCount - a.reviewCount ||
				(b.rating ?? -1) - (a.rating ?? -1) ||
				b.score - a.score ||
				a.url.localeCompare(b.url)
		);
		return out;
	}

	let singleList = $derived(buildSingleList(discovered));
	let singleTop = $derived(discoverExpanded ? singleList : singleList.slice(0, DEFAULT_TOP_N));
	let singleHiddenCount = $derived(Math.max(0, singleList.length - DEFAULT_TOP_N));

	// Proposed mint.discover.* keys inlined (locale files out of whitelist —
	// follow-up can move these to th/en.json; everything else on screen is
	// language-neutral: protocol name, numbers, URLs).
	// R6 rework: ผูก locale แอป (svelte-i18n TH/EN toggle) แทน
	// ภาษาเบราว์เซอร์ — TH ขึ้นเมื่อแอป TH ไม่ว่าเครื่องบอส EN.
	// อ่าน store `locale` ผ่าน namespace (defensive: ถ้าไม่มี export นี้
	// เช่น mock ใน test ให้ default 'en' แทนการพัง — prod มีจริงเสมอ).
	type LocaleStore = {
		subscribe: (fn: (v: string | undefined | null) => void) => () => void;
	};
	let appLocale: string = $state('en');
	$effect(() => {
		// try/catch: unit mock เก่าไม่มี export `locale` (แตะ prop แล้ว
		// mock Proxy throw) → default 'en'; prod มีจริงเสมอ.
		let maybe: LocaleStore | undefined;
		try {
			maybe = (svelteI18n as Record<string, unknown>).locale as LocaleStore | undefined;
		} catch {
			maybe = undefined;
		}
		if (!maybe || typeof maybe.subscribe !== 'function') return;
		return maybe.subscribe((v) => {
			appLocale = v ?? 'en';
		});
	});

	function discoverLang(): 'th' | 'en' {
		return appLocale.toLowerCase().startsWith('th') ? 'th' : 'en';
	}

	function dtxt(key: 'title' | 'more' | 'less' | 'reviews', n?: number): string {
		const th = discoverLang() === 'th';
		switch (key) {
			case 'title':
				return th ? 'สำรวจ Mint' : 'Discover Mints';
			case 'more':
				return th ? `แสดงเพิ่ม (+${n ?? 0})` : `Show more (+${n ?? 0})`;
			case 'less':
				return th ? 'แสดงน้อยลง' : 'Show less';
			case 'reviews':
				return th ? `${n ?? 0} รีวิว` : `${n ?? 0} reviews`;
		}
	}

	// R10 rework (rev48+rev49 Commander verbatim): preview card logo
	// มี fallback วงกลมตัวย่อเหมือนลิสต์ — ไม่มี icon_url ใช้วงกลม
	// initialOf เดิม (ไม่ใช่ช่องว่างแบบ R9).
	function initialOf(m: DiscoveredMint): string {
		const src = (m.name || displayUrl(m) || '?').trim();
		return (src[0] ?? '?').toUpperCase();
	}

	// R10 preview fallback initial: ไม่มี icon_url ใช้ตัวอักษรแรกของ
	// validatedConfig.name || url (แบบเดียวกับ initialOf ในลิสต์).
	let previewInitial = $derived.by(() => {
		if (!validatedConfig) return '?';
		const src = (validatedConfig.name || validatedConfig.url || '?').trim();
		return (src[0] ?? '?').toUpperCase();
	});

	// preview logo: reuse icon_url จากลิสต์ที่ validate ตรงกัน — ไม่ยิงเพิ่ม.
	let previewIconUrl = $derived.by(() => {
		if (!validatedConfig) return '';
		const hit = singleList.find(
			(m) => canonicalUrl(m.url) === canonicalUrl(validatedConfig.url)
		);
		return hit?.icon_url ?? '';
	});

	// R11 rework (rev51+rev53 Commander verbatim "active mint ควรมีวงกลม
	// logo ด้วย ... วงกลมต้องอยู่ซ้าย ชื่อ mint และ url ... fallback คือ
	// อักษรแรกของ mint"): วงกลม logo ซ้ายสุดข้างชื่อ+url ในการ์ด active.
	// icon_url จาก probe ล้วน (SEED_MINT_INFO = /v1/info ที่ probe ไว้แล้ว
	// + reuse แถว discover ที่ตรงกัน — ไม่ยิงเพิ่ม, ไม่ใช้ Nostr picture).
	// ไม่มี icon_url ใช้วงกลมตัวย่ออักษรแรก (แบบเดียวกับลิสต์/preview).
	function activeIconUrl(mint: MintConfig): string {
		const key = canonicalUrl(mint.url);
		const hit = singleList.find((m) => canonicalUrl(m.url) === key);
		if (hit?.icon_url) return hit.icon_url;
		return SEED_MINT_INFO[key]?.icon_url ?? '';
	}

	function activeInitial(mint: MintConfig): string {
		const src = (mint.name || mint.url || '?').trim();
		return (src[0] ?? '?').toUpperCase();
	}

	async function loadDiscover(): Promise<void> {
		if (discovering || discoverLoaded) return;
		discovering = true;
		discoverError = '';
		try {
			discovered = await discoverMints();
		} catch (e) {
			discoverError = e instanceof Error ? e.message : 'discover failed';
			discovered = [];
		} finally {
			discovering = false;
			discoverLoaded = true;
		}
	}

	// แตะแถว → canonical URL ลงช่อง manual เดิม + วิ่ง flow เดิมทั้งเส้น
	// (validateMintUrl → validated card → Add → setMintConfig + setActive).
	// canonical คง path ไว้ (minibits /Bitcoin ยิงถูก) — ไม่ยิง /v1/info ตรงนี้.
	async function selectDiscovered(mint: DiscoveredMint): Promise<void> {
		discoverSelectedUrl = mint.url;
		addUrl = canonicalUrl(mint.url);
		addUrlError = '';
		await handleValidate();
	}

	// ─── Lifecycle ───────────────────────────────────────────────

	$effect(() => {
		loadMints();
		void loadBalances();
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
		// Discover reset + ยิงค้นหาทันทีที่เปิด modal (manual ยังใช้ได้เสมอ)
		discoverError = '';
		discoverExpanded = false;
		discoverLoaded = false;
		discoverSelectedUrl = null;
		discovered = [];
		void loadDiscover();
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
			const defaultUrl = getDefaultMintUrl();
			setActiveMintUrl(defaultUrl);
			activeMintUrl = defaultUrl;
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
			<!-- R5 rev48 REWORK (Commander verbatim: active ห้ามลบ):
			     ถอดปุ่มลบออกจากการ์ด active ทั้งหมด — side เหลือ Badge ตัวเดียว.
			     ลบใน list คงเดิม + handler (handleRemoveMint/isDefaultMint) เดิม ไม่แตะ. -->
			<div class="active-head">
				<div class="active-id">
				{#if activeIconUrl(mint)}
					<img
						class="active-logo"
						src={activeIconUrl(mint)}
						alt=""
						loading="lazy"
					/>
				{:else}
					<span class="active-fallback" aria-hidden="true">{activeInitial(mint)}</span>
				{/if}
				<div class="active-mint-text">
					<div class="mint-name-row">
						<h2 class="mint-name" title={mint.name || mint.url}>{mint.name || mint.url}</h2>
						<!-- TASK-4002 (INTENT-040 R14 APPROVE rev30+rev31): Balance เป็น
						     badge เล็กใสข้างชื่อ — row เดียวกับ mint-name (สไตล์เดียวกับ
						     list — สีเดียว primary ใส). SPENDABLE-ONLY (INTENT-015).
						     loading → skeleton; error → ซ่อน (ไม่โชว์เลขผิด). -->
						{#if balancesLoading}
							<span
								class="bal-badge bal-skeleton"
								role="status"
								aria-label={$_('common.loading')}
							></span>
						{:else if mintBalance(mint.url) !== null}
							<span class="bal-badge">{formatSats(mintBalance(mint.url) ?? 0)} {$_('screen.balance.sats')}</span>
						{/if}
						<!-- R12 rework (rev57 Commander verbatim): ถอดป้าย default ออกทั้ง UI —
						     mint บอสเหมือนเจ้าอื่น ไม่บอกว่าเป็น default. logic หลังบ้าน
						     (isDefaultMint/getDefaultMintUrl/setDefault) คงเดิม 100%. -->
					</div>
					<p class="mint-url" title={mint.url}>{mint.url}</p>
				</div>
				</div>
				<div class="active-side">
					<Badge variant="success" size="sm">{$_('mint.settings.active')}</Badge>
				</div>
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
				<!-- TASK-4002 (INTENT-040 R10+R11 APPROVE rev26-28+rev31) + R2 rev36 REWORK (ชื่อ/URL ยาวตัด ellipsis ลอก ListItem title/subtitle — การ์ด/ลิสต์ไม่ขยายขวา): body top row name + Balance badge + bottom row url ellipsis (title attr เก็บ url เต็ม) -- trailing remove ghost only. title/subtitle props unused (flat render cannot pair badge) -- children snippet instead (ListItem body is already column). -->
				<ListItem
					active={false}
					onclick={() => handleSwitchMint(mint)}
				>
					{#snippet leading()}
						<!-- R12 rework (rev57 Commander verbatim): แถวลิสต์ถอดจุด default ทิ้ง —
						     ใช้วงกลม logo/fallback ลายเดียวกับการ์ด active/discover.
						     icon_url มีโชว์จริง ไม่มี fallback ตัวย่อ (reuse activeIconUrl/
						     activeInitial — ไม่ยิงเพิ่ม, ไม่แตะ logic default). -->
						{#if activeIconUrl(mint)}
							<img
								class="mint-logo"
								src={activeIconUrl(mint)}
								alt=""
								loading="lazy"
							/>
						{:else}
							<span class="mint-fallback" aria-hidden="true">{activeInitial(mint)}</span>
						{/if}
					{/snippet}
					{#snippet children()}
						<span class="row-top">
							<span class="row-name" title={mint.name || mint.url}>{mint.name || mint.url}</span>
							{#if balancesLoading}
								<span
									class="bal-badge bal-skeleton"
									role="status"
									aria-label={$_('common.loading')}
								></span>
							{:else if mintBalance(mint.url) !== null}
								<span class="bal-badge">{formatSats(mintBalance(mint.url) ?? 0)} {$_('screen.balance.sats')}</span>
							{/if}
						</span>
						<span class="row-url" title={mint.url}>{mint.url}</span>
					{/snippet}
					{#snippet trailing()}
						<div class="mint-actions">
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
							<!-- R5 rev48: .row-spacer ถอดทิ้งทั้ง element — แถว default ไม่ต้องจองที่ (setting ไม่มีของแบบนี้). -->
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
			<!-- R7 fixed-modal: ตรึงทุกอย่างยกเว้นลิสต์ — modal flex-column
			     fixed-height (override :global ข้างล่าง) + URL block ตรึงบน
			     + Discover header ตรึง + list scroll ข้างในตัวเอง +
			     more/less footer ตรึงล่าง. รื้อคลาส sticky เดิมทิ้งแล้ว
			     (sticky นอก list ไม่ทำงานตาม Commander verbatim rev27).
			     CSS/layout อย่างเดียว — logic/validate/handleSave/sort/
			     dedup/CSP/locale ไม่แตะ. DOM order: URL block ก่อน list. -->
			<div class="url-block">
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
					<div class="validating-inline" role="status" aria-live="polite">
						<div class="validating-spinner" aria-hidden="true"></div>
						<span class="sr-only">{$_('mint.settings.validating')}</span>
					</div>
				{/if}

				{#if validatedConfig}
					<Card variant="basic" padding="sm">
						<div class="validated-info">
							<div class="validated-head">
								{#if previewIconUrl}
									<img
										class="validated-logo"
										src={previewIconUrl}
										alt=""
										loading="lazy"
									/>
								{:else}
									<span class="validated-fallback" aria-hidden="true">{previewInitial}</span>
								{/if}
								<p class="validated-name" title={validatedConfig.name || validatedConfig.url}><strong>{validatedConfig.name || validatedConfig.url}</strong></p>
							</div>
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

			<!-- Discover — R5: ลิสต์เดียวไม่แยกที่มา (live ∪ seed
			     dedup) + more/less ตัวเดียว + manual. rev8 ที่ตัดไว้คงเดิม
			     (subtitle / mainnet-badge / ป้ายรับรอง / relays-line ไม่มี).
			     ไม่ claim รับรองใดๆ — badge โชว์จำนวนรีวิวเพื่อเรียงลำดับ
			     เท่านั้น; seed-only (reviewCount 0) ไม่โชว์ badge รีวิว.
			     ไม่ยิง /v1/info ใน list-path — แตะแถวค่อย validate.
			     R6: locale ผูกแอป (dtxt อ่าน appLocale) — ไม่ตามเบราว์เซอร์. -->
			<div class="discover-block">
				<h3 class="discover-title">{dtxt('title')} ({singleList.length})</h3>
				{#snippet discoverRow(m: DiscoveredMint)}
					<li>
						<button
							type="button"
							class="discover-row"
							aria-pressed={discoverSelectedUrl === m.url}
							aria-label={m.name || displayUrl(m)}
							onclick={() => selectDiscovered(m)}
						>
						{#if m.icon_url}
								<img
									class="mint-logo"
									src={m.icon_url}
									alt=""
									loading="lazy"
								/>
							{:else}
								<span class="mint-fallback" aria-hidden="true">{initialOf(m)}</span>
							{/if}
							<span class="discover-info">
								<span class="discover-name">{m.name || displayUrl(m)}</span>
								<span class="discover-url">{displayUrl(m)}</span>
							</span>
							{#if m.reviewCount > 0}
								<Badge variant="default" size="sm">{dtxt('reviews', m.reviewCount)}</Badge>
							{/if}
						</button>
					</li>
				{/snippet}
				{#if discovering}
					<div class="discover-state" role="status" aria-live="polite">
						<div class="discover-spinner" aria-hidden="true"></div>
						<span class="sr-only">{$_('common.loading')}</span>
					</div>
				{:else}
					{#if discoverError}
						<p class="discover-error" role="alert">{discoverError}</p>
					{/if}
					{#if singleList.length > 0}
						<ul class="discover-list">
							{#each singleTop as m (m.url)}
								{@render discoverRow(m)}
							{/each}
						</ul>
						{#if !discoverExpanded && singleHiddenCount > 0}
							<div class="discover-footer">
								<button
									type="button"
									class="discover-more"
									onclick={() => {
										discoverExpanded = true;
									}}
								>
									{dtxt('more', singleHiddenCount)}
								</button>
							</div>
						{:else if discoverExpanded && singleList.length > DEFAULT_TOP_N}
							<div class="discover-footer">
								<button
									type="button"
									class="discover-more"
									onclick={() => {
										discoverExpanded = false;
									}}
								>
									{dtxt('less')}
								</button>
							</div>
						{/if}
					{/if}
				{/if}
			</div>
		</div>
	{/snippet}
</Modal>

<style>
	/* R4 rev42+rev44 REWORK (ตัด padding ซ้อน — route นี้ไม่มีใช้เดี่ยว):
	   MintSettings ฝังใน .settings-screen (Settings.svelte sub-view Mint Manage) —
	   กรอบนอกคุมเองแล้ว (max-width 480px + margin auto + padding md ที่
	   Settings.svelte:843-846) กรอบในจึง padding 0 + max-width none —
	   ไม่เบิ้ล 16px ไม่ล็อกซ้ำ การ์ด/List ยืดตามกรอบนอกเอง. */
	.mint-settings {
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-md);
		max-width: none;
		/* R6 rev51 ROOT FLOOR-2 (chromium พิสูจน์: margin 0 auto ตัวเดียวทำ
		   doc 1763px — auto margin ยกเลิก stretch ของ column flex item ทำให้
		   .mint-settings กว้างเท่า max-content (ชื่อยาว nowrap) ไม่หดตามจอ:
		   เอา auto ออก → stretch กลับมา 358px ที่ viewport 390 (การ์ดเต็มกรอบ
		   เหมือน setting — ตรง intent R4 "ยืดตามกรอบนอกเอง" ที่ margin auto
		   ขัดไว้; จอกว้างก็เต็ม 448 ไม่หดกลาง — ปุ่ม add จัดกลางในตัวเองอยู่แล้ว). */
		margin: 0;
		/* R6 rev51 ROOT FLOOR (Commander verbatim <390px ไม่หด — พิสูจน์ด้วย
		   chromium จริง): .mint-settings เป็น flex item ของ .settings-screen
		   (column) — min-width auto = หดต่ำกว่า min-content ไม่ได้ (ชื่อยาว
		   nowrap ดัน 1747px) เติม min-width 0 ปลดล็อกให้หดตามกรอบนอก. */
		min-width: 0;
	}

	/* R6 rev51 COLUMN FLOOR (คอลัมน์เดียวกัน — card/list เป็น flex item ของ
	   .mint-settings ที่เป็น column): min-width auto ค้ำเหมือนกัน เติม 0 ให้
	   หดได้ (Card เป็น shared component — override scoped เฉพาะหน้านี้ผ่าน
	   :global ไม่แตะ Card.svelte; .mint-list/.add-mint-section ของหน้านี้เอง).
	   ครบแล้ว chain 390px หดทุกชั้น: screen 480cap → settings 0 → card/list 0
	   → row items 0 (R2-R5) + text ellipsis + chrome shrink-0. */
	.mint-settings > :global(.card),
	.mint-list,
	.add-mint-section {
		min-width: 0;
	}

	.error-text {
		color: var(--color-error);
		margin: 0;
		font-size: var(--font-size-sm);
	}

	/* R5 rev48 REWORK (Commander verbatim: active ห้ามลบ):
	   .active-head flex row — ซ้าย logo+ชื่อ/url (.active-id flex 1 1 auto min-width 0) + ขวา Badge active ตัวเดียว
	   (.active-side flex-shrink 0 — ปุ่มลบถอดออกจากการ์ดทั้งหมด; ลบใน list คงเดิม).
	   metrics ลอก mockup R7 (gap md/side gap sm) — tokens ล้วน ไม่ hardcode. */
	.active-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-md);
		min-width: 0;
		margin-bottom: var(--space-sm);
	}

	.active-id {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		flex: 1 1 auto;
		min-width: 0;
		text-align: left;
	}

	/* R6 rev51: ลอก ListItem .list-item-trailing ตรงๆ (shrink-0 — chrome ขวาไม่โดนบีบ). */
	.active-side {
		display: flex;
		flex-direction: row;
		align-items: center;
		gap: var(--space-sm);
		flex-shrink: 0;
	}

	/* R11 active logo: วงกลม 36px เท่าลิสต์ (.mint-logo) ซ้ายสุดข้างชื่อ+url —
	   icon_url จาก probe (/v1/info) มีโชว์จริง ไม่มี fallback ตัวย่อ. */
	.active-logo {
		width: 36px;
		height: 36px;
		border-radius: 50%;
		object-fit: cover;
		flex-shrink: 0;
		background: var(--color-surface-variant);
	}

	.active-fallback {
		width: 36px;
		height: 36px;
		border-radius: 50%;
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: var(--font-size-md);
		font-weight: var(--font-weight-semibold);
		color: var(--color-text);
		background: var(--color-surface-variant);
	}

	.active-mint-text {
		flex: 1 1 auto;
		min-width: 0;
		overflow: hidden;
	}

	/* TASK-4002 (INTENT-040 R13+R14 APPROVE rev29-31): row \u0e40\u0e14\u0e35\u0e22\u0e27\u0e01\u0e31\u0e1a mint-name + gap xs + badge \u0e40\u0e25\u0e47\u0e01\u0e43\u0e2a color-mix 14% + \u0e02\u0e36\u0e49\u0e19 1px (\u0e40\u0e2b\u0e21\u0e37\u0e2d\u0e19 list \u2014 \u0e2a\u0e35\u0e40\u0e14\u0e35\u0e22\u0e27 primary \u0e43\u0e2a). */
	/* R6 rev51 (Commander verbatim floor <390px): เติม max-width 100% ลอก R3 — text chain หดไม่ล้นขวา. */
	.mint-name-row {
		display: flex;
		align-items: center;
		gap: var(--space-xs);
		flex-wrap: wrap;
		margin-bottom: var(--space-xs);
		min-width: 0;
		max-width: 100%;
		overflow: hidden;
	}

	.mint-name {
		font-size: var(--font-size-lg);
		font-weight: var(--font-weight-semibold);
		margin: 0;
		color: var(--color-text);
		flex: 0 1 auto;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.mint-url {
		font-size: var(--font-size-sm);
		color: var(--color-text-secondary);
		margin: 0;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.mint-details {
		display: flex;
		flex-direction: column;
		gap: var(--space-sm);
		margin-top: var(--space-sm);
		padding-top: var(--space-sm);
		border-top: 1px solid var(--color-divider);
	}

	/* R4 rev42+rev44 REWORK (ผ่อน floors — detail chain เหลือแค่ ellipsis กันดัน):
	   .detail-row/.detail-value/.nuts-list/.detail-label min-width 0
	   (หดได้ไม่ค้ำการ์ด) + value ตัด ellipsis ขวา — ไม่เหลือ floor ค้ำบวม.
	.detail-row {
		display: flex;
		align-items: flex-start;
		gap: var(--space-sm);
		min-width: 0;
	}

	/* R4 rev42+rev44 REWORK: label min-width 0 (จาก 7rem R8) — ผ่อน floor ค้ำบวม, flex-shrink 0 คง (ตัวอักษรไม่โดนบีบ), value ellipsis รับแทน. */
	.detail-label {
		font-size: var(--font-size-sm);
		color: var(--color-text-secondary);
		min-width: 0;
		flex-shrink: 0;
	}

	.detail-value {
		font-size: var(--font-size-sm);
		color: var(--color-text);
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.nuts-list {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
		min-width: 0;
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
		/* R6 rev51 ROW FLOOR: .list-item เป็น flex item ของ .mint-list (column) —
		   min-width auto ค้ำชื่อยาว เติม 0 ให้หด (body min-width 0 ของ ListItem
		   รับต่อ + row-name ellipsis — ไม่แตะ ListItem.svelte). */
		min-width: 0;
	}

	.mint-list :global(.list-item:last-child) {
		border-bottom: none;
	}

	/* R5 rev48 REWORK (.row-spacer ถอดทิ้งทั้ง element+CSS):
	   .mint-actions min-width 0 (หดได้ไม่ค้ำขวา) + gap sm คง —
	   แถว default ไม่จองที่ (setting ไม่มีของแบบนี้); padding ขวา ListItem มีผลเสมอ. */
	/* R6 rev51: + flex-shrink 0 — trailing chrome คงที่เหมือน ListItem
	   .list-item-trailing (shrink-0) ไม่โดน text chain บีบ; ลอก setting ตรงๆ. */
	.mint-actions {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		min-width: 0;
		flex-shrink: 0;
	}

	/* TASK-4002 (INTENT-040 R10+R11+R13+R14 APPROVE rev26-31) \u2014 per-mint
	   spendable badge (\u0e2a\u0e35\u0e40\u0e14\u0e35\u0e22\u0e27 primary \u0e43\u0e2a \u0e01\u0e32\u0e23\u0e4c\u0e14\u0e01\u0e31\u0e1a\u0e25\u0e34\u0e2a\u0e15\u0e4c\u0e2a\u0e44\u0e15\u0e25\u0e4c\u0e40\u0e14\u0e35\u0e22\u0e27\u0e01\u0e31\u0e19):
	   pill \u0e40\u0e17\u0e48\u0e32 badge-sm (\u0e25\u0e2d\u0e01 metrics Badge.svelte \u2014 \u0e44\u0e21\u0e48 hardcode \u0e43\u0e2b\u0e21\u0e48) +
	   bg color-mix primary 14% + \u0e15\u0e31\u0e27 primary + \u0e02\u0e36\u0e49\u0e19 1px optical
	   (pill 10px \u0e02\u0e49\u0e32\u0e07 title md) \u2014 tokens \u0e25\u0e49\u0e27\u0e19 \u0e22\u0e01\u0e40\u0e27\u0e49\u0e19 px
	   \u0e40\u0e14\u0e35\u0e22\u0e27\u0e15\u0e32\u0e21 verbatim (translateY(-1px) + border 1px \u0e40\u0e01\u0e48\u0e32 R3).
	   .row-top: \u0e41\u0e16\u0e27\u0e1a\u0e19 body (name + badge \u0e15\u0e34\u0e14\u0e0a\u0e37\u0e48\u0e2d\u0e08\u0e23\u0e34\u0e07 \u2014
	   flex-start + gap xs + name flex 0 1 auto \u0e44\u0e21\u0e48\u0e14\u0e31\u0e19\u0e02\u0e2d\u0e1a\u0e02\u0e27\u0e32).
	   .row-url: url ellipsis \u0e02\u0e27\u0e32 nowrap (R2 rev36 \u0e25\u0e2d\u0e01 ListItem subtitle \u2014 wrap break-all \u0e16\u0e2d\u0e14\u0e41\u0e25\u0e49\u0e27). R5 rev48: .row-spacer ถอดทิ้งทั้ง element+CSS (แถว default ไม่จองที่). */
	.bal-badge {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		font-weight: var(--font-weight-semibold);
		border-radius: var(--radius-full);
		white-space: nowrap;
		letter-spacing: 0.02em;
		padding: 2px 6px;
		font-size: 10px;
		line-height: 1.4;
		flex-shrink: 0;
		background: color-mix(in srgb, var(--color-primary) 14%, transparent);
		color: var(--color-primary);
		transform: translateY(-1px);
	}

	/* Loading skeleton: pill \u0e27\u0e48\u0e32\u0e07 surface-variant pulse (\u0e44\u0e21\u0e48\u0e42\u0e0a\u0e27\u0e4c\u0e40\u0e25\u0e02\u0e1c\u0e34\u0e14\u0e23\u0e30\u0e2b\u0e27\u0e48\u0e32\u0e07\u0e42\u0e2b\u0e25\u0e14) + reduced-motion guard (\u0e41\u0e1a\u0e1a discover-spinner). */
	/* R6 rev51 (Commander verbatim floor <390px — skeleton คือ floor เดียวที่เหลือ):
	   min-width 3rem → 0 + width 3rem คงรูป pill + flex-shrink 1 ยอมหดเมื่อจอแคบ
	   (loading มีแต่ชื่อยาว+โครง — ชื่อ ellipsis รับก่อน โครงยอมหดทีหลัง ไม่ค้ำขวา).
	   inner sr-only ถอดแล้ว (เหลือ role=status+aria-label เดิม — SR ประกาศเหมือนเดิม;
	   chromium พิสูจน์ abs-pos sr-only ดัน scrollWidth +10px ใน row แคบ). */
	.bal-skeleton {
		min-width: 0;
		width: 3rem;
		flex-shrink: 1;
		min-height: 1.4em;
		background: var(--color-surface-variant);
		animation: bal-pulse 1.2s ease-in-out infinite;
	}

	@keyframes bal-pulse {
		0%, 100% { opacity: 1; }
		50% { opacity: 0.45; }
	}

	@media (prefers-reduced-motion: reduce) {
		.bal-skeleton {
			animation: none;
		}
	}

	.row-top {
		display: flex;
		flex-direction: row;
		align-items: center;
		justify-content: flex-start;
		gap: var(--space-xs);
		min-width: 0;
		max-width: 100%;
		overflow: hidden;
	}

	.row-top .row-name {
		flex: 0 1 auto;
		min-width: 0;
		font-size: var(--font-size-md);
		font-weight: var(--font-weight-normal);
		color: var(--color-text);
		line-height: var(--line-height-tight);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.row-url {
		font-size: var(--font-size-sm);
		color: var(--color-text-secondary);
		line-height: var(--line-height-tight);
		min-width: 0;
		max-width: 100%;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.empty-text {
		color: var(--color-text-secondary);
		font-size: var(--font-size-sm);
		text-align: center;
		margin: 0;
	}

	/* R7 fixed-modal (rev27+rev28 Commander verbatim) — ตรึงทุกอย่าง
	   ยกเว้นลิสต์ mint: modal flex-column fixed-height + URL block ตรึงบน
	   + Discover header ตรึง + list scroll ข้างในตัวเอง (overflow-y:auto)
	   + more/less footer ตรึงล่าง. รื้อคลาส sticky เดิมทิ้งแล้ว —
	   sticky นอก list เลิกใช้ (grep ต้องเป็น 0). sticky ทำงานแค่ใน
	   mint list ถ้าจำเป็น (row ภายใน list เท่านั้น — รอบนี้ไม่ต้องใช้
	   sticky เลย). CSS/layout อย่างเดียว ไม่แตะ logic.
	   scroll container เดียว = .discover-list; นอกนั้น overflow:hidden. */
	:global(.modal-content) {
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	:global(.modal-dialog) {
		display: flex;
		flex-direction: column;
		height: min(78vh, 640px);
		max-height: 85vh;
		overflow: hidden;
	}

	:global(.modal-body) {
		display: flex;
		flex-direction: column;
		flex: 1 1 auto;
		min-height: 0;
		overflow: hidden;
	}

	.url-block {
		display: flex;
		flex-direction: column;
		gap: var(--space-md);
		flex: 0 0 auto;
		padding-bottom: var(--space-sm);
		border-bottom: 1px solid var(--color-divider);
		background: var(--color-surface);
	}

	/* R9 label md scoped: override เฉพาะ mint page — ห้ามแตะ Input.svelte shared. */
	.url-block :global(.input-label) {
		font-size: var(--font-size-md);
	}

	.discover-block {
		display: flex;
		flex-direction: column;
		gap: var(--space-sm);
		margin-bottom: 0;
		flex: 1 1 auto;
		min-height: 0;
		overflow: hidden;
	}

	.discover-title {
		font-size: var(--font-size-md);
		font-weight: var(--font-weight-semibold);
		margin: 0;
		color: var(--color-text);
		flex: 0 0 auto;
	}

	/* R9 spinner กึ่งกลางโซน: container โหลด flex-1 เต็มโซนลิสต์ +
	   min-height เท่า .discover-list + จัดกึ่งกลาง (ไม่ใช้ padding ตายตัว).
	   CSS/layout อย่างเดียว — logic ไม่แตะ. */
	.discover-state {
		display: flex;
		align-items: center;
		justify-content: center;
		flex: 1 1 auto;
		min-height: 160px;
	}

	/* R8 loading: border-spinner วงกลม (แบบ Send .spinner-lg — var ล้วน)
	   แทน Badge ข้อความ; guard reduced-motion แบบ Setup. */
	.discover-spinner {
		width: 32px;
		height: 32px;
		border: 3px solid var(--color-border);
		border-top-color: var(--color-primary);
		border-radius: 50%;
		animation: discover-spin 0.7s linear infinite;
	}

	@keyframes discover-spin {
		to {
			transform: rotate(360deg);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.discover-spinner {
			animation: none;
		}
		.validating-spinner {
			animation: none;
		}
	}

	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		margin: -1px;
		padding: 0;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
		border: 0;
	}

	.discover-error {
		color: var(--color-error);
		font-size: var(--font-size-sm);
		margin: 0;
	}

	.discover-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		background: var(--color-surface);
		flex: 1 1 auto;
		min-height: 160px;
		overflow-y: auto;
		overscroll-behavior: contain;
	}

	.discover-list li + li {
		border-top: 1px solid var(--color-divider);
	}

	.discover-row {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		width: 100%;
		text-align: start;
		cursor: pointer;
		background: var(--color-surface);
		color: var(--color-text);
		border: 0;
		padding: var(--space-sm) var(--space-md);
		font-size: var(--font-size-md);
		min-height: 48px;
	}

	.discover-row:hover {
		background: var(--color-surface-variant);
	}

	.discover-row:focus-visible {
		outline: 2px solid var(--color-border-focus);
		outline-offset: -2px;
	}

	.discover-row[aria-pressed='true'] {
		background: var(--color-surface-variant);
		box-shadow: inset 3px 0 0 var(--color-primary);
	}

	.mint-logo {
		width: 36px;
		height: 36px;
		border-radius: 50%;
		object-fit: cover;
		flex-shrink: 0;
		background: var(--color-surface-variant);
	}

	/* R9 fallback วงกลมตัวย่อแบบเดิม: 36px เท่า .mint-logo — ใช้เมื่อ
	   ไม่มี icon_url. ไม่ใช่ Nostr picture/kind:0 (ห้ามคืน). */
	.mint-fallback {
		width: 36px;
		height: 36px;
		border-radius: 50%;
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: var(--font-size-md);
		font-weight: var(--font-weight-semibold);
		color: var(--color-text);
		background: var(--color-surface-variant);
	}

	.discover-info {
		flex: 1 1 auto;
		min-width: 0;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	/* R3 rev39+rev40 REWORK (ตัดจากขวาทุกจุด — ลอก ListItem title/subtitle):
	   discover name/url เติม min-width 0 + max-width 100% (ellipsis/nowrap มีแล้ว) —
	   ยาวแค่ไหนก็ตัดไม่ดัน + padding ขวา discover-row มีผลเสมอ. */
	.discover-name {
		font-weight: var(--font-weight-medium);
		min-width: 0;
		max-width: 100%;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.discover-url {
		font-size: var(--font-size-md);
		color: var(--color-text-secondary);
		min-width: 0;
		max-width: 100%;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.discover-footer {
		flex: 0 0 auto;
		padding-top: var(--space-xs);
		background: var(--color-surface);
	}

	.discover-more {
		width: 100%;
		min-height: 44px;
		cursor: pointer;
		border-radius: var(--radius-md);
		border: 1px solid var(--color-border);
		padding: var(--space-sm) var(--space-md);
		font-size: var(--font-size-md);
		background: var(--color-surface-variant);
		color: var(--color-text);
	}

	.discover-more:focus-visible {
		outline: 2px solid var(--color-border-focus);
		outline-offset: 2px;
	}

	/* Modal form — R7: flex-column fixed-height ร่วมกับ modal-body
	   (flex:1 + min-height:0 + overflow:hidden) กัน modal ทั้งใบ scroll */
	.add-mint-form {
		display: flex;
		flex-direction: column;
		gap: var(--space-md);
		flex: 1 1 auto;
		min-height: 0;
		overflow: hidden;
	}

	@media (max-height: 640px) {
		:global(.modal-dialog) {
			height: 88vh;
		}
		.discover-list {
			min-height: 96px;
		}
	}

	.modal-actions {
		display: flex;
		justify-content: flex-end;
		gap: var(--space-sm);
		margin-top: var(--space-sm);
	}

	/* R10 rework (rev48+rev49 Commander verbatim "32px เท่า discover +
	   จัดกลาง"): validating spinner 32px เท่า discover + justify-center
	   กลางช่อง — ไม่ใช่ 16px inline ชิดซ้ายแบบ R9. discover 32px คงเดิม. */
	.validating-inline {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-sm);
		min-height: 48px;
	}

	.validating-spinner {
		width: 32px;
		height: 32px;
		border: 3px solid var(--color-border);
		border-top-color: var(--color-primary);
		border-radius: 50%;
		animation: discover-spin 0.7s linear infinite;
	}

	.validated-head {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		min-width: 0;
	}

	.validated-logo {
		width: 36px;
		height: 36px;
		border-radius: 50%;
		object-fit: cover;
		flex-shrink: 0;
		background: var(--color-surface-variant);
	}

	/* R10 preview fallback: วงกลมตัวย่อ 36px เหมือน .mint-fallback ในลิสต์ —
	   ใช้เมื่อ previewIconUrl ว่าง (ไม่มี icon_url). */
	.validated-fallback {
		width: 36px;
		height: 36px;
		border-radius: 50%;
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: var(--font-size-md);
		font-weight: var(--font-weight-semibold);
		color: var(--color-text);
		background: var(--color-surface-variant);
	}

	.validated-info {
		display: flex;
		flex-direction: column;
		gap: var(--space-xs);
	}

	/* R3 rev39+rev40 REWORK (ตัดจากขวาทุกจุด — ลอก ListItem title):
	   validated-name (preview card) min-width 0 + ellipsis nowrap —
	   ยาวแค่ไหนก็ตัดไม่ดัน modal + title attr เก็บเต็ม (template). */
	.validated-name {
		font-size: var(--font-size-md);
		margin: 0;
		color: var(--color-text);
		min-width: 0;
		max-width: 100%;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
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
