<script lang="ts">
	import { _ } from 'svelte-i18n';
	import { locale } from 'svelte-i18n';
	import { getSettings, setSettings } from '$lib/storage/local';

	interface Props {
		onLanguageChanged?: (lang: string) => void;
	}

	let { onLanguageChanged }: Props = $props();

	let currentLang: string = $state('th');

	$effect(() => {
		try {
			const settings = getSettings();
			currentLang = settings.language || 'th';
		} catch {
			currentLang = 'th';
		}
	});

	function switchLanguage(lang: string) {
		currentLang = lang;
		locale.set(lang);
		setSettings({ language: lang });
		onLanguageChanged?.(lang);
	}
</script>

<div class="language-switch">
	<span class="title">{$_('screen.language.title')}</span>
	<div class="toggle">
		<button
			type="button"
			class="lang-btn"
			class:active={currentLang === 'th'}
			onclick={() => switchLanguage('th')}
		>
			{$_('screen.language.th')}
		</button>
		<button
			type="button"
			class="lang-btn"
			class:active={currentLang === 'en'}
			onclick={() => switchLanguage('en')}
		>
			{$_('screen.language.en')}
		</button>
	</div>
</div>

<style>
	.language-switch {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.75rem;
		padding: 0.75rem 1rem;
	}

	.title {
		font-size: 0.8rem;
		color: #888;
		font-weight: 600;
	}

	.toggle {
		display: flex;
		gap: 0;
		border: 1px solid #e0e0e0;
		border-radius: 8px;
		overflow: hidden;
	}

	.lang-btn {
		padding: 0.35rem 0.75rem;
		font-size: 0.8rem;
		font-weight: 600;
		color: #888;
		background: #f8f8f8;
		border: none;
		cursor: pointer;
		transition: all 0.2s;
	}

	.lang-btn.active {
		color: white;
		background: #f7931a;
	}

	.lang-btn:hover:not(.active) {
		background: #eee;
	}
</style>
