import { mount } from 'svelte';
import './app.css';
import './lib/design/tokens.css';
import './lib/design/animations.css';
import App from './App.svelte';
import { setupI18n } from './lib/i18n';
import { initTheme } from './lib/design/theme';

await setupI18n();
const themeCleanup = initTheme();

const app = mount(App, {
	target: document.getElementById('app')!
});

export default app;
