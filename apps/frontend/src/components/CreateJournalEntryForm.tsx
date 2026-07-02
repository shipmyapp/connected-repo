import { LoadingSpinner } from "@connected-repo/ui-mui/components/LoadingSpinner";
import type { MediaFile } from "@connected-repo/ui-mui/components/MediaUploader";
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
import {
	type JournalEntryCreateInput,
	journalEntryCreateInputZod,
} from "@connected-repo/zod-schemas/journal_entry.zod";
import { useActiveTeamId } from "@frontend/contexts/WorkspaceContext";
import { orpcFetch } from "@frontend/utils/orpc.client";
import { orpc } from "@frontend/utils/orpc.tanstack.client";
import { getDataProxy } from "@frontend/worker/worker.proxy";
import { zodResolver } from "@hookform/resolvers/zod";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import EditNoteIcon from "@mui/icons-material/EditNote";
import RefreshIcon from "@mui/icons-material/Refresh";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { Resolver } from "react-hook-form";
import { ulid } from "ulid";
import { SmartMediaUploader } from "./SmartMediaUploader";

type WritingMode = "prompted" | "free";

export function CreateJournalEntryForm() {
	const teamId = useActiveTeamId();
	const queryClient = useQueryClient();
	const [success, setSuccess] = useState("");
	const [writingMode, setWritingMode] = useState<WritingMode>("prompted");
	const [attachments, setAttachments] = useState<MediaFile[]>([]);

	// Random prompt query — refetch returns a new random pick from the backend.
	const {
		data: randomPrompt,
		isLoading: promptLoading,
		refetch: refetchPrompt,
	} = useQuery({
		...orpc.prompts.getRandomActive.queryOptions({}),
		// Don't auto-refetch on focus or reconnect — only on explicit refresh /
		// after successful creation.
		staleTime: Infinity,
		refetchOnWindowFocus: false,
		refetchOnReconnect: false,
		retry: false,
	});

	const { formMethods, RhfFormProvider } = useRhfForm<JournalEntryCreateInput>({
		onSubmit: async (data) => {
			const entryId = data.id;

			try {
				// 1. Stage every picked file to OPFS and create the local
				//    `files` rows in `mainUploadState: "pending"`. The
				//    `FileUploadWorker` (via `sync.processQueue`) then drains
				//    the queue in the background: presign → PUT → mark
				//    `uploaded_to_cdn` → `files.pushCdnUpdates`. This is the
				//    ONE upload path — online and offline follow it
				//    identically. The form submit no longer blocks on the
				//    CDN round-trip.
				const dataProxy = await getDataProxy();
				if (attachments.length > 0) {
					await Promise.all(
						attachments.map((a) =>
							dataProxy.filesDb.upsertLocal({
								id: a.id,
								tableName: "journalEntries",
								tableId: entryId,
								fileName: a.file.name,
								mimeType: a.file.type,
								blob: a.file,
								teamId: teamId ?? null,
							}),
						),
					);
				}

				// 2. Persist the entry itself. Nested file metadata rides
				//    with the parent so the server writes both parent and
				//    file rows atomically; `cdnUrl` is NULL and the local
				//    worker patches it in later via `files.pushCdnUpdates`.
				//    `teamId` on parent AND nested files is NOT sent — the
				//    server derives both from `ctx.activeTeamId` so a client
				//    can't plant/relocate rows into another tenant.
				await orpcFetch.journalEntries.create({
					id: entryId,
					content: data.content,
					prompt: writingMode === "free" ? null : data.prompt ?? null,
					promptId: writingMode === "free" ? null : randomPrompt?.id ?? null,
					files: attachments.map((a) => ({
						id: a.id,
						tableName: "journalEntries",
						tableId: entryId,
						type: "attachment",
						fileName: a.file.name,
						mimeType: a.file.type,
						cdnUrl: null,
						thumbnailCdnUrl: null,
						isMainFileLost: false,
					})),
				});

				// 3. Kick the sync queue so the FileUploadWorker starts
				//    draining OPFS immediately (rather than waiting for the
				//    next visibilitychange / focus / online / 60s trigger).
				//    `processQueue` is idempotent so an early kick is safe.
				void dataProxy.sync.processQueue();

				// 4. Cleanup attachment state and revoke preview URLs.
				attachments.forEach((a) => {
					URL.revokeObjectURL(a.previewUrl);
					if (a.thumbnailUrl) URL.revokeObjectURL(a.thumbnailUrl);
				});
				setAttachments([]);

				// 5. Invalidate dependent queries and reset the form.
				queryClient.invalidateQueries({
					queryKey: orpc.journalEntries.getAll.queryOptions().queryKey,
				});

				if (writingMode === "prompted") {
					await refetchPrompt();
				}

				formMethods.reset({
					id: ulid(),
					prompt: null,
					content: "",
				});

				setSuccess("Journal entry created successfully!");
				setTimeout(() => setSuccess(""), 5000);
			} catch (error) {
				console.error("[CreateJournalEntryForm] Create failed:", error);
				formMethods.setError("root.unexpected", {
					type: "create-failed",
					message:
						error instanceof Error ? error.message : "Failed to save journal entry",
				});
			}
		},
		formConfig: {
			// Cast: `zTimeEpoch` uses `z.coerce.number()` whose input type is
			// `unknown` while its inferred output is `number`. The form's
			// generic is set to the output shape (JournalEntryCreateInput),
			// so the resolver's input-side type doesn't line up. Runtime is
			// fine — the resolver still coerces correctly.
			resolver: zodResolver(journalEntryCreateInputZod) as Resolver<JournalEntryCreateInput>,
			defaultValues: {
				prompt: null,
				content: "",
				id: ulid(),
			},
		},
	});

	useEffect(() => {
		if (writingMode === "free") {
			formMethods.setValue("prompt", null);
		} else if (writingMode === "prompted" && randomPrompt?.text) {
			formMethods.setValue("prompt", randomPrompt.text);
		}
	}, [writingMode, formMethods, randomPrompt]);

	const handleRefreshPrompt = async () => {
		await refetchPrompt();
	};

	const handleModeChange = (
		_event: React.MouseEvent<HTMLElement>,
		newMode: WritingMode | null,
	) => {
		if (newMode !== null) {
			setWritingMode(newMode);
		}
	};

	return (
		<Box sx={{ width: "100%", maxWidth: "100%" }}>
			<Box
				sx={{
					display: "flex",
					flexDirection: { xs: "column", sm: "row" },
					justifyContent: "space-between",
					alignItems: { xs: "flex-start", sm: "center" },
					gap: 1.5,
					mb: 3,
				}}
			>
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
					<Collapse in={writingMode === "prompted"} timeout={300}>
						<Box
							sx={{
								p: 2.5,
								background: (theme) =>
									`linear-gradient(135deg, ${theme.palette.primary.main}08 0%, ${theme.palette.secondary.main}08 100%)`,
								borderRadius: 2.5,
								position: "relative",
								borderLeft: "4px solid",
								borderLeftColor: "primary.main",
								boxShadow: "0 4px 12px 0 rgba(0,0,0,0.02)",
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
									<AutoAwesomeIcon sx={{ color: "primary.main", fontSize: 16, opacity: 0.7 }} />
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
										{randomPrompt?.text ? `"${randomPrompt.text}"` : "Unable to load prompt."}
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

					<input type="hidden" {...formMethods.register("prompt")} />

					<RhfTextField
						name="content"
						label={writingMode === "prompted" ? "Your Response" : "Your Thoughts"}
						multiline
						rows={10}
						placeholder={
							writingMode === "prompted"
								? "Start typing your reflection..."
								: "What's on your mind today?"
						}
						sx={{
							"& .MuiOutlinedInput-root": {
								borderRadius: 2,
								bgcolor: "background.paper",
								"&:hover": {
									borderColor: "primary.light",
								},
							},
						}}
					/>

					<Box sx={{ bgcolor: "background.paper", borderRadius: 2, p: 1.5, border: "1px dashed", borderColor: "divider" }}>
						<SmartMediaUploader value={attachments} onChange={setAttachments} maxFiles={20} />
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
									fontSize: "0.9375rem",
									boxShadow: "0 4px 12px 0 rgba(0,0,0,0.08)",
								},
							}}
						/>
					</Box>
				</Stack>
			</RhfFormProvider>

			<SuccessAlert message={success} />
		</Box>
	);
}
