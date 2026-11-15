import { tbus } from "@backend/events/tbus";
import {
	notificationDispatchHandler,
	queueNotification,
} from "@backend/modules/notifications/services/dispatch.notifications.service";
import { triggerNotification } from "@backend/utils/notifications.utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

const request = {
	workflowId: "test-push",
	to: { subscriberId: "user-1" },
	payload: { title: "Hi", body: "test" },
};

describe("queueNotification", () => {
	beforeEach(() => {
		vi.mocked(tbus.send).mockClear();
	});

	it("queues one notification_dispatch task", async () => {
		await queueNotification(request, { singletonKey: "k" });
		expect(tbus.send).toHaveBeenCalledTimes(1);
		const sent = JSON.stringify(vi.mocked(tbus.send).mock.calls);
		expect(sent).toContain("notification_dispatch");
		expect(sent).toContain('"test-push"');
	});

	it("never throws when the queue cannot be written", async () => {
		vi.mocked(tbus.send).mockRejectedValueOnce(new Error("down"));
		await expect(queueNotification(request)).resolves.toBeUndefined();
	});

	it("triggerNotification does nothing without a Novu key", async () => {
		await expect(
			triggerNotification({ workflowId: "x", subscriberId: "y" }),
		).resolves.toBeUndefined();
	});

	it("the task handler does nothing without a Novu key", async () => {
		await expect(
			notificationDispatchHandler({
				input: { ...request, to: { subscriberId: "email:a@example.com", email: "a@example.com" } },
			}),
		).resolves.toBeUndefined();
	});
});
