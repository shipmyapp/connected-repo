import dayjs, { ConfigType } from "dayjs";
import timezone from "dayjs/plugin/timezone.js";
import utc from "dayjs/plugin/utc.js";

dayjs.extend(utc);
dayjs.extend(timezone);

export const dayJsTz = (tz: string, date?: ConfigType) => {
	return dayjs.tz(date, tz);
};