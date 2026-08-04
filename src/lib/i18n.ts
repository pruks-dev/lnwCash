import { register, init, getLocaleFromNavigator, waitLocale } from 'svelte-i18n';
import { getSettings } from './storage/local';

register('th', () => import('../locales/th.json'));
register('en', () => import('../locales/en.json'));

export async function setupI18n(): Promise<void> {
	const savedLocale = getSettings().language;
	const locale = savedLocale || getLocaleFromNavigator() || 'th';
	init({
		fallbackLocale: 'th',
		initialLocale: locale
	});
	await waitLocale(locale);
}
