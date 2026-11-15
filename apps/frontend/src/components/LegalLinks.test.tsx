// @vitest-environment jsdom
import { renderWithTheme } from "@frontend/test/render";
import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const env = vi.hoisted(() => ({
	VITE_TERMS_URL: "https://example.com/terms" as string | undefined,
	VITE_PRIVACY_URL: "https://example.com/privacy" as string | undefined,
}));
vi.mock("@frontend/configs/env.config", () => ({ env }));

import { LegalLinks } from "./LegalLinks";

describe("LegalLinks", () => {
	afterEach(() => {
		cleanup();
		env.VITE_TERMS_URL = "https://example.com/terms";
		env.VITE_PRIVACY_URL = "https://example.com/privacy";
	});

	it("links both documents in a new tab when both are set", () => {
		renderWithTheme(<LegalLinks lead="By continuing, you agree to our" />);
		const terms = screen.getByRole("link", { name: "Terms of Service" });
		const privacy = screen.getByRole("link", { name: "Privacy Policy" });
		expect(terms.getAttribute("href")).toBe("https://example.com/terms");
		expect(privacy.getAttribute("href")).toBe("https://example.com/privacy");
		for (const link of [terms, privacy]) {
			expect(link.getAttribute("target")).toBe("_blank");
			expect(link.getAttribute("rel")).toBe("noopener noreferrer");
		}
	});

	it("says the sentence without links when either is blank, and nothing without a lead", () => {
		env.VITE_PRIVACY_URL = undefined;
		const { container } = renderWithTheme(<LegalLinks lead="By continuing, you agree to our" />);
		expect(screen.queryAllByRole("link")).toHaveLength(0);
		expect(container.textContent).toBe(
			"By continuing, you agree to our Terms of Service and Privacy Policy.",
		);
		cleanup();
		const { container: bare } = renderWithTheme(<LegalLinks />);
		expect(bare.textContent).toBe("");
	});
});
