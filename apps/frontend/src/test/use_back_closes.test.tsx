// @vitest-environment jsdom
import { useBackCloses } from "@connected-repo/ui-mui/utils/use_back_closes";
import { act, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const Overlay = ({ open, onBack }: { open: boolean; onBack: () => void }) => {
	useBackCloses(open, onBack);
	return null;
};
const mark = () => (window.history.state as Record<string, unknown> | null)?.appOverlay;

describe("useBackCloses", () => {
	afterEach(() => vi.useRealTimers());

	it("pushes one entry while open, and Back closes the overlay", () => {
		const onBack = vi.fn();
		const before = window.history.length;
		render(<Overlay open onBack={onBack} />);
		expect(window.history.length).toBe(before + 1);
		expect(typeof mark()).toBe("number");
		act(() => {
			window.history.replaceState(null, "");
			window.dispatchEvent(new PopStateEvent("popstate"));
		});
		expect(onBack).toHaveBeenCalledOnce();
	});

	it("takes its entry back out when closed any other way", () => {
		vi.useFakeTimers();
		const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
		const onBack = vi.fn();
		const { rerender } = render(<Overlay open onBack={onBack} />);
		rerender(<Overlay open={false} onBack={onBack} />);
		vi.advanceTimersByTime(200);
		expect(back).toHaveBeenCalledOnce();
		expect(onBack).not.toHaveBeenCalled();
	});
});
