import { LoadingSpinner } from "@connected-repo/ui-mui/components/LoadingSpinner";
import { MediaUploader, type MediaFile } from "@connected-repo/ui-mui/components/MediaUploader";
import { SuccessAlert } from "@connected-repo/ui-mui/components/SuccessAlert";
import { Typography } from "@connected-repo/ui-mui/data-display/Typography";
import { Collapse } from "@connected-repo/ui-mui/feedback/Collapse";
import { ToggleButton } from "@connected-repo/ui-mui/form/ToggleButton";
import { ToggleButtonGroup } from "@connected-repo/ui-mui/form/ToggleButtonGroup";
import { Box } from "@connected-repo/ui-mui/layout/Box";
import { Stack } from "@connected-repo/ui-mui/layout/Stack";
import { IconButton } from "@connected-repo/ui-mui/navigation/IconButton";
import { RhfSubmitButton } from "@connected-repo/ui-mui/rhf-form/RhfSubmitButton";
import { RhfTextField } from "@connected-repo/ui-mui/rhf-form/RhfTextField";
import { useRhfForm } from "@connected-repo/ui-mui/rhf-form/useRhfForm";
import { PendingSyncJournalEntry, pendingSyncJournalEntryZod } from "@connected-repo/zod-schemas/journal_entry.zod";
import { useActiveTeamId } from "@frontend/contexts/WorkspaceContext";
import { getDataProxy } from "@frontend/worker/worker.proxy";
import { zodResolver } from "@hookform/resolvers/zod";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import EditNoteIcon from "@mui/icons-material/EditNote";
import RefreshIcon from "@mui/icons-material/Refresh";
import { useCallback, useEffect, useRef, useState } from "react";
import { ulid } from "ulid";

type WritingMode = "prompted" | "free";

export function CreateJournalEntryForm() {
	const teamId = useActiveTeamId();
	const [success, setSuccess] = useState("");
	const [writingMode, setWritingMode] = useState<WritingMode>("prompted");
	const [attachments, setAttachments] = useState<MediaFile[]>([]);
	const attachmentsRef = useRef<MediaFile[]>([]);

	// Cleanup effect to revoke all URLs only on unmount
	useEffect(() => {
		return () => {
			attachmentsRef.current.forEach((a) => URL.revokeObjectURL(a.previewUrl));
		};
	}, []);

	// Keep ref in sync for the cleanup effect closure
	useEffect(() => {
		attachmentsRef.current = attachments;
	}, [attachments]);

	const handleAddFiles = useCallback((newFiles: File[]) => {
		const mediaFiles: MediaFile[] = newFiles.map((file) => ({
			id: ulid(),
			file,
			previewUrl: URL.createObjectURL(file),
		}));
		setAttachments((prev) => [...prev, ...mediaFiles]);
	}, []);

	const handleRemoveFile = useCallback((id: string) => {
		setAttachments((prev) => {
			const fileToRemove = prev.find((f) => f.id === id);
			if (fileToRemove) URL.revokeObjectURL(fileToRemove.previewUrl);
			return prev.filter((f) => f.id !== id);
		});
	}, []);


	const [randomPrompt, setRandomPrompt] = useState<any>(null);
	const [promptLoading, setPromptLoading] = useState(false);
	const hasPromptValue = useRef(false);

	// Initial pick on mount or when data arriving
	useEffect(() => {
		const pickInitial = async () => {
			if (hasPromptValue.current) return;
			setPromptLoading(true);
			try {
				const p = await getDataProxy().promptsDb.getRandomActive(teamId);
				if (p) {
					setRandomPrompt(p);
					hasPromptValue.current = true;
				}
			} finally {
				setPromptLoading(false);
			}
		};

		pickInitial();

		// Listen for data arriving if we started with nothing
		const channel = new BroadcastChannel("db-updates");
		const handleMessage = (e: MessageEvent) => {
			if (e.data?.table === "prompts" && !hasPromptValue.current) {
				pickInitial();
			}
		};

		channel.addEventListener("message", handleMessage);
		return () => {
			channel.removeEventListener("message", handleMessage);
			channel.close();
		};
	}, [teamId]);

	// Form setup with Zod validation and RHF
	const {formMethods, RhfFormProvider } = useRhfForm<PendingSyncJournalEntry>({
		onSubmit: async (data) => {
			const app = getDataProxy();
			const entryId = data.journalEntryId;
			
			// 1. Prepare and persist files
			const fileIds = attachments.map((a) => a.id);
			for (const attachment of attachments) {
				await app.filesDb.upsert(
					attachment.id,
					entryId,
					attachment.file,
					attachment.file.name,
					teamId
				);
			}

			// 2. Prepare entry data
			const submitData: any = {
				...data,
				attachmentFileIds: fileIds,
				teamId: teamId,
				prompt: writingMode === "free" ? null : data.prompt,
				promptId: writingMode === "free" ? null : randomPrompt?.promptId ?? null,
				createdAt: Date.now(),
				status: fileIds.length > 0 ? "file-upload-pending" : "file-upload-completed",
				errorCount: 0,
			};

			try {
                // Use unified DB manager
				await app.journalEntriesDb.handleLocalCreate(submitData);

				// Cleanup state
				attachments.forEach((a) => URL.revokeObjectURL(a.previewUrl));
				setAttachments([]);
				
				// Pick a new prompt for next entry
				if (writingMode === "prompted") {
					const next = await getDataProxy().promptsDb.getRandomActive(teamId);
					if (next) setRandomPrompt(next);
				}

				formMethods.reset({
					journalEntryId: ulid(),
					prompt: null, // Will be set by effect
					content: "",
					attachmentFileIds: [],
					teamId: teamId,
					status: "file-upload-pending",
					errorCount: 0,
					createdAt: Date.now()
				});

				setSuccess("Journal entry created successfully!");
				
				setTimeout(() => setSuccess(""), 5000);
			} catch (error) {
				console.error("[CreateJournalEntryForm] Writing to local-db failed:", error);
				formMethods.setError(
					"root.unexpected",
					{
						type: "local-database",
						message: error instanceof Error
							? error.message
							: "Unknown error when saving data to local-db"
					}
				)
			} 
		},
		formConfig: {
			// @ts-expect-error
			resolver: zodResolver(pendingSyncJournalEntryZod),
			defaultValues: {
				prompt: null,
				content: undefined,
				attachmentFileIds: [],
				journalEntryId: ulid(),
				teamId: teamId,
				status: "file-upload-pending",
				errorCount: 0,
				createdAt: new Date().getTime()
			},
		},
	});
	
	useEffect(() => {
		// Clear prompt when switching to free mode
		if (writingMode === "free") {
			formMethods.setValue("prompt", null);
		} 
		// Auto-populate prompt when random prompt loads and in prompted mode
		else if (writingMode === "prompted" && randomPrompt?.text) {
			formMethods.setValue("prompt", randomPrompt.text);
		}
	}, [writingMode, formMethods, randomPrompt]);

	const handleRefreshPrompt = async () => {
		const next = await getDataProxy().promptsDb.getRandomActive(teamId);
		if (next) setRandomPrompt(next);
	};

	const handleModeChange = (_event: React.MouseEvent<HTMLElement>, newMode: WritingMode | null) => {
		if (newMode !== null) {
			setWritingMode(newMode);
		}
	};

	return (
		<Box sx={{ width: '100%', maxWidth: '100%' }}>
			{/* Header with Title and Mode Toggle */}
			<Box
				sx={{
					display: "flex",
					flexDirection: { xs: "column", sm: "row" },
					justifyContent: "space-between",
					alignItems: { xs: "flex-start", sm: "center" },
					gap: 1.5,
					mb: 3
				}}
			>

				{/* Writing Mode Toggle */}
				<ToggleButtonGroup
					value={writingMode}
					exclusive
					onChange={handleModeChange}
					size="small"
					sx={{
						width: { xs: "100%", sm: "auto" },
						gap: 1,
						"& .MuiToggleButtonGroup-grouped": {
							flex: { xs: 1, sm: "initial" },
							border: "1px solid !important",
							borderColor: "divider !important",
							borderRadius: "8px !important",
						},
						"& .MuiToggleButton-root": {
							px: 2,
							py: 0.75,
							minHeight: 36,
							textTransform: "none",
							fontSize: "0.8125rem",
							fontWeight: 600,
							transition: "all 0.2s ease-in-out",
							"&.Mui-selected": {
								bgcolor: "primary.main",
								color: "primary.contrastText",
								borderColor: "primary.main !important",
								"&:hover": {
									bgcolor: "primary.dark",
								},
							},
						},
					}}
				>
					<ToggleButton value="prompted">
						<AutoAwesomeIcon sx={{ fontSize: 16, mr: 1 }} />
						Prompted
					</ToggleButton>
					<ToggleButton value="free">
						<EditNoteIcon sx={{ fontSize: 18, mr: 1 }} />
						Free Write
					</ToggleButton>
				</ToggleButtonGroup>
			</Box>

			<RhfFormProvider>
				<Stack spacing={2.5}>
					{/* Random Prompt Section - Only show in prompted mode */}
					<Collapse in={writingMode === "prompted"} timeout={300}>
						<Box
							sx={{
								p: 2.5,
								background: (theme) => `linear-gradient(135deg, ${theme.palette.primary.main}08 0%, ${theme.palette.secondary.main}08 100%)`,
								borderRadius: 2.5,
								position: "relative",
								borderLeft: '4px solid',
								borderLeftColor: 'primary.main',
								boxShadow: '0 4px 12px 0 rgba(0,0,0,0.02)'
							}}
						>
							<Box
								sx={{
									display: "flex",
									alignItems: "center",
									justifyContent: "space-between",
									mb: 1.5,
								}}
							>
								<Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
									<AutoAwesomeIcon
										sx={{ color: "primary.main", fontSize: 16, opacity: 0.7 }}
									/>
									<Typography
										variant="overline"
										sx={{
											color: "text.secondary",
											fontWeight: 700,
											letterSpacing: "0.1em",
											fontSize: "0.65rem",
										}}
									>
										Today's Prompt
									</Typography>
								</Box>
								<IconButton
									onClick={handleRefreshPrompt}
									size="small"
									disabled={promptLoading}
									sx={{
										color: "text.secondary",
										"&:hover": {
											color: "primary.main",
											bgcolor: "action.hover",
											transform: "rotate(180deg)",
										},
										transition: "all 0.3s ease",
									}}
								>
									<RefreshIcon fontSize="small" />
								</IconButton>
							</Box>

							{promptLoading ? (
								<Box sx={{ display: "flex", justifyContent: "center", py: 1.5 }}>
									<LoadingSpinner size={20} />
								</Box>
							) : (
								<Box>
									<Typography
										variant="h6"
										sx={{
											fontWeight: 500,
											color: "text.primary",
											lineHeight: 1.4,
											fontStyle: "italic",
											fontSize: { xs: "1rem", sm: "1.125rem" },
										}}
									>
										{randomPrompt?.text ? `"${randomPrompt.text}"` : "Initializing your prompt..."}
									</Typography>
									{randomPrompt?.category && (
										<Box sx={{ mt: 1.5, display: "flex" }}>
											<Typography
												variant="caption"
												sx={{
													color: "primary.main",
													fontWeight: 600,
													px: 1.25,
													py: 0.25,
													bgcolor: "primary.main",
													background: (theme) => `${theme.palette.primary.main}15`,
													borderRadius: 1,
													textTransform: "uppercase",
													letterSpacing: "0.05em",
													fontSize: "0.6rem",
												}}
											>
												{randomPrompt.category}
											</Typography>
										</Box>
									)}
								</Box>
							)}
						</Box>
					</Collapse>

					{/* Hidden prompt field */}
					<input type="hidden" {...formMethods.register("prompt")} />

					<RhfTextField
						name="content"
						label={writingMode === "prompted" ? "Your Response" : "Your Thoughts"}
						multiline
						rows={10}
						placeholder={writingMode === "prompted"
							? "Start typing your reflection..."
							: "What's on your mind today?"
						}
						sx={{ 
							"& .MuiOutlinedInput-root": {
								borderRadius: 2,
								bgcolor: 'background.paper',
								'&:hover': {
									borderColor: 'primary.light'
								}
							}
						}}
					/>

					<Box sx={{ bgcolor: 'background.paper', borderRadius: 2, p: 1.5, border: '1px dashed', borderColor: 'divider' }}>
						<MediaUploader
							files={attachments}
							onAddFiles={handleAddFiles}
							onRemoveFile={handleRemoveFile}
							maxFiles={20}
						/>
					</Box>

					<Box sx={{ pt: 1 }}>
						<RhfSubmitButton
							notSubmittingText="Save Entry"
							isSubmittingText="Saving..."
							props={{
								variant: "contained",
								color: "primary",
								size: "medium",
								fullWidth: true,
								sx: { 
									py: 1.5, 
									borderRadius: 2, 
									fontWeight: 700,
									fontSize: '0.9375rem',
									boxShadow: '0 4px 12px 0 rgba(0,0,0,0.08)'
								}
							}}
						/>
					</Box>
				</Stack>
			</RhfFormProvider>

			<SuccessAlert message={success} />
		</Box>
	);
}
