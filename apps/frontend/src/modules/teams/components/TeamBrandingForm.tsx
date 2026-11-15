import { Typography } from "@connected-repo/ui-mui/data-display/Typography";
import { Alert } from "@connected-repo/ui-mui/feedback/Alert";
import { Button } from "@connected-repo/ui-mui/form/Button";
import { TextField } from "@connected-repo/ui-mui/form/TextField";
import { Box } from "@connected-repo/ui-mui/layout/Box";
import { Card } from "@connected-repo/ui-mui/layout/Card";
import { Grid } from "@connected-repo/ui-mui/layout/Grid";
import { Stack } from "@connected-repo/ui-mui/layout/Stack";
import {
	type TeamAppUpdateApiInput,
	type TeamWithRole,
	teamAppUpdateApiInputZod,
} from "@connected-repo/zod-schemas/team_app.zod";
import { DEFAULT_APP_BRAND } from "@connected-repo/zod-schemas/tenant.utils";
import { ImageUploadField } from "@frontend/components/ImageUploadField";
import { useTenant } from "@frontend/tenant/TenantContext";
import { getTenantRootDomain, tenantUrlForSlug } from "@frontend/tenant/tenant.resolver";
import { orpc } from "@frontend/utils/orpc.tanstack.client";
import LaunchIcon from "@mui/icons-material/Launch";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type React from "react";
import { useState } from "react";
import { toast } from "react-toastify";

interface TeamBrandingFormProps {
	team: TeamWithRole;
	canManage: boolean;
}

type FormState = {
	name: string;
	appName: string;
	appShortName: string;
	tagline: string;
	logoUrl: string;
	pwaIconUrl: string;
	primaryColor: string;
	secondaryColor: string;
	backgroundColor: string;
};

const toForm = (team: TeamWithRole): FormState => ({
	name: team.name,
	appName: team.appName ?? "",
	appShortName: team.appShortName ?? "",
	tagline: team.tagline ?? "",
	logoUrl: team.logoUrl ?? "",
	pwaIconUrl: team.pwaIconUrl ?? "",
	primaryColor: team.primaryColor ?? "",
	secondaryColor: team.secondaryColor ?? "",
	backgroundColor: team.backgroundColor ?? "",
});

// Empty string → null so a cleared field actually clears the column instead
// of failing the URL/hex validators.
const toPayload = (f: FormState): TeamAppUpdateApiInput => ({
	name: f.name.trim(),
	appName: f.appName.trim() || null,
	appShortName: f.appShortName.trim() || null,
	tagline: f.tagline.trim() || null,
	logoUrl: f.logoUrl.trim() || null,
	pwaIconUrl: f.pwaIconUrl.trim() || null,
	primaryColor: f.primaryColor.trim() || null,
	secondaryColor: f.secondaryColor.trim() || null,
	backgroundColor: f.backgroundColor.trim() || null,
});

/**
 * Owner/Admin editor for the team's identity and its private, white-labelled
 * PWA: subdomain, app name, colours, icon. Saving re-brands this very host if
 * we're already on the tenant subdomain.
 */
export function TeamBrandingForm({ team, canManage }: TeamBrandingFormProps) {
	const queryClient = useQueryClient();
	const tenant = useTenant();
	const rootDomain = getTenantRootDomain();
	const [form, setForm] = useState<FormState>(() => toForm(team));
	const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof FormState, string>>>({});

	const set = (key: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) => {
		setForm((prev) => ({ ...prev, [key]: e.target.value }));
		setFieldErrors((prev) => ({ ...prev, [key]: undefined }));
	};

	const mutation = useMutation(
		orpc.teams.updateTeam.mutationOptions({
			onSuccess: async () => {
				await queryClient.invalidateQueries({
					queryKey: orpc.teams.getMyTeams.queryOptions({}).queryKey,
				});
				if (tenant.isTenant) await tenant.refresh();
				toast.success("Branding saved");
			},
			onError: (err) => {
				toast.error(err.message || "Failed to save branding");
			},
		}),
	);

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		const parsed = teamAppUpdateApiInputZod.safeParse(toPayload(form));
		if (!parsed.success) {
			const next: Partial<Record<keyof FormState, string>> = {};
			for (const issue of parsed.error.issues) {
				const key = issue.path[0];
				if (typeof key === "string" && !(key in next)) {
					next[key as keyof FormState] = issue.message;
				}
			}
			setFieldErrors(next);
			return;
		}
		mutation.mutate(parsed.data);
	};

	const liveUrl = team.slug && rootDomain ? tenantUrlForSlug(team.slug) : null;
	const primaryPreview = form.primaryColor.trim() || DEFAULT_APP_BRAND.themeColor;
	const disabled = !canManage || mutation.isPending;

	return (
		<Card
			component="form"
			onSubmit={handleSubmit}
			sx={{ p: 3, borderRadius: 2, border: "1px solid", borderColor: "divider" }}
		>
			<Stack spacing={3}>
				<Box>
					<Typography variant="h6" sx={{ fontWeight: 700 }}>
						Branding & private app
					</Typography>
					<Typography variant="body2" color="text.secondary">
						Give this team its own installable app at its own address, with its own name, logo and
						colours.
					</Typography>
				</Box>

				{!canManage && (
					<Alert severity="info">Only team Owners and Admins can change branding.</Alert>
				)}

				<Grid container spacing={2}>
					<Grid size={{ xs: 12, md: 6 }}>
						<TextField
							label="Team name"
							value={form.name}
							onChange={set("name")}
							error={!!fieldErrors.name}
							helperText={fieldErrors.name}
							fullWidth
							disabled={disabled}
						/>
					</Grid>
					<Grid size={{ xs: 12, md: 6 }}>
						{/* Assigned by the operator from the super-admin console — it needs a
						    DNS record and a certificate on their side — so it is read
						    here and never typed. */}
						<TextField
							label="Subdomain"
							value={team.slug ?? ""}
							helperText={
								team.slug
									? rootDomain
										? `Your app lives at ${team.slug}.${rootDomain}. Assigned by the app's operator — ask them to change it.`
										: "Assigned by the app's operator — ask them to change it."
									: "Not assigned yet. Ask the app's operator for a subdomain for this team's private app."
							}
							placeholder="not assigned"
							fullWidth
							slotProps={{ input: { readOnly: true } }}
						/>
					</Grid>
					<Grid size={{ xs: 12, md: 6 }}>
						<TextField
							label="App name"
							value={form.appName}
							onChange={set("appName")}
							error={!!fieldErrors.appName}
							helperText={
								fieldErrors.appName ?? "Shown in the app header and on the install prompt"
							}
							placeholder={form.name || DEFAULT_APP_BRAND.appName}
							fullWidth
							disabled={disabled}
						/>
					</Grid>
					<Grid size={{ xs: 12, md: 6 }}>
						<TextField
							label="Short name"
							value={form.appShortName}
							onChange={set("appShortName")}
							error={!!fieldErrors.appShortName}
							helperText={fieldErrors.appShortName ?? "Under the home-screen icon (max 12 chars)"}
							fullWidth
							disabled={disabled}
							slotProps={{ htmlInput: { maxLength: 12 } }}
						/>
					</Grid>
					<Grid size={{ xs: 12 }}>
						<TextField
							label="Tagline"
							value={form.tagline}
							onChange={set("tagline")}
							error={!!fieldErrors.tagline}
							helperText={fieldErrors.tagline ?? "One line under the app name on the sign-in page"}
							fullWidth
							disabled={disabled}
							slotProps={{ htmlInput: { maxLength: 160 } }}
						/>
					</Grid>
					<Grid size={{ xs: 12, md: 6 }}>
						<ImageUploadField
							label="Logo (header and sign-in page)"
							value={form.logoUrl.trim() || null}
							resourceType="branding"
							disabled={disabled}
							onChange={(url) => setForm((prev) => ({ ...prev, logoUrl: url ?? "" }))}
						/>
					</Grid>
					<Grid size={{ xs: 12, md: 6 }}>
						<ImageUploadField
							label="App icon (square PNG, 512×512)"
							value={form.pwaIconUrl.trim() || null}
							resourceType="branding"
							disabled={disabled}
							onChange={(url) => setForm((prev) => ({ ...prev, pwaIconUrl: url ?? "" }))}
						/>
					</Grid>
					<Grid size={{ xs: 12, sm: 4 }}>
						<ColorField
							label="Primary colour"
							value={form.primaryColor}
							onChange={set("primaryColor")}
							error={fieldErrors.primaryColor}
							disabled={disabled}
						/>
					</Grid>
					<Grid size={{ xs: 12, sm: 4 }}>
						<ColorField
							label="Secondary colour"
							value={form.secondaryColor}
							onChange={set("secondaryColor")}
							error={fieldErrors.secondaryColor}
							disabled={disabled}
						/>
					</Grid>
					<Grid size={{ xs: 12, sm: 4 }}>
						<ColorField
							label="Background colour"
							value={form.backgroundColor}
							onChange={set("backgroundColor")}
							error={fieldErrors.backgroundColor}
							disabled={disabled}
						/>
					</Grid>
				</Grid>

				{/* Live preview of the header the tenant app will show. */}
				<Box
					sx={{
						p: 2,
						borderRadius: 2,
						border: "1px solid",
						borderColor: "divider",
						bgcolor: form.backgroundColor.trim() || "background.default",
					}}
				>
					<Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
						Preview
					</Typography>
					<Stack direction="row" spacing={1.5} alignItems="center">
						{form.logoUrl.trim() && (
							<Box
								component="img"
								src={form.logoUrl.trim()}
								alt=""
								sx={{ width: 32, height: 32, borderRadius: 1, objectFit: "cover" }}
							/>
						)}
						<Typography
							variant="h6"
							sx={{ fontWeight: 700, color: primaryPreview, letterSpacing: -0.5 }}
						>
							{form.appName.trim() || form.name || DEFAULT_APP_BRAND.appName}
						</Typography>
					</Stack>
				</Box>

				<Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} alignItems={{ sm: "center" }}>
					<Button
						type="submit"
						variant="contained"
						disabled={disabled}
						sx={{ minHeight: 44, borderRadius: 2 }}
					>
						{mutation.isPending ? "Saving…" : "Save branding"}
					</Button>
					{liveUrl && (
						<Button
							variant="outlined"
							href={liveUrl}
							target="_blank"
							rel="noopener"
							endIcon={<LaunchIcon />}
							sx={{ minHeight: 44, borderRadius: 2 }}
						>
							Open {liveUrl.replace(/^https?:\/\//, "")}
						</Button>
					)}
				</Stack>
			</Stack>
		</Card>
	);
}

interface ColorFieldProps {
	label: string;
	value: string;
	onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
	error?: string;
	disabled: boolean;
}

// Text input + native colour swatch. The text field is the source of truth
// (users paste brand hex codes); the swatch is a convenience picker.
const ColorField = ({ label, value, onChange, error, disabled }: ColorFieldProps) => (
	<Stack direction="row" spacing={1} alignItems="flex-start">
		<TextField
			label={label}
			value={value}
			onChange={onChange}
			error={!!error}
			helperText={error ?? `Hex, e.g. ${DEFAULT_APP_BRAND.themeColor}`}
			placeholder={DEFAULT_APP_BRAND.themeColor}
			fullWidth
			disabled={disabled}
		/>
		<Box
			component="input"
			type="color"
			value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : DEFAULT_APP_BRAND.themeColor}
			onChange={onChange}
			disabled={disabled}
			aria-label={`${label} picker`}
			sx={{
				width: 44,
				height: 44,
				p: 0,
				border: "1px solid",
				borderColor: "divider",
				borderRadius: 1,
				bgcolor: "transparent",
				cursor: disabled ? "default" : "pointer",
				flexShrink: 0,
			}}
		/>
	</Stack>
);
