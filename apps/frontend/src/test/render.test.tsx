// @vitest-environment jsdom
import { ConfirmDialog } from "@connected-repo/ui-mui/components/ConfirmDialog";
import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithTheme } from "./render";

describe("renderWithTheme", () => {
	it("renders a shared component under the app theme and wires its buttons", () => {
		const onConfirm = vi.fn();
		const onClose = vi.fn();
		renderWithTheme(
			<ConfirmDialog
				open
				title="Remove this member?"
				description="They lose access at once."
				confirmLabel="Remove"
				onConfirm={onConfirm}
				onClose={onClose}
			/>,
		);
		fireEvent.click(screen.getByRole("button", { name: "Remove" }));
		expect(onConfirm).toHaveBeenCalledOnce();
		fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
		expect(onClose).toHaveBeenCalledOnce();
	});
});
