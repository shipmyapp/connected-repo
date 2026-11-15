import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Skeleton from "@mui/material/Skeleton";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { ReactNode } from "react";
import { describeError } from "../utils/rpc_errors";

type QueryStateProps<T> = {
	query: { data: T | undefined; isPending: boolean; error: unknown; refetch: () => unknown };
	isEmpty?: (data: T) => boolean;
	emptyText?: string;
	children: (data: T) => ReactNode;
};

/** Loading, error (with Retry), empty and content for one query. */
export const QueryState = <T,>({
	query,
	isEmpty,
	emptyText = "Nothing here yet.",
	children,
}: QueryStateProps<T>) => {
	if (query.isPending) {
		return (
			<Stack spacing={1} aria-busy="true" aria-label="Loading">
				<Skeleton variant="rounded" height={40} />
				<Skeleton variant="rounded" height={40} />
				<Skeleton variant="rounded" height={40} />
			</Stack>
		);
	}
	if (query.error || query.data === undefined) {
		return (
			<Alert
				severity="error"
				action={
					<Button color="inherit" size="small" onClick={() => query.refetch()}>
						Retry
					</Button>
				}
			>
				{describeError(query.error)}
			</Alert>
		);
	}
	if (isEmpty?.(query.data)) {
		return (
			<Typography color="text.secondary" sx={{ py: 3 }}>
				{emptyText}
			</Typography>
		);
	}
	return <>{children(query.data)}</>;
};
