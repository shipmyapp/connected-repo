import { ContentCard } from "@connected-repo/ui-mui/components/ContentCard";
import { SuccessAlert } from "@connected-repo/ui-mui/components/SuccessAlert";
import { Box } from "@connected-repo/ui-mui/layout/Box";
import { Stack } from "@connected-repo/ui-mui/layout/Stack";
import { RhfSubmitButton } from "@connected-repo/ui-mui/rhf-form/RhfSubmitButton";
import { RhfTextField } from "@connected-repo/ui-mui/rhf-form/RhfTextField";
import { useRhfForm } from "@connected-repo/ui-mui/rhf-form/useRhfForm";
import { type LeadCreateInput, leadCreateInputZod } from "@connected-repo/zod-schemas/leads.zod";
import { useWorkerMutation } from "@frontend/hooks/useWorkerMutation";
import { UserAppBackendInputs } from "@frontend/utils/orpc.client";
import { zodResolver } from "@hookform/resolvers/zod";
import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router";
import { MediaCapture } from "./MediaCapture";
import { ulid } from "ulid";
import { dataWorkerClient } from "@frontend/worker/worker.client";
import { useTeam } from "@frontend/contexts/TeamContext";

interface CreateLeadFormProps {
	initialLeadId?: string;
	onComplete?: () => void;
}

export function CreateLeadForm({ initialLeadId, onComplete }: CreateLeadFormProps) {
	const [success, setSuccess] = useState("");
	const [uploads, setUploads] = useState<any[]>([]);
	const navigate = useNavigate();

	// Generate a stable leadId for this form session
	const leadId = useMemo(() => initialLeadId || ulid(), [initialLeadId]);

	// Create lead mutation via Worker
	const createMutation = useWorkerMutation<unknown, UserAppBackendInputs['leads']['create']>({
		entity: 'leads',
		operation: 'create',
		invalidateKeys: [
			['leads', 'getAll'],
			['pending', 'leads'],
		],
	});

	// Subscribe to upload status changes in worker
	useEffect(() => {
		const unsubscribe = dataWorkerClient.onPushEvent((ev) => {
			if (ev.type === 'push' && ev.event === 'table-changed' && ev.payload.table === 'uploads') {
				fetchUploads();
			}
		});

		const fetchUploads = async () => {
			const result = await dataWorkerClient.query<any[]>({
				entity: 'uploads',
				operation: 'getAll',
			});
			const leadUploads = result.data.filter(u => u.leadId === leadId);
			setUploads(leadUploads);
		};

		fetchUploads();
		return unsubscribe;
	}, [leadId]);

	const handleMediaCapture = async (media: { 
		type: 'image' | 'voice'; 
		file: File; 
		field: 'visitingCardFrontUrl' | 'visitingCardBackUrl' | 'voiceNoteUrl' 
	}) => {
		// Convert file to Data URL for worker
		const reader = new FileReader();
		reader.onloadend = async () => {
			const localUrl = reader.result as string;
			
			// Send to worker for upload tracking
			await dataWorkerClient.mutate({
				entity: 'uploads',
				operation: 'create',
				payload: {
					localUrl,
					fileType: media.file.type,
					fileName: media.file.name,
					leadId,
					field: media.field,
				}
			});
		};
		reader.readAsDataURL(media.file);
	};

	// Get current team context
	const { currentTeam } = useTeam();

	// Form setup with Zod validation and RHF
	const { formMethods, RhfFormProvider } = useRhfForm<LeadCreateInput>({
		onSubmit: async (data) => {
			// Link any successfully uploaded media
			const mediaUrls: any = {};
			uploads.forEach(u => {
				if (u.status === 'done' && u.remoteUrl) {
					mediaUrls[u.field] = u.remoteUrl;
				}
			});

			const submitData = {
				...data,
				...mediaUrls,
				leadId, // Use the pre-generated ULID
				createdAt: Date.now(),
				// inject active team context
				userTeamId: currentTeam?.userTeamId ?? null,
			};
			
			try {
				await createMutation.mutateAsync(submitData);
				setSuccess("Lead captured successfully!");
				formMethods.reset();
				setTimeout(() => {
					setSuccess("");
					if (onComplete) {
						onComplete();
					} else {
						navigate("/leads");
					}
				}, 2000);
			} catch (error) {
				console.error("[CreateLeadForm] mutateAsync failed:", error);
			}
		},
		formConfig: {
			resolver: zodResolver(leadCreateInputZod),
			defaultValues: {
				contactName: "",
				companyName: null,
				jobTitle: null,
				email: null,
				phone: null,
				website: null,
				address: null,
				notes: null,
				userTeamId: null, // Will be overridden on submit
			},
		},
	});

	return (
		<ContentCard>
			<RhfFormProvider>
				<Stack spacing={3}>
					<MediaCapture 
						onCapture={handleMediaCapture} 
						uploads={uploads} 
					/>

					<RhfTextField
						name="contactName"
						label="Full Name"
						placeholder="e.g. John Doe"
					/>
					
					<Box sx={{ display: 'flex', gap: 2, flexDirection: { xs: 'column', sm: 'row' } }}>
						<RhfTextField
							name="companyName"
							label="Company"
							placeholder="e.g. Acme Corp"
							sx={{ flex: 1 }}
						/>
						<RhfTextField
							name="jobTitle"
							label="Job Title"
							placeholder="e.g. Product Manager"
							sx={{ flex: 1 }}
						/>
					</Box>

					<Box sx={{ display: 'flex', gap: 2, flexDirection: { xs: 'column', sm: 'row' } }}>
						<RhfTextField
							name="email"
							label="Email Address"
							placeholder="john.doe@example.com"
							sx={{ flex: 1 }}
						/>
						<RhfTextField
							name="phone"
							label="Phone Number"
							placeholder="+1 234 567 890"
							sx={{ flex: 1 }}
						/>
					</Box>

					<RhfTextField
						name="website"
						label="Website"
						placeholder="https://example.com"
					/>

					<RhfTextField
						name="address"
						label="Address"
						multiline
						rows={2}
						placeholder="Business address"
					/>

					<RhfTextField
						name="notes"
						label="Notes"
						multiline
						rows={4}
						placeholder="Additional context about this lead..."
					/>

					<RhfSubmitButton
						notSubmittingText="Capture Lead"
						isSubmittingText="Capturing..."
						props={{
							variant: "contained",
							color: "primary",
							size: "large",
							fullWidth: true,
							sx: { py: 1.5, fontWeight: 700 }
						}}
					/>
				</Stack>
			</RhfFormProvider>

			<SuccessAlert message={success} />
		</ContentCard>
	);
}
