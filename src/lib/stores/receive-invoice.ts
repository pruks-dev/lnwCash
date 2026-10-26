// TASK-4300-owned (INTENT-042/043 shared flag) — placeholder per spec.
// Shape: writable boolean, default false. True while Receive shows an open
// invoice QR (Receive owns that round; the central 5s poll must skip).
// The authoritative version lands with TASK-4300; this shim matches the
// spec'd shape exactly so TASK-4301 (central-pause) can import the same path.
import { writable } from 'svelte/store';

/** True while a Receive invoice QR is open — central poll pauses. */
export const receiveInvoiceOpen = writable<boolean>(false);
