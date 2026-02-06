import { 
  Dialog, 
  DialogTitle, 
  DialogContent, 
  DialogContentText, 
  DialogActions 
} from "@connected-repo/ui-mui/feedback/Dialog";
import { Button } from "@connected-repo/ui-mui/form/Button";
import { Typography } from "@connected-repo/ui-mui/data-display/Typography";
import { useEffect, useState } from "react";

interface LogoutConfirmationDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  pendingCount: number;
}

export const LogoutConfirmationDialog = ({
  open,
  onClose,
  onConfirm,
  pendingCount,
}: LogoutConfirmationDialogProps) => {
  const [countdown, setCountdown] = useState(5);
  const isTimerDone = countdown === 0;

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (open && countdown > 0) {
      timer = setInterval(() => {
        setCountdown((prev) => prev - 1);
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [open, countdown]);

  // Reset countdown when dialog opens
  useEffect(() => {
    if (open) {
      setCountdown(5);
    }
  }, [open]);

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogTitle sx={{ color: pendingCount > 0 ? "error.main" : "text.primary" }}>
        {pendingCount > 0 ? "⚠️ Unsynced Data Warning" : "Confirm Logout"}
      </DialogTitle>
      <DialogContent>
        <DialogContentText>
          {pendingCount > 0 ? (
            <>
              You have <strong>{pendingCount}</strong> unsynced leads. 
              <br /><br />
              Logging out will <strong>permanently delete</strong> these leads from your local device. 
              Are you absolutely sure you want to proceed?
            </>
          ) : (
            "Are you sure you want to logout? All local cache data will be cleared."
          )}
        </DialogContentText>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} color="inherit">
          Cancel
        </Button>
        <Button
          onClick={onConfirm}
          color="error"
          variant="contained"
          disabled={!isTimerDone}
          sx={{ minWidth: 150 }}
        >
          {isTimerDone ? "Delete Pending & Logout" : `Wait ${countdown}s...`}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
