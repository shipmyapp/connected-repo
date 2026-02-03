import { Typography } from "@connected-repo/ui-mui/data-display/Typography";
import { Snackbar } from "@connected-repo/ui-mui/feedback/Snackbar";
import { Button } from "@connected-repo/ui-mui/form/Button";
import { Stack } from "@connected-repo/ui-mui/layout/Stack";
import { useTheme } from "@mui/material/styles";
import { useRegisterSW } from 'virtual:pwa-register/react';

export function PwaUpdatePrompt() {
  const theme = useTheme();
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  const handleRefresh = async () => {
    await updateServiceWorker(true);
  };

  const handleClose = () => {
    setNeedRefresh(false);
  };

  if(!needRefresh) return;

  return (
      <Snackbar
            open={needRefresh}
            anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
            sx={{
          bottom: { xs: 100, sm: 100 },
          "& .MuiSnackbarContent-root": {
            borderRadius: theme.spacing(4), // Pill shape
            flexWrap: "nowrap", // FORCE SINGLE LINE
            minWidth: "auto",
            maxWidth: "95vw",
            pl: 2.5,
            pr: 2.5,
            py: 1.5
          }
          }}
            message={
              <Typography variant="body2" fontWeight="500">
                {"New version available"}
              </Typography>
            }
            action={
              <Stack direction="row" spacing={0} alignItems="center">
                <Button
                  onClick={handleRefresh}
                  size="small"
                  variant="contained"
                  sx={{ borderRadius: 1, textTransform: 'none', fontWeight: 'bold', fontSize: '0.75rem' }}
                >
                  Update
                </Button>
                <Button
                  onClick={handleClose}
                  size="small"
                  sx={{ fontWeight: 'bold', textTransform: 'none', color:theme.palette.text.disabled, fontSize: '0.75rem', minWidth: 'auto' }}
                >
                  Later
                </Button>
              </Stack>
            }
          />
  );
}