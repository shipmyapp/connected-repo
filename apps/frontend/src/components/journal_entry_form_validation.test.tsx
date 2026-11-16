// @vitest-environment jsdom
import { RhfSubmitButton } from "@connected-repo/ui-mui/rhf-form/RhfSubmitButton";
import { RhfTextField } from "@connected-repo/ui-mui/rhf-form/RhfTextField";
import { useRhfForm } from "@connected-repo/ui-mui/rhf-form/useRhfForm";
import {
	type JournalEntryCreateInput,
	journalEntryCreateInputZod,
} from "@connected-repo/zod-schemas/journal_entry.zod";
import { renderWithTheme } from "@frontend/test/render";
import { zodResolver } from "@hookform/resolvers/zod";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import type { Resolver } from "react-hook-form";
import { ulid } from "ulid";
import { afterEach, describe, expect, it, vi } from "vitest";

// The journal entry form's validation path (CreateJournalEntryForm): the
// shared form hook, the zod resolver over the entry schema, the shared fields.
const JournalEntryFormHarness = ({ onSubmit }: { onSubmit: () => Promise<void> }) => {
	const { formMethods, RhfFormProvider } = useRhfForm<JournalEntryCreateInput>({
		onSubmit,
		formConfig: {
			resolver: zodResolver(journalEntryCreateInputZod) as Resolver<JournalEntryCreateInput>,
			defaultValues: { prompt: null, content: "", id: ulid() },
		},
	});
	return (
		<RhfFormProvider>
			<input type="hidden" {...formMethods.register("prompt")} />
			<RhfTextField name="content" label="Your Thoughts" />
			<RhfSubmitButton notSubmittingText="Save Entry" />
		</RhfFormProvider>
	);
};

describe("journal entry form validation", () => {
	afterEach(cleanup);

	it("shows the field error for an empty entry and does not submit", async () => {
		const onSubmit = vi.fn(async () => {});
		renderWithTheme(<JournalEntryFormHarness onSubmit={onSubmit} />);
		fireEvent.click(screen.getByRole("button", { name: "Save Entry" }));
		expect(await screen.findByText("Content is required", {}, { timeout: 3000 })).toBeTruthy();
		expect(onSubmit).not.toHaveBeenCalled();
	});

	it("submits an entry with content", async () => {
		const onSubmit = vi.fn(async () => {});
		renderWithTheme(<JournalEntryFormHarness onSubmit={onSubmit} />);
		fireEvent.change(screen.getByLabelText("Your Thoughts"), {
			target: { value: "A good day." },
		});
		fireEvent.click(screen.getByRole("button", { name: "Save Entry" }));
		await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
	});
});
