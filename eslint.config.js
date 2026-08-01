import js from '@eslint/js';
import ts from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import svelte from 'eslint-plugin-svelte';
import svelteParser from 'svelte-eslint-parser';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default [
	js.configs.recommended,
	{
		files: ['**/*.{ts,mts,cts}'],
		languageOptions: {
			parser: tsparser,
			parserOptions: {
				ecmaVersion: 'latest',
				sourceType: 'module'
			},
			globals: {
				...globals.browser,
				...globals.node
			}
		},
		plugins: {
			'@typescript-eslint': ts
		},
		rules: {
			...ts.configs.recommended.rules
		}
	},
	...svelte.configs['flat/recommended'],
	{
		files: ['**/*.svelte'],
		languageOptions: {
			parser: svelteParser,
			parserOptions: {
				parser: tsparser
			}
		}
	},
	prettier,
	{
		ignores: [
			'**/node_modules/**',
			'**/dist/**',
			'**/.svelte-kit/**',
			'**/android/**',
			'**/ios/**',
			'**/capacitor.config.*',
			'**/vite.config.ts',
			'**/svelte.config.js',
			'**/eslint.config.js'
		]
	}
];
