import { useEffect, useRef, useState } from "react";

const MARK = "appOverlay";
/** Long enough for a navigation started by the same close to have written its entry. */
const SETTLE_MS = 150;

let nextEntry = 1;

/** Whether the current history entry is this flow's own (not a later flow's, nor one the router wrote over it). */
const isEntry = (entry: number) =>
	(window.history.state as Record<string, unknown> | null)?.[MARK] === entry;

/**
 * Back closes a flow that has no address of its own: while `isOpen`, one history
 * entry stands for it, so the app's Back, the browser's and a phone's own
 * all call `onBack` instead of leaving the page underneath. Closing the
 * flow any other way takes that entry back out. If `onBack` keeps the flow
 * open (a "discard changes?" answered no), the entry is put back.
 */
export function useBackCloses(isOpen: boolean, onBack: () => void) {
	const onBackRef = useRef(onBack);
	onBackRef.current = onBack;
	const isPushed = useRef(false);
	const entry = useRef(0);
	const isMounted = useRef(true);
	const [generation, setGeneration] = useState(0);

	// A sheet that closes by unmounting (open while mounted) takes its entry out too, once it is
	// really gone: a remount in the same moment (React's development double run) keeps it.
	useEffect(() => {
		isMounted.current = true;
		return () => {
			isMounted.current = false;
			if (!isPushed.current) return;
			const closing = entry.current;
			window.setTimeout(() => {
				if (isMounted.current) return;
				isPushed.current = false;
				if (isEntry(closing)) window.history.back();
			}, SETTLE_MS);
		};
	}, []);

	// `generation` is a dependency on purpose: a new generation re-arms the entry after a Back the flow survived.
	useEffect(() => {
		if (!isOpen) {
			if (isPushed.current) {
				isPushed.current = false;
				// Only this flow's own entry is taken out, once the router has settled: a flow that ended by moving on
				// (a save that opens the saved item in its place) keeps its new place, and a flow opened since keeps its own.
				const closing = entry.current;
				window.setTimeout(() => {
					if (isEntry(closing)) window.history.back();
				}, SETTLE_MS);
			}
			return;
		}
		if (!isPushed.current) {
			entry.current = nextEntry++;
			window.history.pushState(
				{ ...(window.history.state as object | null), [MARK]: entry.current },
				"",
			);
			isPushed.current = true;
		}
		const handlePop = () => {
			if (!isPushed.current) return;
			// Back to this flow's own entry is a flow opened over it closing, not this one.
			if (isEntry(entry.current)) return;
			isPushed.current = false;
			onBackRef.current();
			setGeneration(generation + 1);
		};
		window.addEventListener("popstate", handlePop);
		return () => window.removeEventListener("popstate", handlePop);
	}, [isOpen, generation]);
}
