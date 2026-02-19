import { Dialog, DialogActions, DialogContent, DialogTitle } from "@connected-repo/ui-mui/feedback/Dialog";
import { Button } from "@connected-repo/ui-mui/form/Button";
import { TextField } from "@connected-repo/ui-mui/form/TextField";
import { Box } from "@connected-repo/ui-mui/layout/Box";
import { CharacterCounter } from "@connected-repo/ui-mui/components/CharacterCounter";
import { useState, useEffect } from "react";

interface EditJournalEntryDialogProps {
	open: boolean;
	onClose: () => void;
	onSave: (data: { content: string; prompt: string | null }) => Promise<void>;
	initialContent: string;
	initialPrompt?: string | null;
	isSaving?: boolean;
}

const MAX_CONTENT_LENGTH = 50000;
const MAX_PROMPT_LENGTH = 500;

export function EditJournalEntryDialog({
	open,
	onClose,
	onSave,
	initialContent,
	initialPrompt = null,
	isSaving = false,
}: EditJournalEntryDialogProps) {
	const [content, setContent] = useState(initialContent);
	const [prompt, setPrompt] = useState(initialPrompt || "");
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (open) {
			setContent(initialContent);
			setPrompt(initialPrompt || "");
			setError(null);
		}
	}, [open, initialContent, initialPrompt]);

	const handleSave = async () => {
		const trimmedContent = content.trim();
		
		if (!trimmedContent) {
			setError("Content cannot be empty");
			return;
		}

		if (trimmedContent.length > MAX_CONTENT_LENGTH) {
			setError(`Content is too long. Maximum ${MAX_CONTENT_LENGTH} characters allowed`);
			return;
		}

		if (prompt.length > MAX_PROMPT_LENGTH) {
			setError(`Prompt is too long. Maximum ${MAX_PROMPT_LENGTH} characters allowed`);
			return;
		}

		try {
			setError(null);
			await onSave({
				content: trimmedContent,
				prompt: prompt.trim() || null,
			});
			// Dialog will be closed by parent component after successful save
		} catch (err) {
			console.error("Save error:", err);
			setError(err instanceof Error ? err.message : "Failed to save changes. Please try again.");
		}
	};

	const handleCancel = () => {
		setError(null);
		onClose();
	};

	const contentLength = content.length;
	const promptLength = prompt.length;
	const hasChanges = content !== initialContent || prompt !== (initialPrompt || "");

	return (
		<Dialog open={open} onClose={handleCancel} maxWidth="md" fullWidth>
			<DialogTitle>Edit Journal Entry</DialogTitle>
			<DialogContent>
				<Box sx={{ display: "flex", flexDirection: "column", gap: 3, pt: 1 }}>
					{/* Prompt Field */}
					<Box>
						<TextField
							fullWidth
							label="Prompt (Optional)"
							value={prompt}
							onChange={(e) => setPrompt(e.target.value)}
							placeholder="What inspired this entry?"
							disabled={isSaving}
							inputProps={{ maxLength: MAX_PROMPT_LENGTH }}
						/>
						<CharacterCounter
							current={promptLength}
							max={MAX_PROMPT_LENGTH}
							sx={{ mt: 0.5 }}
						/>
					</Box>

					{/* Content Field */}
					<Box>
						<TextField
							fullWidth
							multiline
							rows={12}
							label="Entry Content"
							value={content}
							onChange={(e) => setContent(e.target.value)}
							placeholder="Write your thoughts..."
							disabled={isSaving}
							error={!!error}
							helperText={error}
							inputProps={{ maxLength: MAX_CONTENT_LENGTH }}
							sx={{
								"& .MuiOutlinedInput-root": {
									"&.Mui-focused fieldset": {
										borderWidth: 2,
									},
								},
							}}
						/>
						<CharacterCounter
							current={contentLength}
							max={MAX_CONTENT_LENGTH}
							sx={{ mt: 0.5 }}
						/>
					</Box>
				</Box>
			</DialogContent>
			<DialogActions sx={{ px: 3, pb: 3 }}>
				<Button onClick={handleCancel} disabled={isSaving}>
					Cancel
				</Button>
				<Button
					onClick={handleSave}
					variant="contained"
					disabled={isSaving || !hasChanges}
					sx={{
						transition: "all 0.2s ease-in-out",
						"&:hover": {
							transform: !isSaving && hasChanges ? "translateY(-2px)" : "none",
							boxShadow: !isSaving && hasChanges ? 4 : 0,
						},
					}}
				>
					{isSaving ? "Saving..." : "Save Changes"}
				</Button>
			</DialogActions>
		</Dialog>
	);
}
