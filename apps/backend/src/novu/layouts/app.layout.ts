// Kept in step with the Novu dashboard (newer updatedAt wins at boot). Before editing this layout, run `yarn novu:status` (skill novu-pull); a hand edit sets updatedAt to now.
import type { CodeLayout } from "@backend/novu/code_layout";

export const appLayout: CodeLayout = {
	updatedAt: "2026-11-15T21:45:36.000Z",
	definition: () => ({
		layoutId: "app",
		name: "App",
		isTranslationEnabled: false,
		email: {
			body: `<!doctype html>
<html lang="en">
<head>
	<meta charset="utf-8">
	<meta name="viewport" content="width=device-width, initial-scale=1">
	<meta name="color-scheme" content="light">
	<meta name="supported-color-schemes" content="light">
</head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1f2328;">
	<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;">
		<tr><td align="center" style="padding:40px 16px;">
			{{content}}
			<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
				<tr><td align="center" style="padding:20px 8px 0;font-size:12px;line-height:18px;color:#59636e;">You're getting this at {{subscriber.email | escape}}.</td></tr>
			</table>
		</td></tr>
	</table>
</body>
</html>`,
			editorType: "html",
		},
	}),
};
