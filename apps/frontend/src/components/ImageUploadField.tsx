import { ConfirmDialog } from "@connected-repo/ui-mui/components/ConfirmDialog";
import { Typography } from "@connected-repo/ui-mui/data-display/Typography";
import { Button } from "@connected-repo/ui-mui/form/Button";
import { Box } from "@connected-repo/ui-mui/layout/Box";
import { uploadImage } from "@frontend/utils/upload_image";
import ImageOutlinedIcon from "@mui/icons-material/ImageOutlined";
import { useId, useRef, useState } from "react";

/**
 * One picture on a form: a preview of what is set, a button to replace it
 * and one to clear it. The upload happens as soon as a file is picked, so
 * the form only ever submits a URL; a failed upload leaves the old value.
 * `confirmRemove` asks before clearing, for a field whose change is saved
 * at once rather than on the form's own Save.
 */
export function ImageUploadField({
	label,
	value,
	resourceType,
	disabled = false,
	confirmRemove = false,
	onChange,
}: {
	label: string;
	value: string | null;
	resourceType: "branding";
	disabled?: boolean;
	confirmRemove?: boolean;
	onChange: (url: string | null) => void;
}) {
	const inputId = useId();
	const input = useRef<HTMLInputElement | null>(null);
	const [uploading, setUploading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [asking, setAsking] = useState(false);

	const pick = async (file: File | undefined) => {
		if (!file) return;
		setUploading(true);
		setError(null);
		try {
			onChange(await uploadImage(file, resourceType));
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : "Upload failed.");
		} finally {
			setUploading(false);
			if (input.current) input.current.value = "";
		}
	};

	return (
		<Box>
			<Typography
				component="label"
				htmlFor={inputId}
				sx={{ fontSize: 14, fontWeight: 500, display: "block", mb: 1 }}
			>
				{label}
			</Typography>
			<Box sx={{ display: "flex", gap: 2, alignItems: "center", flexWrap: "wrap" }}>
				<Box
					sx={{
						width: 112,
						height: 72,
						borderRadius: 2,
						border: "1px solid",
						borderColor: "divider",
						bgcolor: "action.hover",
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						overflow: "hidden",
						flexShrink: 0,
					}}
				>
					{value ? (
						<Box
							component="img"
							src={value}
							alt=""
							sx={{ width: "100%", height: "100%", objectFit: "cover" }}
						/>
					) : (
						<ImageOutlinedIcon sx={{ color: "text.disabled" }} />
					)}
				</Box>
				<Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
					<input
						ref={input}
						id={inputId}
						type="file"
						accept="image/png,image/jpeg,image/webp"
						hidden
						disabled={disabled || uploading}
						onChange={(e) => void pick(e.target.files?.[0])}
					/>
					<Button
						variant="outlined"
						size="small"
						disabled={disabled || uploading}
						onClick={() => input.current?.click()}
					>
						{uploading ? "Uploading…" : value ? "Replace" : "Upload"}
					</Button>
					{value && (
						<Button
							size="small"
							color="inherit"
							disabled={disabled || uploading}
							onClick={() => (confirmRemove ? setAsking(true) : onChange(null))}
						>
							Remove
						</Button>
					)}
					<ConfirmDialog
						open={asking}
						title="Remove the picture?"
						description="It is taken off at once. Uploading it again puts it back."
						confirmLabel="Remove"
						onClose={() => setAsking(false)}
						onConfirm={() => {
							setAsking(false);
							onChange(null);
						}}
					/>
				</Box>
			</Box>
			{error && (
				<Typography color="error" sx={{ mt: 1, fontSize: 13 }}>
					{error}
				</Typography>
			)}
		</Box>
	);
}
