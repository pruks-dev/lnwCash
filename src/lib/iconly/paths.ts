/**
 * Iconly 3.0 Path Definitions — TASK-142
 * Centralized SVG path store for unified <Iconly> component.
 * Each entry maps a name to its SVG path(s).
 */

export interface IconPathEntry {
	/** SVG path `d` attribute values */
	paths: string[];
	/** Optional: filled shapes instead of stroked */
	filled?: boolean;
}

/**
 * All available icon paths.
 * Keys are used as the `name` prop on <Iconly>.
 */
export const ICON_PATHS: Record<string, IconPathEntry> = {
	// TASK-142: 2-category send/receive
	send: {
		paths: ['M4.08 15.05L10.6 8.53C11.37 7.76 12.63 7.76 13.4 8.53L19.92 15.05'],
		filled: false
	},
	receive: {
		paths: ['M19.92 8.95L13.4 15.47C12.63 16.24 11.37 16.24 10.6 15.47L4.08 8.95'],
		filled: false
	},
	wallet: {
		paths: ['M3 7V19C3 20.1046 3.89543 21 5 21H19C20.1046 21 21 20.1046 21 19V9C21 7.89543 20.1046 7 19 7H3Z', 'M15 11H17'],
		filled: false
	},
	// TASK-142: empty state icon
	history: {
		paths: [
			'M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z',
			'M12 6V12L16 14'
		],
		filled: false
	},
	// TASK-145: history button
	menu: {
		paths: ['M4 6h16M4 12h16M4 18h16'],
		filled: false
	},
	'arrow-right': {
		paths: ['M9 18l6-6-6-6'],
		filled: false
	}
};

/**
 * Type-safe icon name derived from the path map keys.
 */
export type IconlyName = keyof typeof ICON_PATHS;

/**
 * Resolve an icon name to its path entry, with fallback.
 */
export function resolveIconPath(name: string): IconPathEntry {
	return ICON_PATHS[name] ?? ICON_PATHS['send'];
}
