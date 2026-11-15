import { encryptStoredOAuthTokens } from "@backend/modules/auth/services/encrypt_stored_tokens.auth.service";

// One-off after deploying account.encryptOAuthTokens: encrypts provider
// tokens written before it. Safe to run again.
encryptStoredOAuthTokens()
	.then((changed) => {
		console.log(`Encrypted provider tokens on ${changed} account(s)`);
		process.exit(0);
	})
	.catch((error) => {
		console.error("Failed to encrypt stored provider tokens");
		console.error(error);
		process.exit(1);
	});
