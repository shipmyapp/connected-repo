import { Box } from "@connected-repo/ui-mui/layout/Box";
import { useConnectivity } from "@frontend/sw/sse/useConnectivity.sse.sw";

export const SSEStatusBadge = () => {
    const { sseStatus } = useConnectivity();

    const colors = {
        connected: "success.main",
        connecting: "warning.main",
        disconnected: "error.main",
    };

    return (
        <Box
            sx={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                bgcolor: colors[sseStatus],
                boxShadow: sseStatus === 'connected' ? `0 0 6px currentColor` : "none",
                transition: 'all 0.3s ease',
            }}
        />
    );
};
