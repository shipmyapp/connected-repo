import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// A fake Novu client at the boundary (configs/novu.config.ts). Without a
// key `novu` is null; that path is covered in dispatch.notifications.service.test.ts.
const h = vi.hoisted(() => ({
	novu: { trigger: vi.fn(), subscribers: { create: vi.fn() } },
}));
vi.mock("@backend/configs/novu.config", () => ({ novu: h.novu }));

const answering = (status: string) => {
	h.novu.trigger.mockResolvedValue({ result: { status, transactionId: "t-1" } });
	return h.novu;
};

// The test setup has already loaded these modules with the real client:
// load them again so they see the fake.
let utils: typeof import("@backend/utils/notifications.utils.js");
let logger: typeof import("@backend/utils/logger.utils.js").logger;
beforeAll(async () => {
	vi.resetModules();
	utils = await import("@backend/utils/notifications.utils.js");
	logger = (await import("@backend/utils/logger.utils.js")).logger;
});

afterEach(() => {
	vi.clearAllMocks();
	vi.restoreAllMocks();
});

describe("notifications.utils", () => {
	it("triggers without empty strings, nulls or undefined at any depth, keeping 0, false and arrays", async () => {
		const novu = answering("processed");
		await utils.triggerNotification({
			workflowId: "x",
			subscriberId: "user-1",
			payload: { a: "", b: null, c: undefined, d: 0, e: false, f: [""], g: { h: "", i: "x" } },
		});
		expect(novu.trigger).toHaveBeenCalledWith(
			expect.objectContaining({ payload: { d: 0, e: false, f: [""], g: { i: "x" } } }),
		);
	});

	it("emailSubscriberId is one subscriber per address, whatever its case or spacing", () => {
		expect(utils.emailSubscriberId(" Ada@Example.com ")).toBe("email:ada@example.com");
	});

	it("upserts a subscriber with its address", async () => {
		await utils.upsertSubscriber("email:ada@example.com", { email: "ada@example.com" });
		expect(h.novu.subscribers.create).toHaveBeenCalledWith(
			expect.objectContaining({ subscriberId: "email:ada@example.com", email: "ada@example.com" }),
		);
	});

	it("triggers with the empty values dropped", async () => {
		const novu = answering("processed");
		await utils.triggerNotification({
			workflowId: "team-invitation",
			subscriberId: "user-1",
			payload: { name: "", teamName: "Acme" },
		});
		expect(novu.trigger).toHaveBeenCalledWith(
			expect.objectContaining({ payload: { teamName: "Acme" }, to: { subscriberId: "user-1" } }),
		);
	});

	it("throws on Novu's error status, so a task retries, and keeps an address out of the log", async () => {
		answering("error");
		const error = vi.spyOn(logger, "error").mockImplementation(() => undefined);
		await expect(
			utils.triggerNotification({
				workflowId: "team-invitation",
				subscriberId: "email:ada@example.com",
			}),
		).rejects.toThrow('Novu trigger failed for workflow "team-invitation"');
		expect(JSON.stringify(error.mock.calls)).not.toContain("ada@example.com");
	});
});
