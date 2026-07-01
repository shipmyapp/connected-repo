import { z } from "zod";

/* Integer Types */
export const zSmallint = (min = -32768, max = 32767) => z.int().min(min).max(max);
export const zInteger = (min = -2147483648, max = 2147483647) => z.int32().min(min).max(max);
export const zBigint = (min = -9223372036854775808n, max = 9223372036854775807n) =>
	z.bigint().min(min).max(max);

export const zTimeEpoch = z.coerce.number().int().min(0);

/**
 * Regex-based decimal validator. The previous toString()-based version
 * mis-counted significant digits for scientific notation (e.g. `1e10`) and
 * mishandled leading zeros. This version normalises the input to a canonical
 * string then matches against a precision-aware regex.
 */
export const zDecimal = (precision: number, scale: number, min?: number, max?: number) => {
	const maxStrLen = 1 + Math.max(1, precision - scale) + (scale > 0 ? 1 : 0) + scale;

	const intDigits = precision - scale;
	const integerRegexPart = intDigits > 0 ? `0*\\d{1,${intDigits}}` : `0+`;
	const decimalPart = scale > 0 ? `(\\.\\d{1,${scale}})?` : "";
	const signPart = min !== undefined && min >= 0 ? "" : "-?";
	const regex = new RegExp(`^${signPart}${integerRegexPart}${decimalPart}$`);

	const regexMessage = `Value must be a valid decimal with at most ${precision - scale} integer digits and ${scale} decimal places`;

	let schema = z.preprocess(
		(val) => {
			if (val === null || val === undefined) return val;
			const str = typeof val === "string" ? val : String(val);
			return str.trim().replace(/^(-?)0+(?=\d)/, "$1");
		},
		z.string().min(1).max(maxStrLen).regex(regex, regexMessage),
	);

	if (min !== undefined) {
		schema = schema.refine(
			(val) => {
				const num = Number(val);
				return !Number.isNaN(num) && num >= min;
			},
			{ message: `Value must be greater than or equal to ${min}` },
		);
	}

	if (max !== undefined) {
		schema = schema.refine(
			(val) => {
				const num = Number(val);
				return !Number.isNaN(num) && num <= max;
			},
			{ message: `Value must be less than or equal to ${max}` },
		);
	}

	return schema;
};

/* Common Types */

export const zString = z.string().trim();

export const zVarchar = (minLength = 0, maxLength = 255) => zString.min(minLength).max(maxLength);

export const zText = (minLength = 0) => zString.min(minLength);

export const zTimestamps = {
	createdAt: zTimeEpoch,
	updatedAt: zTimeEpoch,
};

// Decimal helpers — zero is allowed (B2B inventory may legitimately have
// zero-value items, free promo prices, etc.). Tighten per-call via the min arg
// if a stricter floor is needed for a specific field.
export const zPercent = zDecimal(5, 2, 0, 100.0);
export const zPrice = zDecimal(10, 2, 0);
export const zQuantity = zDecimal(11, 3, 0);
export const zAmount = (min = Number.NEGATIVE_INFINITY, max = Number.POSITIVE_INFINITY) =>
	zDecimal(15, 2, min, max);
export const zAmountNonNegative = zAmount(0);

/* Compliance Doc Types */
export const zGSTIN = zString
	.toUpperCase()
	.length(15)
	.regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/, "Invalid GSTIN format")
	.refine((gstin: string) => {
		const GSTIN_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
		const chars = gstin.slice(0, 14);
		const len = GSTIN_CHARS.length;

		const total = chars.split("").reduce((acc, char, i) => {
			const codePoint = GSTIN_CHARS.indexOf(char);
			const weight = i % 2 === 0 ? 1 : 2;
			const product = codePoint * weight;
			return acc + Math.floor(product / len) + (product % len);
		}, 0);

		const checksumCodePoint = (len - (total % len)) % len;
		return gstin[14] === GSTIN_CHARS[checksumCodePoint];
	}, "Invalid GSTIN checksum");

export const zPAN = zString.toUpperCase().length(10).regex(/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/);

export const zUdyogAadhaar = zString
	.toUpperCase()
	.length(12)
	.regex(/^[2-9]{1}[0-9]{3}\s[0-9]{4}\s[0-9]{4}$/);

export const zUdyamRegistrationNumber = zString
	.toUpperCase()
	.length(19)
	.regex(/^UDYAM-[A-Z]{2}-[0]{2}-\d{7}$/);

/* Contact Types */
export const zPhoneNumber = z
	.string()
	.trim()
	.min(10, "Phone number must be at least 10 digits")
	.max(15, "Phone number must be at most 15 digits")
	.regex(/^[+]?[1-9][\d\s\-()]{8,14}$/, "Invalid phone number format");

/* Location Types */
export const zLatitude = zString.regex(
	/^(\+|-)?(?:90(?:(?:\.0{1,6})?)|(?:[0-9]|[1-8][0-9])(?:(?:\.[0-9]{1,6})?))$/,
);
export const zLongitude = zString.regex(
	/^(\+|-)?(?:180(?:(?:\.0{1,6})?)|(?:[0-9]|[1-9][0-9]|1[0-7][0-9])(?:(?:\.[0-9]{1,6})?))$/,
);

export const zTimezone = zString;

export const uniqueTimeArrayZod = z
	.array(z.iso.time({ precision: -1 }))
	.refine((times) => new Set(times).size === times.length, {
		message: "Reminder times must be unique",
	})
	.default([]);

/**
 * Normalises query-string params that may arrive as a single string OR an
 * array of strings into `string[]`. Use for repeated query keys
 * (e.g. `?tag=a&tag=b`) — without this, Zod refuses the single-value form.
 */
export const zStringArrayQuery = z.preprocess((val) => {
	if (val === undefined || val === null) return undefined;
	if (Array.isArray(val)) return val;
	return [val];
}, z.array(z.string()));
