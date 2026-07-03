import { useRegisterSW } from "virtual:pwa-register/react";
import { Typography } from "@connected-repo/ui-mui/data-display/Typography";
import { Snackbar } from "@connected-repo/ui-mui/feedback/Snackbar";
import { Button } from "@connected-repo/ui-mui/form/Button";
import { Box } from "@connected-repo/ui-mui/layout/Box";
import { Stack } from "@connected-repo/ui-mui/layout/Stack";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import SystemUpdateAltRoundedIcon from "@mui/icons-material/SystemUpdateAltRounded";
import { alpha, useTheme } from "@mui/material/styles";
import { useState } from "react";

/**
 * Two-stage service-worker update UX.
 *
 * 1. When Workbox flips `needRefresh` we show a snackbar (Update / Later).
 * 2. If the user picks "Later" we replace the snackbar with a persistent,
 *    non-closable top banner. There's no dismiss — Workbox has already
 *    downloaded the new bundle, and staying on the old one after that
 *    point risks state divergence with the backend. The user can defer
 *    only until they navigate or reload; the banner keeps the "Update"
 *    action one tap away wherever they are in the app.
 *
 * Rendered at the RootLayout so it's visible on auth pages too — a
 * new bundle can land while the user is stuck on Login.
 */
export function PwaUpdatePrompt() {
  const theme = useTheme();
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW();
  const [deferred, setDeferred] = useState(false);
  const [updating, setUpdating] = useState(false);

  const handleRefresh = async () => {
    setUpdating(true);
    await updateServiceWorker(true);
  };

  const handleLater = () => {
    setDeferred(true);
  };

  if (!needRefresh) return null;

  if (deferred) {
    return (
      <Box
        role="status"
        aria-live="polite"
        sx={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          zIndex: theme.zIndex.snackbar + 2,
          bgcolor: theme.palette.primary.main,
          color: theme.palette.primary.contrastText,
          boxShadow: `0 2px 12px ${alpha(theme.palette.primary.main, 0.35)}`,
        }}
      >
        <Stack
          direction="row"
          alignItems="center"
          spacing={1.5}
          sx={{
            px: { xs: 1.5, sm: 3 },
            py: { xs: 0.75, sm: 1 },
            maxWidth: 960,
            mx: "auto",
          }}
        >
          <SystemUpdateAltRoundedIcon fontSize="small" sx={{ flexShrink: 0 }} />
          <Typography
            variant="body2"
            sx={{ fontWeight: 600, flexGrow: 1, lineHeight: 1.35 }}
          >
            Update ready — reload to get the latest version.
          </Typography>
          <Button
            onClick={handleRefresh}
            size="small"
            variant="contained"
            color="inherit"
            disabled={updating}
            startIcon={<RefreshRoundedIcon fontSize="small" />}
            sx={{
              borderRadius: 999,
              textTransform: "none",
              fontWeight: 700,
              px: 2,
              color: theme.palette.primary.main,
              bgcolor: theme.palette.primary.contrastText,
              boxShadow: "none",
              "&:hover": {
                bgcolor: alpha(theme.palette.primary.contrastText, 0.9),
                boxShadow: "none",
              },
            }}
          >
            {updating ? "Updating…" : "Update"}
          </Button>
        </Stack>
      </Box>
    );
  }

  return (
    <Snackbar
      open={needRefresh}
      anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      sx={{
        bottom: { xs: 100, sm: 100 },
        "& .MuiSnackbarContent-root": {
          borderRadius: theme.spacing(4),
          flexWrap: "nowrap",
          minWidth: "auto",
          maxWidth: "95vw",
          pl: 2.5,
          pr: 2.5,
          py: 1.5,
        },
      }}
      message={
        <Typography variant="body2" fontWeight={500}>
          New version available
        </Typography>
      }
      action={
        <Stack direction="row" spacing={0} alignItems="center">
          <Button
            onClick={handleRefresh}
            size="small"
            variant="contained"
            disabled={updating}
            sx={{
              borderRadius: 1,
              textTransform: "none",
              fontWeight: "bold",
              fontSize: "0.75rem",
            }}
          >
            {updating ? "Updating…" : "Update"}
          </Button>
          <Button
            onClick={handleLater}
            size="small"
            disabled={updating}
            sx={{
              fontWeight: "bold",
              textTransform: "none",
              color: theme.palette.text.disabled,
              fontSize: "0.75rem",
              minWidth: "auto",
            }}
          >
            Later
          </Button>
        </Stack>
      }
    />
  );
}
