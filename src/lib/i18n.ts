import { register, init, getLocaleFromNavigator, waitLocale } from 'svelte-i18n';

register('th', () => import('../locales/th.json'));
register('en', () => import('../locales/en.json'));

export async function setupI18n(): Promise<void> {
	const locale = getLocaleFromNavigator() ?? 'th';
	init({
		fallbackLocale: 'th',
		initialLocale: locale
	});
	await waitLocale(locale);
}
