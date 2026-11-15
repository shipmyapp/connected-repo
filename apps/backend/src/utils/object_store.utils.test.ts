import { db } from "@backend/db/db";
import {
	drainObjectDeletions,
	queueObjectDeletions,
} from "@backend/modules/files/services/object_deletion.files.service";
import { generatePublicUrl, objectKeyFromPublicUrl } from "@backend/utils/cdn.utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { deleteObjects } from "./object_store.utils";

// The bucket is mocked at its client: no object store is reached.
const send = vi.hoisted(() => vi.fn());
vi.mock("@backend/utils/s3.client", () => ({ s3Client: { send } }));

type DeleteInput = { Delete: { Objects: { Key: string }[] } };
const keysSent = (call: unknown[]): string[] =>
	(call[0] as { input: DeleteInput }).input.Delete.Objects.map((o) => o.Key);

describe("deleting bucket objects", () => {
	beforeEach(() => {
		send.mockReset();
	});

	it("sends 1 000 keys per request", async () => {
		send.mockResolvedValue({});
		const keys = Array.from({ length: 2500 }, (_, i) => `k/${i}`);
		const { deleted, failed } = await deleteObjects(keys);
		expect(send).toHaveBeenCalledTimes(3);
		expect(send.mock.calls.map((c) => keysSent(c).length)).toEqual([1000, 1000, 500]);
		expect(deleted).toHaveLength(2500);
		expect(failed).toEqual([]);
	});

	it("reports a key the bucket refused, and fails only the batch that threw", async () => {
		send.mockResolvedValueOnce({ Errors: [{ Key: "k/1", Message: "AccessDenied" }] });
		send.mockRejectedValueOnce(new Error("network down"));
		const keys = Array.from({ length: 1500 }, (_, i) => `k/${i}`);
		const { deleted, failed } = await deleteObjects(keys);
		expect(failed).toContainEqual({ key: "k/1", message: "AccessDenied" });
		expect(failed.filter((f) => f.message === "network down")).toHaveLength(500);
		expect(deleted).toHaveLength(999);
	});

	it("finds the key behind one of our public URLs only", () => {
		expect(objectKeyFromPublicUrl(generatePublicUrl("a/b c.png"))).toBe("a/b c.png");
		expect(objectKeyFromPublicUrl("https://elsewhere.example.com/a/b.png")).toBeNull();
	});

	it("drains the queue: confirmed keys leave, a failed one stays with its attempt", async () => {
		await queueObjectDeletions(["q/1", "q/2", "q/3"]);
		send.mockResolvedValueOnce({ Errors: [{ Key: "q/2", Code: "InternalError" }] });
		expect(await drainObjectDeletions()).toEqual({ deleted: 2, failed: 1 });
		const left = await db.storageObjectDeletions.select("objectKey", "attempts", "lastError");
		expect(left).toEqual([{ objectKey: "q/2", attempts: 1, lastError: "InternalError" }]);
	});
});
