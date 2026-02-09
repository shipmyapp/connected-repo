import { Box } from "@connected-repo/ui-mui/layout/Box";
import { SSEStatus } from "./sse.manager.sw";
import { useSessionInfo } from "@frontend/contexts/UserContext";
import { useConnectivity } from "@frontend/sw/sse/useConnectivity.sse.sw";

export const SSEStatusBadge = () => {
    const session = useSessionInfo();
    const { sseStatus } = useConnectivity(session.user?.id);

    const colors: Record<SSEStatus, string> = {
        connected: "success.main",
        "sync-complete": "success.main",
        connecting: "warning.main",
        disconnected: "error.main",
        "sync-error": "error.main",
        "auth-error": "error.main",
        "connection-error": "error.main",
    };

    return (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Box
                sx={{
                    width: 7,
                    height: 7,
                    borderRadius: "50%",
                    bgcolor: colors[sseStatus],
                    boxShadow: (sseStatus === 'connected' || sseStatus === 'sync-complete') ? `0 0 6px currentColor` : "none",
                    transition: 'all 0.3s ease',
                }}
            />
            {sseStatus === 'sync-complete' && (
                <Box
                    sx={{
                        fontSize: '10px',
                        color: 'success.main',
                        fontWeight: 'bold',
                        display: 'flex',
                        alignItems: 'center',
                        lineHeight: 1
                    }}
                >
                    ✓
                </Box>
            )}
            {(sseStatus === 'sync-error' || sseStatus === 'auth-error' || sseStatus === 'connection-error') && (
                <Box
                    sx={{
                        fontSize: '10px',
                        color: 'error.main',
                        fontWeight: 'bold',
                        display: 'flex',
                        alignItems: 'center',
                        lineHeight: 1
                    }}
                >
                    !
                </Box>
            )}
        </Box>
    );
};
