import { db } from "@backend/db/db";
import { getClientIpAddress } from "@backend/utils/client-info.utils";
import { OpenapiRequestInput } from "@connected-repo/zod-schemas/api_product_request_log.zod";

/**
 * Create Request Log
 * Creates a request log entry in the database
 */
export const createRequestLog = async (
	input: OpenapiRequestInput,
	reqHeaders: Headers,
	path: string,
	teamApiId: string,
) => {
	return await db.apiProductRequestLogs.create({
		teamApiId: teamApiId,
		teamUserReferenceId: input.teamUserReferenceId,
		method: "POST",
		path,
		ip: getClientIpAddress(reqHeaders),
		requestBodyJson: input,
		responseJson: null,
		responseText: null,
		responseTime: 0,
		status: "Pending",
	});
};