import { Typography } from "@connected-repo/ui-mui/data-display/Typography";
import { Box } from "@connected-repo/ui-mui/layout/Box";
import { Stack } from "@connected-repo/ui-mui/layout/Stack";
import { Tooltip, Accordion, AccordionSummary, AccordionDetails, keyframes } from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import CloudUploadIcon from "@mui/icons-material/CloudUpload";
import SyncIcon from "@mui/icons-material/Sync";
import ErrorIcon from "@mui/icons-material/Error";
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { JournalEntryCardView } from "@frontend/components/JournalEntryCardView";
import { JournalEntryTableView } from "@frontend/components/JournalEntryTableView";
import { Pagination } from "@connected-repo/ui-mui/navigation/Pagination";
import { getAppProxy } from "@frontend/worker/app.proxy";
import { useLocalDb } from "@frontend/worker/db/hooks/useLocalDb";
import { ViewMode } from "../pages/JournalEntries.page";
import { useConnectivity } from "@frontend/sw/sse/useConnectivity.sse.sw";
import { useLocalDbValue } from "@frontend/worker/db/hooks/useLocalDbValue";

const bounce = keyframes`
  0%, 20%, 50%, 80%, 100% {transform: translateY(0);}
  40% {transform: translateY(-10px);}
  60% {transform: translateY(-5px);}
`;

const spin = keyframes`
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
`;

const ITEMS_PER_PAGE = 12;

export function PendingSyncList({ viewMode }: { viewMode: ViewMode }) {
	const navigate = useNavigate();
	const [isSyncing, setIsSyncing] = useState(false);
	const [currentPage, setCurrentPage] = useState(1);
	const { isServerReachable } = useConnectivity();
	
	// Reactive data from local DB with pagination
	const { data: entries } = useLocalDb("pendingSyncJournalEntries", () => 
		getAppProxy().pendingSyncJournalEntriesDb.getPaginated((currentPage - 1) * ITEMS_PER_PAGE, ITEMS_PER_PAGE),
		[currentPage]
	);

	const { data: totalCount } = useLocalDbValue("pendingSyncJournalEntries", () => getAppProxy().pendingSyncJournalEntriesDb.count(), 0);

	// Monitor sync processing status
	useEffect(() => {
		const app = getAppProxy();
		let interval: any;
		
		const checkStatus = async () => {
			const status = await app.sync.getProcessingStatus();
			setIsSyncing(status);
		};

		checkStatus();
		interval = setInterval(checkStatus, 1000);
		return () => clearInterval(interval);
	}, []);

	const handleManualSync = async () => {
		if (!isServerReachable || isSyncing || totalCount === 0) return;
		try {
			setIsSyncing(true);
			await getAppProxy().sync.processQueue(true);
		} catch (err) {
			console.error("[PendingSyncList] Manual sync failed:", err);
		} finally {
			setIsSyncing(false);
		}
	};

	const canSync = isServerReachable && !isSyncing && totalCount > 0;
	
	const getSyncTooltip = () => {
		if (!isServerReachable) return "Offline: Server unreachable";
		if (isSyncing) return "Syncing in progress...";
		if (totalCount === 0) return "No pending entries to sync";
		return "Sync pending entries now";
	};

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
				<Stack direction="row" spacing={1} alignItems="center">
					<Typography variant="h6" sx={{ fontWeight: 600 }}>Pending Sync ({totalCount})</Typography>
					{isSyncing && <Typography variant="caption" sx={{ fontStyle: 'italic', color: 'text.secondary' }}>Syncing now...</Typography>}
				</Stack>
				
				<Tooltip title={getSyncTooltip()}>
					<Box 
						component="span"
						onClick={(e) => { e.stopPropagation(); handleManualSync(); }}
						sx={{ 
							display: 'flex', 
							alignItems: 'center', 
							justifyContent: 'center',
							width: 32,
							height: 32,
							borderRadius: '50%',
							cursor: canSync ? 'pointer' : 'default',
							transition: 'all 0.2s',
							bgcolor: 'background.paper',
							boxShadow: 1,
							color: !canSync ? 'text.disabled' : 'primary.main',
							'&:hover': canSync ? { bgcolor: 'primary.light', color: 'white' } : {},
							animation: isSyncing ? `${bounce} 2s infinite` : 'none',
							opacity: !canSync && totalCount === 0 ? 0.5 : 1,
							filter: !isServerReachable ? 'grayscale(1)' : 'none'
						}}
					>
						{isSyncing ? <SyncIcon sx={{ fontSize: 18, animation: `${spin} 2s linear infinite` }} /> : <CloudUploadIcon sx={{ fontSize: 18 }} />}
					</Box>
				</Tooltip>
			</AccordionSummary>
			<AccordionDetails>
				{entries.length === 0 ? (
					<Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic', textAlign: 'center', py: 2 }}>
						No pending entries
					</Typography>
				) : (
					<Box sx={{ opacity: isSyncing ? 0.7 : 1, transition: 'opacity 0.3s' }}>
						{viewMode === "card" ? (
							<JournalEntryCardView 
								entries={entries} 
								onEntryClick={(entryId) => navigate(`/journal-entries/pending-sync/${entryId}`)}
								renderExtra={(entry: any) => (
									(entry.status === 'file-upload-failed' || entry.status === 'sync-failed') && (
										<Tooltip title={entry.error || "Sync failed"}>
											<Box sx={{ 
												display: 'flex', 
												alignItems: 'center', 
												justifyContent: 'center',
												bgcolor: 'error.main', 
												color: 'white',
												width: 24,
												height: 24,
												borderRadius: '50%',
												boxShadow: 1,
											}}>
												<ErrorIcon sx={{ fontSize: 16 }} />
											</Box>
										</Tooltip>
									)
								)}
							/>
						) : (
							<JournalEntryTableView 
								entries={entries as any} 
								onEntryClick={(entryId) => navigate(`/journal-entries/pending-sync/${entryId}`)} 
							/>
						)}
						{totalCount > ITEMS_PER_PAGE && (
							<Box sx={{ display: "flex", justifyContent: "center", mt: 4 }}>
								<Pagination
									count={Math.ceil(totalCount / ITEMS_PER_PAGE)}
									page={currentPage}
									onChange={(_e, page) => setCurrentPage(page)}
									color="primary"
									size="small"
								/>
							</Box>
						)}
					</Box>
				)}
			</AccordionDetails>
		</Accordion>
	);
}