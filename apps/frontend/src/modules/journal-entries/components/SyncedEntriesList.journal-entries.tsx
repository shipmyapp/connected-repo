import { Typography } from "@connected-repo/ui-mui/data-display/Typography";
import { Box } from "@connected-repo/ui-mui/layout/Box";
import { Pagination } from "@connected-repo/ui-mui/navigation/Pagination";
import { Accordion, AccordionSummary, AccordionDetails } from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import RefreshIcon from "@mui/icons-material/Refresh";
import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { keyframes } from "@mui/material";
import { JournalEntryCardView } from "@frontend/components/JournalEntryCardView";
import { JournalEntryTableView } from "@frontend/components/JournalEntryTableView";
import { getAppProxy } from "@frontend/worker/app.proxy";
import { getSWProxy } from "@frontend/sw/proxy.sw";
import { useLocalDb } from "@frontend/worker/db/hooks/useLocalDb";
import { ViewMode } from "../pages/JournalEntries.page";
import { useConnectivity } from "@frontend/sw/sse/useConnectivity.sse.sw";
import { Tooltip } from "@mui/material";
import { useLocalDbValue } from "@frontend/worker/db/hooks/useLocalDbValue";

const spin = keyframes`
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
`;

const ITEMS_PER_PAGE = 12;

export function SyncedEntriesList({ viewMode }: { viewMode: ViewMode }) {
	const navigate = useNavigate();
	const [currentPage, setCurrentPage] = useState(1);
	const [isRefreshing, setIsRefreshing] = useState(false);
	const { isServerReachable, sseStatus } = useConnectivity();

	// Reactive data from local DB with pagination
	const { data: entries } = useLocalDb("journalEntries", () => 
		getAppProxy().journalEntriesDb.getPaginated((currentPage - 1) * ITEMS_PER_PAGE, ITEMS_PER_PAGE),
		[currentPage]
	);

	const { data: totalCount } = useLocalDbValue("journalEntries", () => getAppProxy().journalEntriesDb.count(), 0);

	const handleRefreshDeltas = async () => {
		if (!isServerReachable || isRefreshing || sseStatus === 'connecting' || sseStatus === 'connected') return;
		try {
			setIsRefreshing(true);
			const sw = await getSWProxy();
			await sw.refresh();
		} catch (err) {
			console.error("[SyncedEntriesList] Refresh failed:", err);
		} finally {
			setTimeout(() => setIsRefreshing(false), 2000);
		}
	};

	const isRefreshingState = isRefreshing || sseStatus === 'connecting' || sseStatus === 'connected';
	const canRefresh = isServerReachable && !isRefreshingState;

	const getRefreshTooltip = () => {
		if (!isServerReachable) return "Offline: Server unreachable";
		if (sseStatus === 'connecting') return "Connecting and syncing...";
		if (sseStatus === 'connected') return "Live sync active";
		if (isRefreshing) return "Refreshing data...";
		return "Refresh synced entries";
	};

	const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE);

	return (
		<Accordion disableGutters defaultExpanded sx={{ borderRadius: 2, overflow: 'hidden', border: '1px solid', borderColor: 'divider', boxShadow: 'none' }}>
			<AccordionSummary 
				expandIcon={<ExpandMoreIcon />}
				sx={{ 
					flexDirection: 'row-reverse',
					'& .MuiAccordionSummary-expandIconWrapper': { mr: 1 },
					'& .MuiAccordionSummary-content': { 
						display: 'flex', 
						justifyContent: 'space-between', 
						alignItems: 'center',
						width: '100%',
						m: '12px 0 !important'
					}
				}}
			>
				<Typography variant="h6" sx={{ fontWeight: 600 }}>Synced Entries ({totalCount})</Typography>
				
				<Tooltip title={getRefreshTooltip()}>
					<Box 
						component="span"
						onClick={(e) => { e.stopPropagation(); handleRefreshDeltas(); }}
						sx={{ 
							display: 'flex', 
							alignItems: 'center', 
							justifyContent: 'center',
							width: 32,
							height: 32,
							borderRadius: '50%',
							cursor: canRefresh ? 'pointer' : 'default',
							transition: 'all 0.2s',
							color: !canRefresh ? 'text.disabled' : 'inherit',
							'&:hover': canRefresh ? { bgcolor: 'action.hover' } : {},
							filter: !isServerReachable ? 'grayscale(1)' : 'none'
						}}
					>
						<RefreshIcon sx={{ fontSize: 18, animation: isRefreshingState ? `${spin} 1s linear infinite` : 'none' }} />
					</Box>
				</Tooltip>
			</AccordionSummary>
			<AccordionDetails>
				<Box>
					{viewMode === "card" ? (
						<JournalEntryCardView 
							entries={entries} 
							onEntryClick={(entryId) => navigate(`/journal-entries/synced/${entryId}`)}
						/>
					) : (
						<JournalEntryTableView 
							entries={entries as any} 
							onEntryClick={(entryId) => navigate(`/journal-entries/synced/${entryId}`)}
						/>
					)}
					{totalPages > 1 && (
						<Box sx={{ display: "flex", justifyContent: "center", mt: 5 }}>
							<Pagination
								count={totalPages}
								page={currentPage}
								onChange={(_e, page) => setCurrentPage(page)}
								color="primary"
								size="large"
								showFirstButton
								showLastButton
							/>
						</Box>
					)}
				</Box>
			</AccordionDetails>
		</Accordion>
	);
}
