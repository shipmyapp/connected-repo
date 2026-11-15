import { LoginPage } from "@frontend/modules/auth/pages/Login.page";
import NoAccessPage from "@frontend/tenant/pages/NoAccess.page";
import { Navigate, Route, Routes, useSearchParams } from "react-router";

const AuthErrorRedirect = () => {
	const [searchParams] = useSearchParams();
	const error = searchParams.get("error");

	// Redirect to login page with error parameter
	return <Navigate to={`/auth/login?error=${error || "unknown_error"}`} replace />;
};

const AuthRouter = () => {
	return (
		<Routes>
			<Route path="/">
				<Route index element={<Navigate to="/auth/login" />} />
				<Route path="login" element={<LoginPage />} />
				<Route path="no-access" element={<NoAccessPage />} />
				<Route path="error" element={<AuthErrorRedirect />} />
			</Route>
		</Routes>
	);
};

export default AuthRouter;
