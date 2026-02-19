import type { SxProps, Theme } from "@mui/material/styles";
import { Controller, useFormContext } from "react-hook-form";
import { TextField, type TextFieldProps } from "../form/TextField";
import { Box } from "../layout/Box";
import { CharacterCounter } from "../components/CharacterCounter";

export interface RhfTextFieldProps extends Omit<TextFieldProps, "name"> {
	name: string;
	sx?: SxProps<Theme>;
	showCharacterCount?: boolean;
	maxCharacters?: number;
	warningThreshold?: number;
}

export const RhfTextField = ({
	name,
	sx,
	showCharacterCount = false,
	maxCharacters,
	warningThreshold,
	...props
}: RhfTextFieldProps) => {
	const { control } = useFormContext();

	return (
		<Controller
			name={name}
			control={control}
			render={({ field, fieldState: { error } }) => {
				const currentLength = String(field.value ?? "").length;

				return (
					<Box sx={{ position: "relative", width: "100%" }}>
						<TextField
							{...field}
							{...props}
							fullWidth
							error={!!error}
							helperText={error?.message || props.helperText}
							sx={{
								// Base styling
								mb: { xs: 2, md: 2.5 },
								"& .MuiInputBase-input": {
									fontSize: { xs: "16px", md: "14px" }, // Prevent iOS zoom on focus
								},
								// Custom styling override
								...sx,
							}}
							value={field.value ?? ""}
						/>

						{/* Character Counter */}
						{showCharacterCount && maxCharacters && (
							<Box
								sx={{
									display: "flex",
									justifyContent: "flex-end",
									mt: 0.5,
									px: 1.5,
								}}
							>
								<CharacterCounter
									current={currentLength}
									max={maxCharacters}
									warningThreshold={warningThreshold}
								/>
							</Box>
						)}
					</Box>
				);
			}}
		/>
	);
};
