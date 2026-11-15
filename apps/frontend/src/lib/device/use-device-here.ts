import type { DeviceHere } from "@connected-repo/zod-schemas/device.zod";
import { orpcFetch } from "@frontend/utils/orpc.client";
import { queryClient } from "@frontend/utils/queryClient";
import { useQuery } from "@tanstack/react-query";

/**
 * What the device in the person's hand may be offered: the app installed here
 * (an iPhone's Safari paired with its Home Screen app on the server), push on
 * here for this account, the install offer due. Read by the profile's Install
 * card, the install offer and the asks; refreshed after every report.
 */
/**
 * Its own key and a lazy call rather than `orpc.devices.here.queryOptions()`: sign-out (imported by
 * the oRPC client itself) reaches this module through push, and the TanStack utilities would be
 * built before the client exists.
 */
const HERE_KEY = ["devices", "here"] as const;
const hereOptions = () => ({
	queryKey: HERE_KEY,
	queryFn: () => orpcFetch.devices.here(),
	staleTime: 60_000,
});

export const useDeviceHere = (isEnabled = true) =>
	useQuery({ ...hereOptions(), enabled: isEnabled });

/** The same answer outside React (the asks, the install offer); null when it cannot be read. */
export const fetchDeviceHere = async (): Promise<DeviceHere | null> => {
	try {
		return await queryClient.fetchQuery(hereOptions());
	} catch {
		return null;
	}
};

/** What is already known, without asking the server (a synchronous check). */
export const knownDeviceHere = (): DeviceHere | undefined =>
	queryClient.getQueryData<DeviceHere>(HERE_KEY);

/** After a report, an install try or push switched: read again. */
export const refreshDeviceHere = () => queryClient.invalidateQueries({ queryKey: HERE_KEY });
