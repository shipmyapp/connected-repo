import { ContentCard } from "@connected-repo/ui-mui/components/ContentCard";
import { LoadingSpinner } from "@connected-repo/ui-mui/components/LoadingSpinner";
import { MediaUploader, type MediaFile } from "@connected-repo/ui-mui/components/MediaUploader";
import { SuccessAlert } from "@connected-repo/ui-mui/components/SuccessAlert";
import { Typography } from "@connected-repo/ui-mui/data-display/Typography";
import { Collapse } from "@connected-repo/ui-mui/feedback/Collapse";
import { ToggleButton } from "@connected-repo/ui-mui/form/ToggleButton";
import { ToggleButtonGroup } from "@connected-repo/ui-mui/form/ToggleButtonGroup";
import { Box } from "@connected-repo/ui-mui/layout/Box";
import { Paper } from "@connected-repo/ui-mui/layout/Paper";
import { Stack } from "@connected-repo/ui-mui/layout/Stack";
import { IconButton } from "@connected-repo/ui-mui/navigation/IconButton";
import { RhfSubmitButton } from "@connected-repo/ui-mui/rhf-form/RhfSubmitButton";
import { RhfTextField } from "@connected-repo/ui-mui/rhf-form/RhfTextField";
import { useRhfForm } from "@connected-repo/ui-mui/rhf-form/useRhfForm";
import { PendingSyncJournalEntry, pendingSyncJournalEntryZod } from "@connected-repo/zod-schemas/journal_entry.zod";
import { getAppProxy } from "@frontend/worker/app.proxy";
import { zodResolver } from "@hookform/resolvers/zod";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import EditNoteIcon from "@mui/icons-material/EditNote";
import RefreshIcon from "@mui/icons-material/Refresh";
import { useCallback, useEffect, useRef, useState } from "react";
import { ulid } from "ulid";

type WritingMode = "prompted" | "free";

export function CreateJournalEntryForm() {
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
				const p = await getAppProxy().promptsDb.getRandomActive();
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
	}, []);

	// Form setup with Zod validation and RHF
	const {formMethods, RhfFormProvider } = useRhfForm<PendingSyncJournalEntry>({
		onSubmit: async (data) => {
			const app = getAppProxy();
			const entryId = data.journalEntryId;
			
			// 1. Prepare and persist files
			const fileIds = attachments.map((a) => a.id);
			for (const attachment of attachments) {
				await app.filesDb.upsert(
					attachment.id,
					entryId,
					attachment.file,
					attachment.file.name
				);
			}

			// 2. Prepare entry data
			const submitData: PendingSyncJournalEntry = {
				...data,
				attachmentFileIds: fileIds,
				prompt: writingMode === "free" ? null : data.prompt,
				promptId: writingMode === "free" ? null : randomPrompt?.promptId ?? null,
				createdAt: Date.now(),
				status: fileIds.length > 0 ? "file-upload-pending" : "file-upload-completed",
				errorCount: 0,
			};

			try {
				await app.pendingSyncJournalEntriesDb.add(submitData);

				// Cleanup state
				attachments.forEach((a) => URL.revokeObjectURL(a.previewUrl));
				setAttachments([]);
				
				// Pick a new prompt for next entry
				if (writingMode === "prompted") {
					const next = await getAppProxy().promptsDb.getRandomActive();
					if (next) setRandomPrompt(next);
				}

				formMethods.reset({
					journalEntryId: ulid(),
					prompt: null, // Will be set by effect
					content: "",
					attachmentFileIds: [],
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
							: "Unknown error when saving data to local-b"
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
		const next = await getAppProxy().promptsDb.getRandomActive();
		if (next) setRandomPrompt(next);
	};

	const handleModeChange = (_event: React.MouseEvent<HTMLElement>, newMode: WritingMode | null) => {
		if (newMode !== null) {
			setWritingMode(newMode);
		}
	};

	return (
		<ContentCard>
			<Box
				sx={{
					display: "flex",
					flexDirection: { xs: "column", sm: "row" },
					justifyContent: "space-between",
					alignItems: { xs: "flex-start", sm: "center" },
					gap: { xs: 2, sm: 0 },
					mb: 3
				}}
			>
				<Typography
					variant="h5"
					component="h3"
					sx={{
						fontSize: { xs: "1.25rem", sm: "1.5rem" },
					}}
				>
					Create New Journal Entry
				</Typography>

				{/* Writing Mode Toggle */}
				<ToggleButtonGroup
					value={writingMode}
					exclusive
					onChange={handleModeChange}
					size="small"
					sx={{
						width: { xs: "100%", sm: "auto" },
						"& .MuiToggleButtonGroup-grouped": {
							flex: { xs: 1, sm: "initial" },
						},
						"& .MuiToggleButton-root": {
							px: { xs: 2.5, sm: 2, md: 2.5 },
							py: { xs: 1.25, sm: 0.75, md: 1 },
							minHeight: { xs: 44, sm: 36 },
							textTransform: "none",
							fontSize: { xs: "0.9375rem", sm: "0.8125rem", md: "0.875rem" },
							fontWeight: 500,
							border: "1px solid",
							borderColor: "divider",
							transition: "all 0.2s ease-in-out",
							color: "text.primary",
							"&.Mui-selected": {
								bgcolor: "primary.main",
								color: "primary.contrastText",
								borderColor: "primary.main",
								"&:hover": {
									bgcolor: "primary.dark",
								},
							},
							"&:not(.Mui-selected)": {
								bgcolor: "background.paper",
								"&:hover": {
									bgcolor: "action.hover",
									borderColor: "primary.main",
								},
							},
						},
					}}
				>
					<ToggleButton value="prompted">
						<AutoAwesomeIcon
							sx={{
								fontSize: { xs: 18, sm: 16, md: 17 },
								mr: { xs: 0.75, sm: 0.5 }
							}}
						/>
						Prompted
					</ToggleButton>
					<ToggleButton value="free">
						<EditNoteIcon
							sx={{
								fontSize: { xs: 20, sm: 18, md: 19 },
								mr: { xs: 0.75, sm: 0.5 }
							}}
						/>
						Free Write
					</ToggleButton>
				</ToggleButtonGroup>
			</Box>

			<RhfFormProvider>
				<Stack spacing={3}>
					{/* Random Prompt Section - Only show in prompted mode */}
					<Collapse in={writingMode === "prompted"} timeout={300}>
					<Paper
						elevation={0}
						sx={{
							p: 3,
							background: "linear-gradient(135deg, #667eea15 0%, #764ba215 100%)",
							borderRadius: 2,
							border: "1px solid",
							borderColor: "divider",
							position: "relative",
							overflow: "hidden",
							"&::before": {
								content: '""',
								position: "absolute",
								top: 0,
								left: 0,
								right: 0,
								height: "2px",
								background: "linear-gradient(90deg, #667eea 0%, #764ba2 100%)",
							},
						}}
					>
						<Box
							sx={{
								display: "flex",
								alignItems: "center",
								justifyContent: "space-between",
								mb: 2,
							}}
						>
							<Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
								<AutoAwesomeIcon
									sx={{ color: "#667eea", fontSize: 18, opacity: 0.8 }}
								/>
								<Typography
									variant="overline"
									sx={{
										color: "text.secondary",
										fontWeight: 600,
										letterSpacing: "0.08em",
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
									color: "primary.main",
									"&:hover": {
										backgroundColor: "action.hover",
										transform: "rotate(180deg)",
									},
									transition: "transform 0.3s ease",
								}}
								title="Get a new prompt"
							>
								<RefreshIcon fontSize="small" />
							</IconButton>
						</Box>

						{promptLoading ? (
							<Box
								sx={{
									display: "flex",
									justifyContent: "center",
									alignItems: "center",
									py: 3,
								}}
							>
								<LoadingSpinner size={24} />
							</Box>
						) : (
							<Box>
								<Typography
									variant="body1"
									sx={{
										fontWeight: 400,
										color: "text.primary",
										lineHeight: 1.6,
										fontStyle: "italic",
										letterSpacing: "0.005em",
										px: 1,
									}}
								>
									{randomPrompt?.text ? `"${randomPrompt.text}"` : "Initializing your prompt..."}
								</Typography>
								{randomPrompt?.category && (
									<Box sx={{ mt: 2, display: "flex", justifyContent: "flex-end" }}>
										<Typography
											variant="caption"
											sx={{
												color: "text.secondary",
												fontWeight: 500,
												px: 1.5,
												py: 0.5,
												backgroundColor: "background.paper",
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
					</Paper>
					</Collapse>

					{/* Hidden prompt field - auto-populated, read-only */}
					<input type="hidden" {...formMethods.register("prompt")} />

					<RhfTextField
						name="content"
						label={writingMode === "prompted" ? "Your Response" : "Your Thoughts"}
						multiline
						rows={8}
						placeholder={writingMode === "prompted"
							? "Write your thoughts here..."
							: "Write freely about anything on your mind..."
						}
						helperText={writingMode === "prompted"
							? "Share your reflections on the prompt above"
							: "Express yourself freely without any prompts or constraints"
						}
						sx={{ mb: 0 }}
					/>

					<MediaUploader
						files={attachments}
						onAddFiles={handleAddFiles}
						onRemoveFile={handleRemoveFile}
						maxFiles={5}
					/>

					<RhfSubmitButton
						notSubmittingText="Create Entry"
						isSubmittingText="Creating..."
						props={{
							variant: "contained",
							color: "success",
							fullWidth: true,
						}}
					/>
				</Stack>
			</RhfFormProvider>

			<SuccessAlert message={success} />
		</ContentCard>
	);
}
