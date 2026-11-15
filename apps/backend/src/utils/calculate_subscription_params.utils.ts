import { API_PRODUCTS, type ApiProductSku } from "@connected-repo/zod-schemas/enums.zod";

/**
 * Get product configuration by SKU
 * @param sku - API product SKU
 * @returns Product configuration object or undefined if not found
 */
export function getProductConfig(sku: ApiProductSku) {
	return API_PRODUCTS.find((product) => product.sku === sku);
}

/**
 * Calculate subscription parameters from product config and quantity
 * @param sku - API product SKU
 * @param quantity - Number of product units
 * @returns Object with maxRequests and validityDays
 * @throws Error if SKU is not found
 */
export function calculateSubscriptionParams(sku: ApiProductSku, quantity: number) {
	const product = getProductConfig(sku);

	if (!product) {
		throw new Error(`Unknown product SKU: ${sku}`);
	}

	return {
		maxRequests: product.unitSize * quantity,
		validityDays: product.validityDays,
	};
}
