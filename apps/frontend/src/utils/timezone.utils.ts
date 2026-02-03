/**
 * Fetches timezone from IP-based geolocation API with optional retry
 */
async function fetchTimezoneFromIP(retryCount: number = 1): Promise<string | null> {
	const url = 'http://ip-api.com/json/?fields=timezone';
	const headers = { 'Accept': 'application/json' };

	for (let attempt = 0; attempt <= retryCount; attempt++) {
		try {
			if (attempt > 0) {
				// Wait 1 second before retry
				await new Promise(resolve => setTimeout(resolve, 1000));
				console.warn(`IP-based timezone detection retry attempt ${attempt}`);
			}

			const response = await fetch(url, { method: 'GET', headers });

			if (!response.ok) {
				throw new Error(`HTTP ${response.status}: ${response.statusText}`);
			}

			const data = await response.json();
			if (data.timezone) {
				return data.timezone;
			}
		} catch (error) {
			console.warn(`IP-based timezone detection failed (attempt ${attempt + 1}):`, error);
			if (attempt === retryCount) {
				// All retries exhausted
				return null;
			}
		}
	}

	return null;
}

/**
 * Synchronous browser timezone detection
 */
export function getBrowserTimezone(): string | null {
	try {
		return Intl.DateTimeFormat().resolvedOptions().timeZone;
	} catch (error) {
		console.warn('Browser timezone detection failed:', error);
		return null;
	}
}

/**
 * Detects user's current timezone with fallback to IP-based geolocation
 */
export async function detectUserTimezone(): Promise<string | null> {
	// Primary: Browser timezone detection
	const browserTimezone = getBrowserTimezone();
	if (browserTimezone) {
		return browserTimezone;
	}

	// Fallback: IP-based geolocation via ipapi.co
	return await fetchTimezoneFromIP(1); // Retry once
}