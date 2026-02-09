import { Typography } from "@connected-repo/ui-mui/data-display/Typography";
import { Box } from "@connected-repo/ui-mui/layout/Box";
import { Pagination } from "@connected-repo/ui-mui/navigation/Pagination";
import { Collapse, IconButton, Tooltip, keyframes } from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import RefreshIcon from "@mui/icons-material/Refresh";
import FileDownloadIcon from "@mui/icons-material/FileDownload";
import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdf";
import React, { useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "react-toastify";
import { JournalEntryCardView } from "@frontend/components/JournalEntryCardView";
import { JournalEntryTableView } from "@frontend/components/JournalEntryTableView";
import { getDataProxy, getMediaProxy } from "@frontend/worker/worker.proxy";
import { getSWProxy } from "@frontend/sw/proxy.sw";
import { useLocalDb } from "@frontend/worker/db/hooks/useLocalDb";
import { ViewMode } from "../pages/JournalEntries.page";
import { useConnectivity } from "@frontend/sw/sse/useConnectivity.sse.sw";
import { useLocalDbValue } from "@frontend/worker/db/hooks/useLocalDbValue";
import { Stack } from "@connected-repo/ui-mui/layout/Stack";
import { useActiveTeamId } from "@frontend/contexts/WorkspaceContext";

const spin = keyframes`
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
`;

const ITEMS_PER_PAGE = 12;

export function SyncedEntriesList({ viewMode }: { viewMode: ViewMode }) {
	const teamId = useActiveTeamId();
	const navigate = useNavigate();
	const [currentPage, setCurrentPage] = useState(1);
	const [isRefreshing, setIsRefreshing] = useState(false);
	const [isExporting, setIsExporting] = useState<boolean>(false);
	const [isExpanded, setIsExpanded] = useState(true);
	const { isServerReachable, sseStatus } = useConnectivity();

	// Reactive data from local DB with pagination
	const { data: entries = [] } = useLocalDb("journalEntries", () => 
		getDataProxy().journalEntriesDb.getPaginated((currentPage - 1) * ITEMS_PER_PAGE, ITEMS_PER_PAGE, teamId),
		[currentPage, teamId]
	);

	const { data: totalCount = 0 } = useLocalDbValue("journalEntries", () => getDataProxy().journalEntriesDb.count(teamId), 0, [teamId]);

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

	const handleExport = async (format: 'csv' | 'pdf') => {
		if (isExporting) return;
		const toastId = toast.info(`Preparing ${format.toUpperCase()} export...`, { autoClose: false });
		
		try {
			setIsExporting(true);
			const allEntries = await getDataProxy().journalEntriesDb.getAll(teamId);
			
			if (allEntries.length === 0) {
				toast.update(toastId, { render: "No entries to export", type: 'warning', autoClose: 3000 });
				setIsExporting(false);
				return;
			}

			const mediaProxy = getMediaProxy();
			
			let blob: Blob;
			if (format === 'csv') {
				blob = await mediaProxy.export.generateCSV(allEntries);
			} else {
				blob = await mediaProxy.export.generatePDF(allEntries);
			}
			
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = `journal_entries_${new Date().toISOString().split('T')[0]}.${format}`;
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
			URL.revokeObjectURL(url);
			
			toast.update(toastId, { render: `${format.toUpperCase()} Exported successfully`, type: 'success', autoClose: 3000 });
		} catch (err) {
			console.error("[SyncedEntriesList] Export failed:", err);
			toast.update(toastId, { 
				render: `Failed to generate ${format.toUpperCase()}. Please check console for details.`, 
				type: 'error', 
				autoClose: 5000 
			});
		} finally {
			setIsExporting(false);
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
		<Box sx={{ width: '100%' }}>
			<Box 
				sx={{ 
					display: 'flex', 
					justifyContent: 'space-between', 
					alignItems: 'center',
					width: '100%',
					mb: 1,
					cursor: 'pointer',
					userSelect: 'none',
					'&:hover .MuiIconButton-root': {
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
					<Typography variant="h5" sx={{ fontWeight: 700, letterSpacing: '-0.01em' }}>
						Synced Entries
						<Box component="span" sx={{ ml: 1.5, color: 'text.secondary', fontWeight: 500, fontSize: '0.9rem' }}>
							({totalCount})
						</Box>
					</Typography>
				</Stack>
				
				<Stack direction="row" spacing={0.5} alignItems="center">
					<Tooltip title={isExporting ? "Exporting..." : "Export to CSV"}>
						<span>
							<IconButton 
								size="small"
								onClick={(e) => { e.stopPropagation(); handleExport('csv'); }}
								disabled={isExporting}
								sx={{ '&:hover': { bgcolor: 'action.hover' } }}
							>
								<FileDownloadIcon sx={{ fontSize: 20 }} />
							</IconButton>
						</span>
					</Tooltip>

					<Tooltip title={isExporting ? "Exporting..." : "Export to PDF"}>
						<span>
							<IconButton 
								size="small"
								onClick={(e) => { e.stopPropagation(); handleExport('pdf'); }}
								disabled={isExporting}
								sx={{ '&:hover': { bgcolor: 'action.hover' } }}
							>
								<PictureAsPdfIcon sx={{ fontSize: 20, color: isExporting ? 'text.disabled' : 'primary.main' }} />
							</IconButton>
						</span>
					</Tooltip>

					<Tooltip title={getRefreshTooltip()}>
						<IconButton 
							size="small"
							onClick={(e) => { e.stopPropagation(); handleRefreshDeltas(); }}
							disabled={!canRefresh}
							sx={{ 
								transition: 'all 0.2s',
								color: !canRefresh ? 'text.disabled' : 'inherit',
								'&:hover': { bgcolor: 'action.hover' },
								filter: !isServerReachable ? 'grayscale(1)' : 'none'
							}}
						>
							<RefreshIcon sx={{ fontSize: 20, animation: isRefreshingState ? `${spin} 1s linear infinite` : 'none' }} />
						</IconButton>
					</Tooltip>
				</Stack>
			</Box>

			<Collapse in={isExpanded} timeout="auto" unmountOnExit>
				<Box sx={{ pt: 1 }}>
					{viewMode === "card" ? (
						<JournalEntryCardView 
							entries={entries} 
							onEntryClick={(entryId: string) => navigate(`/journal-entries/synced/${entryId}`)}
						/>
					) : (
						<JournalEntryTableView 
							entries={entries as any} 
							onEntryClick={(entryId: string) => navigate(`/journal-entries/synced/${entryId}`)}
						/>
					)}
					{totalPages > 1 && (
						<Box sx={{ display: "flex", justifyContent: "center", mt: 6, mb: 2 }}>
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
			</Collapse>
		</Box>
	);
}
