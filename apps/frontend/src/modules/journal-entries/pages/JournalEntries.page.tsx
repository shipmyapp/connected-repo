import { ErrorAlert } from "@connected-repo/ui-mui/components/ErrorAlert";
import { LoadingSpinner } from "@connected-repo/ui-mui/components/LoadingSpinner";
import { Typography } from "@connected-repo/ui-mui/data-display/Typography";
import { ToggleButton } from "@connected-repo/ui-mui/form/ToggleButton";
import { ToggleButtonGroup } from "@connected-repo/ui-mui/form/ToggleButtonGroup";
import { GridViewIcon } from "@connected-repo/ui-mui/icons/GridViewIcon";
import { TableRowsIcon } from "@connected-repo/ui-mui/icons/TableRowsIcon";
import { Box } from "@connected-repo/ui-mui/layout/Box";
import { Container } from "@connected-repo/ui-mui/layout/Container";
import { Pagination } from "@connected-repo/ui-mui/navigation/Pagination";
import { SyncProgress } from "@frontend/components/SyncProgress";
import { usePendingEntries } from "@frontend/hooks/usePendingEntries";
import { useWorkerQuery } from "@frontend/hooks/useWorkerQuery";
import { useWorkerEvent } from "@frontend/hooks/useWorkerStatus";
import { JournalEntriesEmptyState } from "@frontend/modules/journal-entries/components/JournalEntriesEmptyState";
import { JournalEntryCardView } from "@frontend/modules/journal-entries/components/JournalEntryCardView";
import { JournalEntryTableView, type JournalEntry } from "@frontend/modules/journal-entries/components/JournalEntryTableView";
import { UserAppBackendOutputs } from "@frontend/utils/orpc.client";
import { queryClient } from "@frontend/utils/queryClient";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import RefreshIcon from "@mui/icons-material/Refresh";
import { Collapse, IconButton, Tooltip, useMediaQuery, useTheme } from "@mui/material";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";

const ITEMS_PER_PAGE = 12;

type ViewMode = "card" | "table";

export default function JournalEntriesPage() {
	const navigate = useNavigate();
	const theme = useTheme();
	const isMobile = useMediaQuery(theme.breakpoints.down("md"));
	const [viewMode, setViewMode] = useState<ViewMode>("card");
	const [currentPage, setCurrentPage] = useState(1);
	const [pendingExpanded, setPendingExpanded] = useState(true);
	const [syncedExpanded, setSyncedExpanded] = useState(true);

	const { 
		data: journalEntriesResult, 
		isLoading, 
		error,
		refetch: refetchEntries
	} = useWorkerQuery<UserAppBackendOutputs['journalEntries']['getAll']>({
		entity: 'journalEntries',
		operation: 'getAll',
		sortBy: 'createdAt',
		descending: true,
		limit: ITEMS_PER_PAGE,
		offset: (currentPage - 1) * ITEMS_PER_PAGE,
	});

	const { data: pendingEntriesResult, refetch: refetchPending } = usePendingEntries<JournalEntry>({
		entity: 'journalEntries',
		sortBy: 'createdAt',
		descending: true,
	});

	const journalEntries = journalEntriesResult?.data || [];
	const pendingEntries = pendingEntriesResult?.data || [];
	const totalSyncedEntries = journalEntriesResult?.meta?.total || 0;

	// Auto-refresh when sync completes without re-rendering the whole page for every event
	useWorkerEvent('sync-complete', () => {
		queryClient.invalidateQueries({ queryKey: [['journalEntries', 'getAll']] });
		queryClient.invalidateQueries({ queryKey: [['pending', 'journalEntries']] });
	});

	const handleViewModeChange = (_event: React.MouseEvent<HTMLElement>, newMode: ViewMode | null) => {
		if (newMode !== null) {
			setViewMode(newMode);
			setCurrentPage(1);
		}
	};

	const handleEntryClick = (entryId: string) => {
		navigate(`/journal-entries/${entryId}`);
	};

	const totalPages = useMemo(() => {
		return Math.ceil(totalSyncedEntries / ITEMS_PER_PAGE);
	}, [totalSyncedEntries]);

	if (isLoading) return <LoadingSpinner text="Loading journal entries..." />;

	if (error) {
		const errorMessage = `${error.name} - ${error.message}`;
		return (
			<Container maxWidth="lg" sx={{ py: 4 }}>
				<ErrorAlert message={`Error loading journal entries: ${errorMessage}`} />
			</Container>
		);
	}

	return (
		<Container maxWidth="xl" sx={{ py: { xs: 3, md: 5 } }}>
			{/* Header Section */}
			<Box
				sx={{
					mb: 4,
					display: "flex",
					justifyContent: "space-between",
					alignItems: { xs: "flex-start", md: "center" },
					gap: 3,
				}}
			>
				<Box sx={{ display: 'flex', flexDirection: 'column' }}>
					<Typography
						variant="h3"
						component="h1"
						sx={{
							fontSize: { xs: "2rem", md: "2.5rem" },
							fontWeight: 700,
							color: "text.primary",
							letterSpacing: "-0.01em",
						}}
					>
						My Journal
					</Typography>
					<Typography variant="body2" color="text.secondary" sx={{ fontSize: "0.875rem" }}>
						{totalSyncedEntries + pendingEntries.length} Total Entries
					</Typography>
				</Box>

				{/* View Toggle */}
				<ToggleButtonGroup
					value={viewMode}
					exclusive
					onChange={handleViewModeChange}
					aria-label="view mode"
					sx={{
						bgcolor: "background.paper",
						boxShadow: 1,
						borderRadius: 1.5,
						"& .MuiToggleButton-root": {
							px: { xs: 1.5, md: 2.5 },
							py: 1,
							border: "none",
							minWidth: { xs: 44, md: "auto" },
							fontSize: "0.875rem",
							fontWeight: 500,
							textTransform: "none",
							color: "text.secondary",
							transition: "all 0.2s ease-in-out",
							"&:hover": {
								bgcolor: "action.hover",
								color: "text.primary",
							},
							"&.Mui-selected": {
								bgcolor: "primary.main",
								color: "primary.contrastText",
								"&:hover": {
									bgcolor: "primary.dark",
								},
							},
						},
					}}
				>
					<ToggleButton value="card" aria-label="card view">
						<Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
							<GridViewIcon sx={{ fontSize: 20 }} />
							{!isMobile && <span>Card View</span>}
						</Box>
					</ToggleButton>
					<ToggleButton value="table" aria-label="table view">
						<Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
							<TableRowsIcon sx={{ fontSize: 20 }} />
							{!isMobile && <span>Table View</span>}
						</Box>
					</ToggleButton>
				</ToggleButtonGroup>
			</Box>

			{/* Content Section */}
			<Box sx={{ mb: 4 }}>
				{journalEntries.length === 0 && pendingEntries.length === 0 ? (
					<JournalEntriesEmptyState />
				) : (
					<>
						<Box sx={{ mb: 6 }}>
							<Box 
								sx={{ 
									display: 'flex', 
									justifyContent: 'space-between', 
									alignItems: 'center',
									mb: 2, 
									cursor: 'pointer',
									'&:hover': { opacity: 0.8 }
								}}
							>
								<Box 
									onClick={() => setPendingExpanded(!pendingExpanded)}
									sx={{ display: 'flex', alignItems: 'center', gap: 1, width: "100%" }}
								>
									{pendingExpanded ? <ExpandLessIcon sx={{ color: 'warning.main' }} /> : <ExpandMoreIcon sx={{ color: 'warning.main' }} />}
									<Typography variant="h5" sx={{ fontWeight: 600, color: 'warning.main' }}>
										Pending Sync ({pendingEntries.length})
									</Typography>
								</Box>
								<Box onClick={(e) => e.stopPropagation()}>
									<SyncProgress />
								</Box>
							</Box>
							<Collapse in={pendingExpanded}>
								{viewMode === "card" ? (
									<JournalEntryCardView
										entries={pendingEntries}
										onEntryClick={(id) => navigate(`/journal-entries/pending/${id}`)}
									/>
								) : (
									<JournalEntryTableView
										entries={pendingEntries}
										onEntryClick={(id) => navigate(`/journal-entries/pending/${id}`)}
									/>
								)}
							</Collapse>
						</Box>
						<Box
							sx={{ 
								display: 'flex', 
								justifyContent: 'space-between', 
								alignItems: 'center',
								mb: 2, 
								cursor: 'pointer',
								'&:hover': { opacity: 0.8 }
							}}
						>
							<Box
								onClick={() => setSyncedExpanded(!syncedExpanded)} 
								sx={{ display: 'flex', alignItems: 'center', gap: 1, width: "100%" }}
							>
								{syncedExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
								<Typography variant="h5" sx={{ fontWeight: 600 }}>
									Synced Entries ({totalSyncedEntries})
								</Typography>
							</Box>
							<Tooltip title="Refresh from cloud">
								<IconButton 
									onClick={(e) => {
										e.stopPropagation();
										refetchEntries();
										refetchPending();
									}}
									size="small"
									color="primary"
									sx={{ 
										bgcolor: 'primary.lighter',
										'&:hover': { bgcolor: 'primary.light', color: 'primary.contrastText' }
									}}
								>
									<RefreshIcon fontSize="small" />
								</IconButton>
							</Tooltip>
						</Box>
						<Collapse in={syncedExpanded}>
							{viewMode === "card" ? (
								<JournalEntryCardView
									entries={journalEntries}
									onEntryClick={handleEntryClick}
								/>
							) : (
								<JournalEntryTableView
									entries={journalEntries}
									onEntryClick={handleEntryClick}
								/>
							)}
						</Collapse>
					</>
				)}
			</Box>

			{/* Pagination */}
			{totalPages > 1 && (
				<Box sx={{ display: "flex", justifyContent: "center", mt: 5 }}>
					<Pagination
						count={totalPages}
						page={currentPage}
							onChange={(_event: React.ChangeEvent<unknown>, page: number) => setCurrentPage(page)}
						color="primary"
						size="large"
						showFirstButton
						showLastButton
						sx={{
							"& .MuiPaginationItem-root": {
								fontSize: "1rem",
								fontWeight: 500,
								transition: "all 0.2s ease-in-out",
								"&:hover": {
									transform: "translateY(-2px)",
								},
							},
						}}
					/>
				</Box>
			)}
		</Container>
	);
}