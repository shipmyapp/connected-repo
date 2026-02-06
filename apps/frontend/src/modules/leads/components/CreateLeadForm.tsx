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
import { useState } from "react";
import { useNavigate } from "react-router";

export function CreateLeadForm() {
	const [success, setSuccess] = useState("");
	const navigate = useNavigate();

	// Create lead mutation via Worker
	const createMutation = useWorkerMutation<unknown, UserAppBackendInputs['leads']['create']>({
		entity: 'leads',
		operation: 'create',
		invalidateKeys: [
			['leads', 'getAll'],
			['pending', 'leads'],
		],
	});

	// Form setup with Zod validation and RHF
	const { formMethods, RhfFormProvider } = useRhfForm<LeadCreateInput>({
		onSubmit: async (data) => {
			const submitData = {
				...data,
				createdAt: Date.now(),
			};
			
			try {
				await createMutation.mutateAsync(submitData);
				setSuccess("Lead captured successfully!");
				formMethods.reset();
				setTimeout(() => {
					setSuccess("");
					navigate("/leads");
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
				teamId: null,
			},
		},
	});

	return (
		<ContentCard>
			<RhfFormProvider>
				<Stack spacing={3}>
					<RhfTextField
						name="contactName"
						label="Full Name"
						placeholder="e.g. John Doe"
						required
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
