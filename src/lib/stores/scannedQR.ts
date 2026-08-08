import { writable } from 'svelte/store';

export const scannedQRValue = writable<string | null>(null);
