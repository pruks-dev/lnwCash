import 'fake-indexeddb/auto';

// Mock Secure Context for tests — crypto.subtle requires isSecureContext === true
// F-017: Added to support assertSecureContext() guard in encrypt.ts
// jsdom exposes isSecureContext as a getter on Window.prototype;
// we shadow it with an instance property on globalThis.
Object.defineProperty(globalThis, 'isSecureContext', {
	get: () => true,
	configurable: true
});
