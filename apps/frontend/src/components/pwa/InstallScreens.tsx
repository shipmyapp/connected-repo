import { INSTALL_PICTURES } from "@connected-repo/zod-schemas/install_pictures";
import { currentInstallFormFactor, type InstallFormFactor } from "@frontend/lib/device/device-env";
import { styled } from "@mui/material/styles";
import { useState } from "react";
import { INSTALL_COPY } from "./install.copy";

/** A row of pictures that scrolls sideways and stops on each one. */
const Strip = styled("div")(({ theme }) => ({
	display: "flex",
	gap: 10,
	overflowX: "auto",
	scrollSnapType: "x mandatory",
	scrollbarWidth: "none",
	"&::-webkit-scrollbar": { display: "none" },
	borderRadius: 16,
	"& img": {
		flex: "none",
		height: 240,
		width: "auto",
		borderRadius: 14,
		scrollSnapAlign: "start",
		backgroundColor: theme.palette.action.hover,
	},
	"&[data-form-factor='TABLET'] img, &[data-form-factor='COMPUTER'] img": { height: 190 },
}));

/**
 * What installing gives, in the install pictures (pictures that say how
 * the app helps, not bare app screens): the
 * narrow ones on a phone, the wide ones on a tablet or computer. The same
 * pictures the install dialog's gallery and Chrome's richer dialog show.
 */
export function InstallScreens({ formFactor: forced }: { formFactor?: InstallFormFactor }) {
	const [formFactor] = useState<InstallFormFactor>(() => forced ?? currentInstallFormFactor());
	const pictures = INSTALL_PICTURES.filter(
		(picture) => picture.form_factor === (formFactor === "PHONE" ? "narrow" : "wide"),
	);
	return (
		<Strip role="group" aria-label={INSTALL_COPY.screensLabel} data-form-factor={formFactor}>
			{pictures.map((picture, index) => {
				const [width, height] = picture.sizes.split("x").map(Number);
				return (
					<img
						key={picture.src}
						src={picture.src}
						alt={picture.label}
						width={width}
						height={height}
						loading={index < 2 ? "eager" : "lazy"}
						decoding="async"
					/>
				);
			})}
		</Strip>
	);
}
