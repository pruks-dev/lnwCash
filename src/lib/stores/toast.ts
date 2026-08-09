import { writable } from 'svelte/store';

export const toastMessage = writable('');
export const toastType = writable<'success' | 'error' | 'info'>('info');
let timer: ReturnType<typeof setTimeout>;

export function showToast(msg: string, type: 'success' | 'error' | 'info' = 'info') {
	toastMessage.set(msg);
	toastType.set(type);
	clearTimeout(timer);
	timer = setTimeout(() => toastMessage.set(''), 4000);
}
