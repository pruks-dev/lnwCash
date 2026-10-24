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
			<div class="active-mint-header">
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
						<h2 class="mint-name">{mint.name || mint.url}</h2>
						<!-- R12 rework (rev57 Commander verbatim): ถอดป้าย default ออกทั้ง UI —
						     mint บอสเหมือนเจ้าอื่น ไม่บอกว่าเป็น default. logic หลังบ้าน
						     (isDefaultMint/getDefaultMintUrl/setDefault) คงเดิม 100%. -->
						<Badge variant="success" size="sm">{$_('mint.settings.active')}</Badge>
					</div>
					<p class="mint-url">{mint.url}</p>
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
								<p class="validated-name"><strong>{validatedConfig.name || validatedConfig.url}</strong></p>
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
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		margin-bottom: var(--space-sm);
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
		min-height: 56px;
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
	}

	.discover-name {
		font-weight: var(--font-weight-medium);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.discover-url {
		font-size: var(--font-size-md);
		color: var(--color-text-secondary);
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
