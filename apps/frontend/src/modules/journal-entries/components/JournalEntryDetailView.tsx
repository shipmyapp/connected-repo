import { Chip } from "@connected-repo/ui-mui/data-display/Chip";
import { Typography } from "@connected-repo/ui-mui/data-display/Typography";
import { Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle } from "@connected-repo/ui-mui/feedback/Dialog";
import { Button } from "@connected-repo/ui-mui/form/Button";
import { TextField } from "@connected-repo/ui-mui/form/TextField";
import { Alert } from "@connected-repo/ui-mui/feedback/Alert";
import { ErrorAlert } from "@connected-repo/ui-mui/components/ErrorAlert";
import { ArrowBackIcon } from "@connected-repo/ui-mui/icons/ArrowBackIcon";
import { CalendarTodayIcon } from "@connected-repo/ui-mui/icons/CalendarTodayIcon";
import { DeleteIcon } from "@connected-repo/ui-mui/icons/DeleteIcon";
import { Box } from "@connected-repo/ui-mui/layout/Box";
import { Card, CardContent } from "@connected-repo/ui-mui/layout/Card";
import { Divider } from "@connected-repo/ui-mui/layout/Divider";
import { Stack } from "@connected-repo/ui-mui/layout/Stack";
import { Tooltip, IconButton, keyframes } from "@mui/material";
import SyncIcon from "@mui/icons-material/Sync";
import { useState } from "react";
import { useNavigate } from "react-router";

const spin = keyframes`
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
`;

interface JournalEntryDetailViewProps {
	entry: {
		journalEntryId: string;
		prompt?: string | null;
		content: string;
		createdAt: number | string | Date;
	};
	onDelete: () => Promise<void>;
	isDeleting?: boolean;
	canDelete?: boolean;
	deleteDisabledReason?: string | null;
	attachments?: { url: string; name: string }[];
	syncError?: string | null;
	errorCount?: number;
	status?: "synced" | "pending" | "syncing" | "sync-failed" | "file-upload-failed" | "file-upload-in-progress" | string;
	onRetry?: () => Promise<void>;
	isSyncing?: boolean;
}

export function JournalEntryDetailView({ 
	entry, 
	onDelete, 
	isDeleting = false,
	canDelete = true,
	deleteDisabledReason = null,
	attachments = [],
	syncError = null,
	errorCount = 0,
	status = "synced",
	onRetry,
	isSyncing = false
}: JournalEntryDetailViewProps) {
	const navigate = useNavigate();
	const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
	const [confirmationText, setConfirmationText] = useState("");
	const [deleteError, setDeleteError] = useState<string | null>(null);

	const handleDeleteClick = () => {
		if (!canDelete) return;
		setDeleteDialogOpen(true);
		setConfirmationText("");
		setDeleteError(null);
	};

	const handleDeleteConfirm = async () => {
		if (confirmationText.toLowerCase() !== "delete") {
			setDeleteError('Please type "DELETE" to confirm');
			return;
		}

		try {
			await onDelete();
			navigate("/journal-entries", { replace: true });
		} catch (error) {
			setDeleteError("Failed to delete journal entry. Please try again.");
		}
	};

	const handleDeleteCancel = () => {
		setDeleteDialogOpen(false);
		setConfirmationText("");
		setDeleteError(null);
	};

	const formatDate = (date: string | number | Date) => {
		return new Date(date).toLocaleDateString(undefined, {
			year: "numeric",
			month: "long",
			day: "numeric",
			hour: "2-digit",
			minute: "2-digit",
		});
	};

	const getStatusConfig = (status: string) => {
		switch (status) {
			case "synced":
				return { label: "Synced", color: "success" as const };
			case "syncing":
				return { label: "Syncing", color: "warning" as const };
			case "file-upload-pending":
				return { label: "File Upload Pending", color: "info" as const };
			case "file-upload-in-progress":
				return { label: "Uploading Files", color: "info" as const };
			case "file-upload-completed":
				return { label: "Files Uploaded", color: "success" as const };
			case "file-upload-failed":
				return { label: "File Upload Failed", color: "error" as const };
			case "sync-failed":
				return { label: "Sync Failed", color: "error" as const };
			default:
				return { label: status, color: "default" as const };
		}
	};

	const statusConfig = getStatusConfig(status);

	return (
		<Box>
			{/* Back Button */}
			<Button
				startIcon={<ArrowBackIcon />}
				onClick={() => navigate("/journal-entries")}
				sx={{
					mb: 3,
					color: "text.secondary",
					"&:hover": {
						color: "primary.main",
						bgcolor: "action.hover",
					},
				}}
			>
				Back to Journal Entries
			</Button>

			{/* Main Card */}
			<Card
				sx={{
					boxShadow: 3,
					borderRadius: 2,
					border: "1px solid",
					borderColor: "divider",
					transition: "box-shadow 0.3s ease-in-out",
					"&:hover": {
						boxShadow: 6,
					},
				}}
			>
				<CardContent sx={{ p: { xs: 3, md: 4 } }}>
					{/* Header Section */}
					<Stack
						direction="row"
						justifyContent="space-between"
						alignItems="center"
						spacing={2}
						sx={{ mb: 3 }}
					>
						<Chip 
							label={statusConfig.label} 
							color={statusConfig.color} 
							size="small" 
							sx={{ fontWeight: 600, fontSize: "0.75rem" }} 
						/>
						<Tooltip title={!canDelete ? deleteDisabledReason : "Delete Entry"}>
							<IconButton
								color="error"
								disabled={!canDelete || isDeleting}
								onClick={handleDeleteClick}
								sx={{
									transition: "all 0.2s ease-in-out",
									"&:hover": {
										transform: !canDelete ? "none" : "scale(1.1)",
										bgcolor: "error.lighter",
									},
									opacity: !canDelete ? 0.6 : 1,
								}}
							>
								<DeleteIcon />
							</IconButton>
						</Tooltip>
					</Stack>

					<Divider sx={{ mb: 4 }} />

					{/* Prompt Section */}
					{entry.prompt && (
						<Box sx={{ mb: 4 }}>
							<Typography
								variant="overline"
								color="primary.main"
								sx={{
									fontWeight: 600,
									letterSpacing: "0.1em",
									display: "block",
									mb: 1,
								}}
							>
								Prompt
							</Typography>
							<Box
								sx={{
									bgcolor: "primary.lighter",
									borderLeft: "4px solid",
									borderColor: "primary.main",
									p: 2,
									borderRadius: 1,
								}}
							>
								<Typography
									variant="body1"
									sx={{
										fontStyle: "italic",
										color: "text.primary",
										lineHeight: 1.7,
									}}
								>
									{entry.prompt}
								</Typography>
							</Box>
						</Box>
					)}

					{/* Content Section */}
					<Box>
						<Typography
							variant="overline"
							color="text.secondary"
							sx={{
								fontWeight: 600,
								letterSpacing: "0.1em",
								display: "block",
								mb: 2,
							}}
						>
							Your Entry
						</Typography>
						<Typography
							variant="body1"
							sx={{
								whiteSpace: "pre-wrap",
								lineHeight: 1.8,
								color: "text.primary",
								fontSize: "1.05rem",
							}}
						>
							{entry.content}
						</Typography>
					</Box>

					{/* Attachments Section */}
					<Box sx={{ mt: 5 }}>
						<Typography
							variant="overline"
							color="text.secondary"
							sx={{
								fontWeight: 600,
								letterSpacing: "0.1em",
								display: "block",
								mb: 2,
							}}
						>
							Attachments {attachments.length > 0 ? `(${attachments.length})` : ""}
						</Typography>

						{attachments.length > 0 && (
							<Box 
								sx={{ 
									display: "grid", 
									gridTemplateColumns: {
										xs: "repeat(1, 1fr)",
										sm: "repeat(2, 1fr)",
										md: "repeat(3, 1fr)"
									},
									gap: 2 
								}}
							>
								{attachments.map((file, index) => (
									<Box 
										key={index}
										sx={{ 
											position: "relative",
											borderRadius: 2,
											overflow: "hidden",
											aspectRatio: "1/1",
											border: "1px solid",
											borderColor: "divider",
											cursor: "pointer",
											bgcolor: "action.hover",
											"&:hover img": {
												transform: "scale(1.05)",
											},
											"&:hover .overlay": {
												opacity: 1,
											}
										}}
										onClick={() => window.open(file.url, "_blank")}
									>
										<Box
											component="img"
											src={file.url}
											alt={file.name}
											sx={{
												width: "100%",
												height: "100%",
												objectFit: "contain",
												transition: "transform 0.3s ease-in-out",
											}}
										/>
										<Box
											className="overlay"
											sx={{
												position: "absolute",
												top: 0,
												left: 0,
												right: 0,
												bottom: 0,
												bgcolor: "rgba(0,0,0,0.4)",
												display: "flex",
												alignItems: "center",
												justifyContent: "center",
												opacity: 0,
												transition: "opacity 0.3s ease-in-out",
												p: 2
											}}
										>
											<Typography variant="caption" sx={{ color: "white", textAlign: "center" }}>
												View Full Image
											</Typography>
										</Box>
									</Box>
								))}
							</Box>
						)}
						{attachments.length === 0 && (
							<Typography variant="body2" color="text.secondary" sx={{ fontStyle: "italic" }}>
								No attachments for this entry.
							</Typography>
						)}
					</Box>

					{/* Footer Section: Errors, Retries, and Metadata */}
					<Box sx={{ mt: 6, pt: 3, borderTop: "1px solid", borderColor: "divider" }}>
						{syncError && (
							<Alert 
								severity="error" 
								sx={{ 
									mb: 3, 
									borderRadius: 2,
									'& .MuiAlert-message': { width: '100%', p: 0 }
								}}
							>
								<Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
									<Typography variant="subtitle2" fontWeight={700}>Synchronization Error</Typography>
									<Typography variant="body2" sx={{ opacity: 0.9 }}>{syncError}</Typography>
									
									<Stack direction="row" alignItems="center" spacing={1} sx={{ mt: 1 }}>
										<Typography variant="caption" sx={{ opacity: 0.8, fontWeight: 600 }}>
											Retry Attempts: {errorCount}
										</Typography>
										{onRetry && (
											<Tooltip title={isSyncing ? "Syncing..." : "Retry Sync Now"}>
												<IconButton
													size="small"
													color="inherit"
													onClick={onRetry}
													disabled={isSyncing}
													sx={{ 
														p: 0.5,
														bgcolor: 'rgba(0,0,0,0.1)',
														'&:hover': { bgcolor: 'rgba(0,0,0,0.2)' }
													}}
												>
													<SyncIcon 
														sx={{ 
															fontSize: 14,
															animation: isSyncing ? `${spin} 1s linear infinite` : 'none'
														}} 
													/>
												</IconButton>
											</Tooltip>
										)}
									</Stack>
								</Box>
							</Alert>
						)}

						{!syncError && onRetry && (
							<Box sx={{ mb: 3, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 1.5 }}>
								<Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
									Ready to sync
								</Typography>
								<Tooltip title={isSyncing ? "Syncing..." : "Start Manual Sync"}>
									<IconButton
										color="primary"
										onClick={onRetry}
										disabled={isSyncing}
										sx={{ 
											bgcolor: 'action.hover',
											'&:hover': { bgcolor: 'action.selected' }
										}}
									>
										<SyncIcon sx={{ animation: isSyncing ? `${spin} 1s linear infinite` : 'none' }} />
									</IconButton>
								</Tooltip>
							</Box>
						)}

						<Stack direction="row" alignItems="center" justifyContent="flex-end" spacing={1}>
							<CalendarTodayIcon sx={{ fontSize: 16, color: "text.secondary" }} />
							<Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500 }}>
								{formatDate(entry.createdAt)}
							</Typography>
						</Stack>
					</Box>
				</CardContent>
			</Card>

			{/* Delete Confirmation Dialog */}
			<Dialog
				open={deleteDialogOpen}
				onClose={handleDeleteCancel}
				maxWidth="sm"
				fullWidth
			>
				<DialogTitle>Delete Journal Entry?</DialogTitle>
				<DialogContent>
					<DialogContentText sx={{ mb: 3 }}>
						This action cannot be undone. To confirm deletion, please type{" "}
						<Typography component="span" fontWeight={600} color="error.main">
							DELETE
						</Typography>{" "}
						below.
					</DialogContentText>
					<TextField
						fullWidth
						label="Type DELETE to confirm"
						value={confirmationText}
						onChange={(e) => setConfirmationText(e.target.value)}
						error={!!deleteError}
						helperText={deleteError}
						autoFocus
						sx={{
							"& .MuiOutlinedInput-root": {
								"&.Mui-focused fieldset": {
									borderWidth: 2,
								},
							},
						}}
					/>
				</DialogContent>
				<DialogActions sx={{ px: 3, pb: 3 }}>
					<Button
						onClick={handleDeleteCancel}
						disabled={isDeleting}
					>
						Cancel
					</Button>
					<Button
						onClick={handleDeleteConfirm}
						color="error"
						variant="contained"
						disabled={isDeleting}
						sx={{
							transition: "all 0.2s ease-in-out",
							"&:hover": {
								transform: "translateY(-2px)",
								boxShadow: 4,
							},
						}}
					>
						{isDeleting ? "Deleting..." : "Delete Entry"}
					</Button>
				</DialogActions>
			</Dialog>
		</Box>
	);
}

