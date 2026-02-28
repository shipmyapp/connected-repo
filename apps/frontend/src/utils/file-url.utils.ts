/**
 * Utility for managing virtual URLs that bridge the main thread and the 
 * Origin Private File System (OPFS).
 * 
 * NOTE ON SCOPING & PERSISTENCE:
 * - OPFS is strictly origin-scoped (e.g., app.teziapp.com). No other apps can access these files.
 * - OPFS is shared across all tabs, windows, and the PWA running on the same origin.
 * - This persistence allows media to survive page reloads and browser restarts without memory overhead.
 */

/**
 * Prefix for virtual media URLs served by the Service Worker from OPFS.
 */
export const OPFS_MEDIA_PREFIX = '/opfs-media/';

/**
 * Generates a virtual URL for a file stored in OPFS.
 * This URL is intercepted by the Service Worker and served directly from OPFS.
 * 
 * @param path The relative path to the file in OPFS (e.g., 'files/123/original')
 * @returns A virtual URL string
 */
export const getOpfsMediaUrl = (path: string | undefined | null): string | undefined => {
  if (!path) return undefined;
  return `${OPFS_MEDIA_PREFIX}${path}`;
};
