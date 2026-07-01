import { writeFile } from "node:fs/promises";
import { userAppRouter } from "@backend/routers/user_app/user_app.router";
import { OpenAPIGenerator } from "@orpc/openapi";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";

async function generateOpenApi() {
	const generator = new OpenAPIGenerator({
		schemaConverters: [new ZodToJsonSchemaConverter()],
	});

	// Generate Mobile App Documentation (matching mobile_app.handler.ts settings)
	const spec = await generator.generate(userAppRouter, {
		info: {
			title: "Mobile App API Documentation",
			version: "1.0.0",
			description: "OpenAPI documentation for the mobile application",
		},
		servers: [{ url: "/mobile-app" }],
		components: {
			securitySchemes: {
				bearerAuth: {
					type: "http",
					scheme: "bearer",
					bearerFormat: "JWT",
					description:
						"Better Auth bearer token used by mobile-authenticated routes.",
				},
				sessionCookie: {
					type: "apiKey",
					in: "cookie",
					name: "__Secure-better-auth.session_token",
					description:
						"Better Auth session cookie used by user-authenticated routes.",
				},
			},
		},
		security: [
			{
				bearerAuth: [],
			},
			{
				sessionCookie: [],
			},
		],
	});

	await writeFile("openapi_pretty.json", JSON.stringify(spec, null, 2));

	console.log("Generated openapi_pretty.json");
}

generateOpenApi().catch((error) => {
	console.error("Failed to generate OpenAPI files");
	console.error(error);
	process.exit(1);
});
