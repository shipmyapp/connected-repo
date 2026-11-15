import { Component, type ErrorInfo, type ReactNode } from "react";

interface AppErrorBoundaryProps {
	children: ReactNode;
	/** Report the crash (the app passes a lazy Sentry capture). */
	onError?: (error: Error, info: ErrorInfo) => void;
}

/**
 * The last net above the router (route errors have their own page). It does
 * not call `useRouteError()`: outside the router that throws, which is how
 * the starter's top-level fallback used to crash on the crash it was
 * meant to show. Plain markup, so it renders even if the theme is what broke.
 */
export class AppErrorBoundary extends Component<AppErrorBoundaryProps, { hasError: boolean }> {
	state = { hasError: false };

	static getDerivedStateFromError() {
		return { hasError: true };
	}

	componentDidCatch(error: Error, info: ErrorInfo) {
		this.props.onError?.(error, info);
	}

	render() {
		if (!this.state.hasError) return this.props.children;
		return (
			<div
				role="alert"
				style={{
					display: "grid",
					placeItems: "center",
					minHeight: "100vh",
					padding: 24,
					fontFamily: "system-ui, sans-serif",
					textAlign: "center",
				}}
			>
				<div>
					<p style={{ fontSize: 18, fontWeight: 600, margin: "0 0 8px" }}>Something went wrong.</p>
					<button
						type="button"
						onClick={() => window.location.reload()}
						style={{
							minHeight: 44,
							padding: "0 20px",
							borderRadius: 999,
							border: "1px solid currentColor",
							background: "none",
							font: "inherit",
							cursor: "pointer",
						}}
					>
						Reload
					</button>
				</div>
			</div>
		);
	}
}
