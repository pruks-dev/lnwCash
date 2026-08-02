import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
	appId: 'cash.lnw.wallet',
	appName: 'LNWCASH',
	webDir: 'dist',
	server: {
		androidScheme: 'https'
	},
	android: {
		allowMixedContent: true
	},
	plugins: {
		/**
		 * capacitor-barcode-scanner — uses MLKit on Android, AVFoundation on iOS.
		 * Provides native QR/barcode scanning experience.
		 * Fallback: browser Barcode Detection API (BarcodeDetector) or manual input.
		 */
		// BarcodeScanner configuration (no plugin-level config needed)

		/**
		 * capacitor-secure-storage-plugin — uses Android Keystore / iOS Keychain.
		 * Stores encrypted keys at OS level for defense-in-depth.
		 * Fallback: localStorage (keys encrypted with AES-GCM + PBKDF2).
		 */
		// SecureStoragePlugin configuration (no plugin-level config needed)
	}
};

export default config;
