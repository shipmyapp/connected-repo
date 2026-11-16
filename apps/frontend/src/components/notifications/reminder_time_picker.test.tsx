// @vitest-environment jsdom
import { renderWithTheme } from "@frontend/test/render";
import { LocalizationProvider } from "@mui/x-date-pickers";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import { TimePicker } from "@mui/x-date-pickers/TimePicker";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import dayjs, { type Dayjs } from "dayjs";
import { afterEach, describe, expect, it, vi } from "vitest";

// The reminder time picker as NotificationSettings and the permission dialog
// use it, under the app's date adapter (App.tsx).
describe("reminder time picker", () => {
	afterEach(cleanup);

	it("steps the hour from the keyboard, in 24-hour form", () => {
		const onChange = vi.fn((_value: Dayjs | null) => {});
		renderWithTheme(
			<LocalizationProvider dateAdapter={AdapterDayjs}>
				<TimePicker
					label="Reminder time"
					value={dayjs().hour(21).minute(0)}
					onChange={onChange}
					ampm={false}
					minutesStep={5}
				/>
			</LocalizationProvider>,
		);
		const hours = screen.getByRole("spinbutton", { name: "Hours" });
		fireEvent.click(hours);
		fireEvent.keyDown(hours, { key: "ArrowDown" });
		const picked = onChange.mock.lastCall?.[0];
		expect(picked?.format("HH:mm")).toBe("20:00");
	});
});
