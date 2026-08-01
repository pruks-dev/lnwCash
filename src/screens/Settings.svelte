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

	// TASK-050 Icons
	import Mint from '$lib/components/icons/Mint.svelte';
	import SettingsIcon from '$lib/components/icons/Settings.svelte';
	import ArrowRight from '$lib/components/icons/ArrowRight.svelte';
	import ArrowLeft from '$lib/components/icons/ArrowLeft.svelte';

	interface Props {
		onBack?: () => void;
	}

	let { onBack }: Props = $props();

	let currentLang: string = $state('th');
	let currentTheme: ThemeMode = $state('system');

	$effect(() => {
		try {
			const settings = getSettings();
			currentLang = settings.language || 'th';
			currentTheme = settings.theme || 'system';
		} catch {
			currentLang = 'th';
			currentTheme = 'system';
		}
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

	function handleBack() {
		onBack?.();
	}
</script>

<div class="settings-screen" role="main" aria-label={$_('screen.settings.title')}>

	<div class="top-bar">
		<button type="button" class="back-btn" onclick={handleBack} aria-label={$_('common.back')}>
			<ArrowLeft size={24} />
		</button>
		<Heading level="h2" align="center">{$_('screen.settings.title')}</Heading>
		<div class="top-spacer"></div>
	</div>

	<!-- ─── Mint Section ──────────────────────────────── -->
	<Card variant="basic" padding="md">
		<div class="section">
			<Heading level="h4">{$_('screen.settings.mint_section')}</Heading>
			<Body size="sm" color="secondary">{$_('screen.settings.mint_description')}</Body>
			<ListItem
				title={$_('screen.settings.mint_manage')}
				onclick={() => navigateTo('home')}
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
			<div class="option-row">
				<button
					type="button"
					class="option-btn"
					class:active={currentLang === 'th'}
					onclick={() => switchLanguage('th')}
				>
					{$_('screen.language.th')}
				</button>
				<button
					type="button"
					class="option-btn"
					class:active={currentLang === 'en'}
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
			<div class="option-row option-row-3">
				<button
					type="button"
					class="option-btn"
					class:active={currentTheme === 'light'}
					onclick={() => switchTheme('light')}
				>
					{$_('screen.settings.theme_light')}
				</button>
				<button
					type="button"
					class="option-btn"
					class:active={currentTheme === 'dark'}
					onclick={() => switchTheme('dark')}
				>
					{$_('screen.settings.theme_dark')}
				</button>
				<button
					type="button"
					class="option-btn"
					class:active={currentTheme === 'system'}
					onclick={() => switchTheme('system')}
				>
					{$_('screen.settings.theme_system')}
				</button>
			</div>
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
					<Body size="sm" weight="semibold">1.0.0</Body>
				</div>
				<div class="detail-row">
					<Body size="sm" color="secondary">{$_('screen.settings.about_license')}</Body>
					<Body size="sm" weight="semibold">MIT</Body>
				</div>
			</div>
		</div>
	</Card>

	<div class="bottom-spacer"></div>
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

	.detail-row {
		display: flex;
		justify-content: space-between;
	}

	.bottom-spacer {
		height: 80px;
	}
</style>
