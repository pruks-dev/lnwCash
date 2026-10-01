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
			...ts.configs.recommended.rules,
			'no-undef': 'off',
			'@typescript-eslint/no-unused-vars': 'warn',
			'@typescript-eslint/no-explicit-any': 'warn',
			'@typescript-eslint/ban-ts-comment': 'warn',
			'@typescript-eslint/no-require-imports': 'warn',
			'preserve-caught-error': 'warn',
			'no-useless-assignment': 'warn'
		}
	},
	{
		files: ['**/*.{js,mjs}'],
		languageOptions: {
			globals: { ...globals.browser, ...globals.node }
		},
		rules: { 'no-unused-vars': 'warn' }
	},
	...svelte.configs['flat/recommended'],
	{
		files: ['**/*.svelte'],
		languageOptions: {
			parser: svelteParser,
			parserOptions: { parser: tsparser },
			globals: { ...globals.browser, ...globals.node }
		},
		rules: {
			'no-unused-vars': 'warn',
			'no-useless-assignment': 'warn',
			'svelte/require-each-key': 'warn',
			'svelte/no-useless-children-snippet': 'warn',
			'svelte/prefer-writable-derived': 'warn',
			'svelte/prefer-svelte-reactivity': 'warn',
			'svelte/no-unused-svelte-ignore': 'warn'
		}
	},
	prettier,
	{
		ignores: [
			'**/node_modules/**',
			'**/dist/**',
			'**/.svelte-kit/**',
			'**/dev-dist/**',
			'**/android/**',
			'**/ios/**',
			'**/capacitor.config.*',
			'**/vite.config.ts',
			'**/svelte.config.js',
			'**/.arx-evidence/**',
			'**/audit-*.mjs'
		]
	}
];
