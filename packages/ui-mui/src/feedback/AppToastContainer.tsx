import { ToastContainer, type ToastContainerProps } from "react-toastify";
import { useThemeMode } from "../theme/ThemeContext";

/**
 * react-toastify's container in the app's resolved mode. Never pass the
 * theme setting itself: it can be "system", which Toastify has no theme
 * for, and toasts then drew white text on a white card (both
 * apps). The CSS import (`react-toastify/dist/ReactToastify.css`) stays in
 * each app's entry.
 */
export const AppToastContainer = (props: ToastContainerProps) => {
	const { actualMode } = useThemeMode();
	return (
		<ToastContainer
			position="top-right"
			autoClose={5000}
			closeOnClick
			pauseOnHover
			draggable
			{...props}
			theme={actualMode}
		/>
	);
};
