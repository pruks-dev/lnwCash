import type { MintConfig } from './config';
import { createPlaceholderConfig, normalizeSupportedNuts } from './config';

export interface MintValidationResult {
	success: boolean;
	error?: string;
	config?: MintConfig;
	nuts?: string[];
}

/**
 * Validate a mint URL by checking /v1/info endpoint
 */
export async function validateMintUrl(
	url: string,
	_existingUrls: string[] = []
): Promise<MintValidationResult> {
	try {
		const normalizedUrl = url.replace(/\/+$/, '');
		const response = await fetch(`${normalizedUrl}/v1/info`, {
			method: 'GET',
			headers: { 'Accept': 'application/json' },
			signal: AbortSignal.timeout(5000)
		});

		if (!response.ok) {
			return { success: false, error: `Server returned ${response.status}` };
		}

		const data = await response.json();
		if (!data.name && !data.pubkey) {
			return { success: false, error: 'Not a valid Cashu mint' };
		}

		const nuts = data.nuts ? normalizeSupportedNuts(data.nuts) : [];

		const config: MintConfig = {
			url: normalizedUrl,
			name: data.name ?? '',
			pubkey: data.pubkey ?? '',
			version: data.version ?? '',
			supported_nuts: nuts,
			cached_endpoints: data.nuts?.['19']?.cached_endpoints ?? [],
			ttl: data.nuts?.['19']?.ttl ?? 0,
			last_info_fetch: Date.now()
		};

		return { success: true, config, nuts };
	} catch (e) {
		return {
			success: false,
			error: e instanceof Error ? e.message : 'Cannot reach mint'
		};
	}
}
