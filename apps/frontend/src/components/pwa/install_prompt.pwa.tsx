import { List, ListItem, ListItemIcon, ListItemText } from "@connected-repo/ui-mui/data-display/List";
import { Typography } from "@connected-repo/ui-mui/data-display/Typography";
import { Dialog, DialogActions, DialogContent, DialogTitle } from "@connected-repo/ui-mui/feedback/Dialog";
import { Snackbar } from "@connected-repo/ui-mui/feedback/Snackbar";
import { Button } from "@connected-repo/ui-mui/form/Button";
import { Divider } from "@connected-repo/ui-mui/layout/Divider";
import { Stack } from "@connected-repo/ui-mui/layout/Stack";
import { usePwaInstallStore } from "@frontend/stores/usePwaInstall.store";
import AddBoxOutlinedIcon from "@mui/icons-material/AddBoxOutlined";
import HomeScreenIcon from "@mui/icons-material/Home";
import IosShareIcon from "@mui/icons-material/IosShare";
import { useTheme } from "@mui/material/styles";
import { useState } from "react";

export function PwaInstallPrompt() {
	const theme = useTheme();
	//TODO: is there a better way of doing this?
	const showPwaInstallationPrompt = usePwaInstallStore((state) => state.showPwaInstallationPrompt);
	const deferredInstallationPrompt = usePwaInstallStore((state) => state.deferredInstallationPrompt);
	const dismissInstallationFlow = usePwaInstallStore((state) => state.dismissInstallationFlow);
	const userPlatform = usePwaInstallStore((state) => state.userPlatform);

  const [showIosOverlay, setShowIosOverlay] = useState(false);

  const handleInstall = () => {
    if (deferredInstallationPrompt) {
      deferredInstallationPrompt.prompt();
      deferredInstallationPrompt.userChoice.then(({ outcome }) => {
        if (outcome !== "accepted") {
          dismissInstallationFlow();
        }
      });
    }
  };

  if (!showPwaInstallationPrompt) return null;

  return (
    <>
      {/* ----------------- iOS FLOW ----------------- */}
      {userPlatform === "ios" && (
        <>
          <Snackbar
            open={!showIosOverlay}
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
              py: 1.5 }
            }}
            message={
              <Typography variant="body2" fontWeight="500">
                Install app for best experience
              </Typography>
            }
            action={
              <Stack direction="row" spacing={0.5} alignItems="center">
                <Button
                  onClick={() => setShowIosOverlay(true)}
                  size="small"
                  variant="contained"
                  sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 'bold', fontSize: '0.75rem' }}
                >
                  Install
                </Button>
                <Button
                  onClick={() => dismissInstallationFlow()}
                  size="small"
                  sx={{ fontWeight: 'bold', color: theme.palette.text.disabled, textTransform: 'none', fontSize: '0.75rem', minWidth: 'auto' }}
                >
                  Later
                </Button>
              </Stack>
            }
          />

          <Dialog
            open={showIosOverlay}
            onClose={() => setShowIosOverlay(false)}
            maxWidth="xs"
            fullWidth
            PaperProps={{ sx: { borderRadius: 1.5, m: 2 } }}
          >
            <DialogTitle sx={{ textAlign: 'center', pb: 1 }}>Install on iPhone</DialogTitle>
            <DialogContent>
              <Typography variant="body2" color="text.secondary" align="center" sx={{ mb: 2 }}>
                Add to Home Screen for fullscreen view.
              </Typography>
              <List dense sx={{ bgcolor: 'action.hover', borderRadius: 1 }}>
                <ListItem>
                  <ListItemIcon sx={{ minWidth: 36 }}><IosShareIcon color="primary" /></ListItemIcon>
                  <ListItemText primary={<span>Tap <b>Share</b></span>} />
                </ListItem>
                <Divider component="li" />
                <ListItem>
                  <ListItemIcon sx={{ minWidth: 36 }}><AddBoxOutlinedIcon color="primary" /></ListItemIcon>
                  <ListItemText primary={<span>Tap <b>Add to Home Screen</b></span>} />
                </ListItem>
                <Divider component="li" />
                <ListItem>
                  <ListItemIcon sx={{ minWidth: 36 }}><HomeScreenIcon color="primary" /></ListItemIcon>
                  <ListItemText primary={<span>Tap <b>Add</b></span>} />
                </ListItem>
              </List>
            </DialogContent>
            <DialogActions sx={{ justifyContent: 'center', pb: 2 }}>
              <Button onClick={() => { setShowIosOverlay(false); dismissInstallationFlow(); }} variant="contained" fullWidth sx={{ borderRadius: 8, mx: 2 }}>
                Got it
              </Button>
            </DialogActions>
          </Dialog>
        </>
      )}

      {/* ----------------- ANDROID/CHROME FLOW ----------------- */}
      {userPlatform === "chromium" && (
        <Snackbar
          open={true}
          anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
          sx={{
            bottom: { xs: 100, sm: 100 },
            "& .MuiSnackbarContent-root": {
            borderRadius: 1, // Pill shape
            flexWrap: "nowrap", // FORCE SINGLE LINE
            minWidth: "auto",
            maxWidth: "95vw",
            pl: 2.5,
            pr: 2.5,
            py: 1.5}
          }}
          message={
            <Typography variant="body2" fontWeight="500">
              Install app for best experience
            </Typography>
          }
          action={
            <Stack direction="row" spacing={0.5} alignItems="center">
              <Button
                onClick={handleInstall}
                size="small"
                variant="contained"
                sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 'bold', fontSize: '0.75rem' }}
              >
                Install
              </Button>
              <Button
                onClick={() => dismissInstallationFlow()}
                size="small"
                sx={{ fontWeight: 'bold', color: theme.palette.text.disabled, textTransform: 'none', fontSize: '0.75rem', minWidth: 'auto' }}
              >
                Later
              </Button>
            </Stack>
          }
        />
      )}

      {userPlatform === "other" && (
        <Snackbar
          open={true}
          anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
          sx={{
            bottom: { xs: 100, sm: 100 },
            "& .MuiSnackbarContent-root": {
             
              borderRadius: 1,
              flexWrap: "nowrap",
              minWidth: "auto",
              maxWidth: "95vw",
              pl: 2.5,
              pr: 3,
              py: 1.5
            }
          }}
          message={
            <Typography variant="body2" fontWeight="500">
              Install app for best experience
            </Typography>
          }
          action={
            <Button
              onClick={() => dismissInstallationFlow()}
              size="small"
              sx={{ fontWeight:"bold", textTransform: "none", fontSize: "0.75rem", minWidth: "auto" }}
            >
              Close
            </Button>
          }
        />
      )}
    </>
  );
}