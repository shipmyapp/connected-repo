import { auth } from "@backend/modules/auth/auth.config";
import { transformSessionAndUserData } from "@backend/utils/session.utils";
import { userCreateFixture } from "@connected-repo/zod-schemas/user.fixture";
import type { UserCreateInput } from "@connected-repo/zod-schemas/user.zod";

interface UserLoginCredentials {
	email: string;
	password: string;
}

const userLogin = async (loginCredentials: UserLoginCredentials) => {
	const response = await auth.api.signInEmail({
		body: loginCredentials,
		asResponse: true, // This gives us the raw response with Set-Cookie headers
	});

	const reqHeaders = new Headers({
		Cookie: response.headers.getSetCookie().join("; "),
	});

	const sessionData = await auth.api.getSession({
		headers: reqHeaders,
	});

	if (!sessionData) {
		throw new Error("Login Failed");
	}

	const { session, user } = transformSessionAndUserData(sessionData);

	// rpcProtectedActiveTeamProcedure demands `x-team-id` matches the user's
	// active team. Users get a personal team via UserTable.afterCreate, so
	// activeTeamAppId is populated by the time login completes.
	if (user.activeTeamAppId) {
		reqHeaders.set("x-team-id", user.activeTeamAppId);
	}

	return {
		reqHeaders,
		session,
		user,
	};
};
export const createUserAndLogin = async (
	userInput: Partial<UserCreateInput> = {},
) => {
	const password = "password123";
	const fixture = userCreateFixture(userInput);
	const email = fixture.email ?? "test@example.com";
	const { user } = await auth.api.signUpEmail({
		body: {
			...fixture,
			email,
			password,
			image: fixture.image ?? undefined,
			journalReminderTimes: ["08:00", "21:00"],
		},
	});

	// 2. Sign in to get the session headers
	if (!user.email) throw new Error("Email is required for login in tests");
	return userLogin({
		email: user.email,
		password,
	});
};
