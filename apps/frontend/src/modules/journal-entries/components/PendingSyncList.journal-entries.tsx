import { Typography } from "@connected-repo/ui-mui/data-display/Typography";
import { Box } from "@connected-repo/ui-mui/layout/Box";
import { Stack } from "@connected-repo/ui-mui/layout/Stack";
import { Tooltip, Collapse, keyframes, IconButton } from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import CloudUploadIcon from "@mui/icons-material/CloudUpload";
import SyncIcon from "@mui/icons-material/Sync";
import ErrorIcon from "@mui/icons-material/Error";
import { useState, useEffect } from "react";
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
	const [isExpanded, setIsExpanded] = useState(true);
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
		<Box sx={{ width: '100%', mb: totalCount > 0 ? 4 : 0 }}>
			<Box 
				sx={{ 
					display: 'flex', 
					justifyContent: 'space-between', 
					alignItems: 'center',
					width: '100%',
					mb: 1,
					cursor: 'pointer',
					userSelect: 'none',
					'&:hover .MuiIconButton-root:first-of-type': {
						bgcolor: 'action.hover'
					}
				}}
				onClick={() => setIsExpanded(!isExpanded)}
			>
				<Stack direction="row" spacing={1.5} alignItems="center">
					<IconButton 
						size="small" 
						sx={{ 
							transform: isExpanded ? 'rotate(0deg)' : 'rotate(-90deg)',
							transition: 'transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
							bgcolor: 'transparent'
						}}
					>
						<ExpandMoreIcon fontSize="small" />
					</IconButton>
					<Stack direction="row" spacing={1} alignItems="baseline">
						<Typography variant="h5" sx={{ fontWeight: 700, letterSpacing: '-0.01em' }}>
							Pending Sync
							<Box component="span" sx={{ ml: 1.5, color: 'text.secondary', fontWeight: 500, fontSize: '0.9rem' }}>
								({totalCount})
							</Box>
						</Typography>
						{isSyncing && (
							<Typography variant="caption" sx={{ fontStyle: 'italic', color: 'primary.main', fontWeight: 500, ml: 1 }}>
								Syncing...
							</Typography>
						)}
					</Stack>
				</Stack>
				
				<Tooltip title={getSyncTooltip()}>
					<IconButton 
						size="small"
						onClick={(e) => { e.stopPropagation(); handleManualSync(); }}
						disabled={!canSync && totalCount === 0}
						sx={{ 
							transition: 'all 0.2s',
							color: !canSync ? 'text.disabled' : 'primary.main',
							'&:hover': canSync ? { bgcolor: 'primary.main', color: 'white' } : {},
							animation: isSyncing ? `${bounce} 2s infinite` : 'none',
							filter: !isServerReachable ? 'grayscale(1)' : 'none'
						}}
					>
						{isSyncing ? <SyncIcon sx={{ fontSize: 18, animation: `${spin} 2s linear infinite` }} /> : <CloudUploadIcon sx={{ fontSize: 18 }} />}
					</IconButton>
				</Tooltip>
			</Box>

			<Collapse in={isExpanded} timeout="auto" unmountOnExit>
				<Box sx={{ pt: 1 }}>
					{totalCount === 0 ? (
						<Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic', py: 1, px: 5.5, opacity: 0.8 }}>
							No pending entries
						</Typography>
					) : (
						<Box sx={{ opacity: isSyncing ? 0.7 : 1, transition: 'opacity 0.3s' }}>
							{viewMode === "card" ? (
								<JournalEntryCardView 
									entries={entries} 
									onEntryClick={(entryId: string) => navigate(`/journal-entries/pending-sync/${entryId}`)}
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
									onEntryClick={(entryId: string) => navigate(`/journal-entries/pending-sync/${entryId}`)} 
								/>
							)}
							{totalCount > ITEMS_PER_PAGE && (
								<Box sx={{ display: "flex", justifyContent: "center", mt: 6, mb: 2 }}>
									<Pagination
										count={Math.ceil(totalCount / ITEMS_PER_PAGE)}
										page={currentPage}
										onChange={(_e, page) => setCurrentPage(page)}
										color="primary"
										size="large"
									/>
								</Box>
							)}
						</Box>
					)}
				</Box>
			</Collapse>
		</Box>
	);
}