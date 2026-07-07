import type { FileSelectAll } from "@connected-repo/zod-schemas/file.zod";
import { describe, expect, it } from "vitest";
import { mergeServerFileRow } from "./files.merge";
import type { StoredFile } from "./schema.db.types";

const serverRow = (over: Partial<FileSelectAll> = {}): FileSelectAll => ({
	id: "01JAAAAAAAAAAAAAAAAAAAAFILE",
	tableName: "journalEntries",
	tableId: "01JAAAAAAAAAAAAAAAAAAAENTRY",
	type: "attachment",
	fileName: "photo.jpg",
	mimeType: "image/jpeg",
	createdByUserId: "00000000-0000-0000-0000-000000000000",
	teamId: "01JAAAAAAAAAAAAAAAAAAATEAMX",
	cdnUrl: null,
	thumbnailCdnUrl: null,
	deletedAt: null,
	isMainFileLost: false,
	createdAt: 123,
	updatedAt: "123000",
	...over,
});

const localRow = (over: Partial<StoredFile> = {}): StoredFile => ({
	...serverRow(),
	mainUploadState: "pending",
	mainUploadAttempts: 0,
	mainLastError: null,
	mainLastAttemptAt: null,
	mainChecksum: null,
	mainOpfsPath: null,
	thumbnailUploadState: "not_attempted",
	thumbnailUploadAttempts: 0,
	thumbnailLastError: null,
	thumbnailLastAttemptAt: null,
	thumbnailChecksum: null,
	thumbnailOpfsPath: null,
	syncError: null,
	...over,
});

describe("mergeServerFileRow (Q7 — no CDN-URL clobber)", () => {
	it("keeps a locally-uploaded cdnUrl when the server echo still has null", () => {
		// The upload finished locally (uploaded_to_cdn) before the create echo
		// came back; the echo carries cdnUrl:null. A blind merge would null it
		// and permanently strand the upload — this is the exact Q7 regression.
		const existing = localRow({
			cdnUrl: "https://cdn.example.com/x.jpg",
			mainUploadState: "uploaded_to_cdn",
			mainOpfsPath: "files/x/original.jpg",
			mainChecksum: "abc",
		});
		const merged = mergeServerFileRow(existing, serverRow({ cdnUrl: null }));
		expect(merged.cdnUrl).toBe("https://cdn.example.com/x.jpg");
		expect(merged.mainUploadState).toBe("uploaded_to_cdn");
		expect(merged.mainOpfsPath).toBe("files/x/original.jpg");
		expect(merged.mainChecksum).toBe("abc");
	});

	it("adopts the server cdnUrl and heals a stuck-local state when the server has the URL", () => {
		const existing = localRow({ mainUploadState: "failed", mainLastError: "boom" });
		const merged = mergeServerFileRow(
			existing,
			serverRow({ cdnUrl: "https://cdn.example.com/y.jpg" }),
		);
		expect(merged.cdnUrl).toBe("https://cdn.example.com/y.jpg");
		expect(merged.mainUploadState).toBe("uploaded");
		expect(merged.mainLastError).toBeNull();
	});

	it("initializes a brand-new image row with a pending thumbnail", () => {
		const merged = mergeServerFileRow(undefined, serverRow({ mimeType: "image/png" }));
		expect(merged.mainUploadState).toBe("pending");
		expect(merged.thumbnailUploadState).toBe("pending");
		expect(merged.mainOpfsPath).toBeNull();
	});

	it("does not attempt a thumbnail for non-thumbnailable types", () => {
		const merged = mergeServerFileRow(
			undefined,
			serverRow({ mimeType: "video/mp4", cdnUrl: "https://cdn.example.com/x.mp4" }),
		);
		expect(merged.thumbnailUploadState).toBe("not_attempted");
		expect(merged.mainUploadState).toBe("uploaded");
	});

	it("latches isMainFileLost from either side", () => {
		expect(mergeServerFileRow(localRow({ isMainFileLost: true }), serverRow()).isMainFileLost).toBe(
			true,
		);
		expect(
			mergeServerFileRow(undefined, serverRow({ isMainFileLost: true })).isMainFileLost,
		).toBe(true);
	});
});
