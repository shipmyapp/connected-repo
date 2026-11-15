import App from "@superadmin/App";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

const container = document.getElementById("root");
if (!container) throw new Error('Root element with id "root" not found');

createRoot(container).render(
	<StrictMode>
		<App />
	</StrictMode>,
);
