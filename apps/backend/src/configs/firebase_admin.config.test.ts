import { generateKeyPairSync } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

const loadWith = async (overrides: Record<string, string | undefined>) => {
	vi.resetModules();
	vi.doMock("@backend/configs/env.config", async (importOriginal) => {
		const original = await importOriginal<typeof import("@backend/configs/env.config")>();
		return { ...original, env: { ...original.env, ...overrides } };
	});
	return import("./firebase_admin.config.js");
};

// The default app outlives a module reload, so the test that creates it runs last.
describe("firebase admin", () => {
	afterEach(() => {
		vi.doUnmock("@backend/configs/env.config");
		vi.resetModules();
	});

	it("is off without credentials", async () => {
		const { firebaseMessaging } = await loadWith({
			FIREBASE_SERVICE_ACCOUNT_JSON: undefined,
			GOOGLE_APPLICATION_CREDENTIALS: undefined,
		});
		expect(firebaseMessaging).toBeNull();
	});

	it("is off, not failing, when the service account is not JSON", async () => {
		const { firebaseMessaging } = await loadWith({
			FIREBASE_SERVICE_ACCOUNT_JSON: "not json",
		});
		expect(firebaseMessaging).toBeNull();
	});

	it("builds the messaging client from a service account", async () => {
		const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
		const serviceAccount = {
			project_id: "example-project",
			client_email: "push@example-project.iam.gserviceaccount.com",
			private_key: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
		};
		const { firebaseMessaging } = await loadWith({
			FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify(serviceAccount),
		});
		expect(firebaseMessaging?.app.options.credential).toBeDefined();
		expect(firebaseMessaging?.app.name).toBe("[DEFAULT]");
	});
});
