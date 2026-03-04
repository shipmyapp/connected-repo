import { db } from '@backend/db/db';
import { rpcPublicProcedure } from '@backend/procedures/public.procedure';
import { batchInsertOfflineErrorsZod } from '@connected-repo/zod-schemas/offline_errors.zod';
import { auth } from '@backend/modules/auth/auth.config';
import { transformSessionAndUserData } from '@backend/utils/session.utils';

const batchInsert = rpcPublicProcedure
	.route({ method: 'POST', path: '/errors' })
	.input(batchInsertOfflineErrorsZod)
	.handler(async ({ input, context }) => {
		if (!input?.length) {
			return { success: true };
		}

		let activeUserId: string | undefined = undefined;
		let activeUserEmail: string | undefined = undefined;
		let userAgent: string = context.reqHeaders.get('User-Agent') || '';

		try {
			// Safely attempt to verify token on public route without throwing
			const sessionData = await auth.api.getSession({
				headers: context.reqHeaders,
			});

			if (sessionData?.user) {
				activeUserId = sessionData.user.id;
				activeUserEmail = sessionData.user.email;
			}
		} catch (e) {
			// Swallow auth errors for telemetry context extraction
		}

		// Inject server-trusted IDs if they exist and aren't provided by client
		const enrichedInput = input.map((err) => ({
			...err,
			clientId: err.clientId || activeUserId,
			userEmail: err.userEmail || activeUserEmail,
			userAgent,
		}));

		// Insert directly into the db
		await db.offlineErrors.insertMany(enrichedInput);

		return { success: true };
	});

export const offlineErrorsRouter = {
	batchInsert,
};
