/**
 * Base64url encoding/decoding utilities.
 * Uses the standard base64url alphabet (RFC 4648 §5).
 */

// Standard base64 to base64url
function toBase64url(base64: string): string {
	return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// base64url to standard base64
function fromBase64url(base64url: string): string {
	let base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
	// Restore padding
	while (base64.length % 4 !== 0) {
		base64 += '=';
	}
	return base64;
}

export const base64url = {
	encode(data: Uint8Array): string {
		// Browser-compatible base64 encoding
		let binary = '';
		for (let i = 0; i < data.length; i++) {
			binary += String.fromCharCode(data[i]);
		}
		const base64 = btoa(binary);
		return toBase64url(base64);
	},

	decode(encoded: string): Uint8Array {
		const base64 = fromBase64url(encoded);
		const binary = atob(base64);
		const bytes = new Uint8Array(binary.length);
		for (let i = 0; i < binary.length; i++) {
			bytes[i] = binary.charCodeAt(i);
		}
		return bytes;
	}
};
