import { importPKCS8, SignJWT } from "jose";

interface AppleConfig {
	clientId: string;
	teamId: string;
	keyId: string;
	privateKey: string;
}

/**
 * Generates an Apple Client Secret (JWT) for authentication.
 * Apple requires this secret to be a signed JWT using their private key.
 */
export async function generateAppleClientSecret(
	config: AppleConfig,
): Promise<string> {
	const { clientId, teamId, keyId, privateKey } = config;

	if (!clientId || !teamId || !keyId || !privateKey) {
		throw new Error("Missing Apple configuration for client secret generation");
	}

	// The private key must be in PKCS8 format
	const ecPrivateKey = await importPKCS8(privateKey, "ES256");

	const clientSecret = await new SignJWT({})
		.setProtectedHeader({
			alg: "ES256",
			kid: keyId,
			typ: "JWT",
		})
		.setIssuer(teamId)
		.setIssuedAt()
		.setExpirationTime("1h") // Apple secrets should be short-lived or refreshed
		.setAudience("https://appleid.apple.com")
		.setSubject(clientId)
		.sign(ecPrivateKey);

	return clientSecret;
}
