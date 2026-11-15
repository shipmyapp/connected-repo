import { isAccessError } from "@connected-repo/ui-mui/utils/rpc_errors";
import { QueryClient } from "@tanstack/react-query";

// The super-admin procedures allow 30 requests a minute per operator, so
// nothing refetches on focus and a refused session is never retried.
export const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			staleTime: 30_000,
			refetchOnWindowFocus: false,
			retry: (failureCount, error) => !isAccessError(error) && failureCount < 1,
		},
	},
});
