import { writable } from 'svelte/store';

export const mintConfirmed = writable(0);
export const mintBanner = writable<{ show: boolean; amount: number }>({ show: false, amount: 0 });

let bannerTimer: ReturnType<typeof setTimeout>;

export function notifyMintConfirmed(amount?: number) {
    mintConfirmed.update(n => n + 1);
    if (amount) {
        mintBanner.set({ show: true, amount });
        clearTimeout(bannerTimer);
        bannerTimer = setTimeout(() => mintBanner.set({ show: false, amount: 0 }), 5000);
    }
}
