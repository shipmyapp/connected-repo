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
import { useTeam } from "@frontend/contexts/TeamContext";
import { LeadsEmptyState } from "@frontend/modules/leads/components/LeadsEmptyState";
import { LeadCardView } from "@frontend/modules/leads/components/LeadCardView";
import { LeadTableView } from "@frontend/modules/leads/components/LeadTableView";
import type { UserAppBackendOutputs } from "@frontend/utils/orpc.client";
import { queryClient } from "@frontend/utils/queryClient";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import RefreshIcon from "@mui/icons-material/Refresh";
import AddIcon from "@mui/icons-material/Add";
import { Collapse, IconButton, Tooltip, useMediaQuery, useTheme, Button } from "@mui/material";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import type { LeadSelectAll } from "@connected-repo/zod-schemas/leads.zod";

const ITEMS_PER_PAGE = 12;

type ViewMode = "card" | "table";

export default function LeadsListPage() {
	const navigate = useNavigate();
	const theme = useTheme();
	const isMobile = useMediaQuery(theme.breakpoints.down("md"));
	const [viewMode, setViewMode] = useState<ViewMode>("card");
	const [currentPage, setCurrentPage] = useState(1);
	const [pendingExpanded, setPendingExpanded] = useState(true);
	const [syncedExpanded, setSyncedExpanded] = useState(true);

	const { currentTeam } = useTeam();
    // Default to personal workspace logic if no team selected, 
    // but for now let's assume if currentTeam is present we filter by it.
    // If currentTeam is null, it might mean "Personal" or "All", depending on design.
    // Based on implementation plan, we have "Personal" vs "Team".
    // TeamContext provides currentTeam. If it is null/undefined, effectively we are in "Personal" or "Global" mode?
    // User flow diagrams say: "Workspace switcher".
    // Let's assume we pass userTeamId if it exists.

	const { 
		data: leadsResult, 
		isLoading, 
		error,
		refetch: refetchLeads
	} = useWorkerQuery<UserAppBackendOutputs['leads']['getAll']>({
		entity: 'leads',
		operation: 'getAll',
		payload: { userTeamId: currentTeam?.userTeamId },
		sortBy: 'createdAt',
		descending: true,
		limit: ITEMS_PER_PAGE,
		offset: (currentPage - 1) * ITEMS_PER_PAGE,
		// Add userTeamId to queryKey to force refresh when team changes
		queryKey: ['leads', 'getAll', currentTeam?.userTeamId, currentPage],
	});

	const { data: pendingLeadsResult, refetch: refetchPending } = usePendingEntries<LeadSelectAll>({
		entity: 'leads',
		sortBy: 'createdAt',
		descending: true,
        // usePendingEntries might need an update to accept filters/payload for filtering?
        // For now, let's pass it and we will update usePendingEntries hook if needed.
        // But usePendingEntries definition in LeadsList only accepts those props.
        // We might need to filter client-side or update usePendingEntries.
        // Let's first look at usePendingEntries definition.
	});

	const syncedLeads = leadsResult?.data || [];
	const pendingLeads = pendingLeadsResult?.data || [];
	const totalSyncedLeads = leadsResult?.meta?.total || 0;

	// Auto-refresh when sync completes
	useWorkerEvent('sync-complete', () => {
		queryClient.invalidateQueries({ queryKey: [['leads', 'getAll']] });
		queryClient.invalidateQueries({ queryKey: [['pending', 'leads']] });
	});

	const handleViewModeChange = (_event: React.MouseEvent<HTMLElement>, newMode: ViewMode | null) => {
		if (newMode !== null) {
			setViewMode(newMode);
			setCurrentPage(1);
		}
	};

	const totalPages = useMemo(() => {
		return Math.ceil(totalSyncedLeads / ITEMS_PER_PAGE);
	}, [totalSyncedLeads]);

	if (isLoading) return <LoadingSpinner text="Loading leads..." />;

	if (error) {
		const errorMessage = `${error.name} - ${error.message}`;
		return (
			<Container maxWidth="lg" sx={{ py: 4 }}>
				<ErrorAlert message={`Error loading leads: ${errorMessage}`} />
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
						Lead Capture
					</Typography>
					<Typography variant="body2" color="text.secondary" sx={{ fontSize: "0.875rem" }}>
						{totalSyncedLeads + pendingLeads.length} Total Leads
					</Typography>
				</Box>

				<Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
					<Button
						variant="contained"
						startIcon={<AddIcon />}
						onClick={() => navigate("/leads/new")}
						sx={{ 
							display: { xs: 'none', sm: 'flex' },
							fontWeight: 600,
							borderRadius: 1.5,
							px: 3
						}}
					>
						Capture Lead
					</Button>

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
			</Box>

			{/* Content Section */}
			<Box sx={{ mb: 4 }}>
				{syncedLeads.length === 0 && pendingLeads.length === 0 ? (
					<LeadsEmptyState />
				) : (
					<>
						{/* Pending Section */}
						{pendingLeads.length > 0 && (
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
											Pending Sync ({pendingLeads.length})
										</Typography>
									</Box>
									<Box onClick={(e) => e.stopPropagation()}>
										<SyncProgress />
									</Box>
								</Box>
								<Collapse in={pendingExpanded}>
									{viewMode === "card" ? (
										<LeadCardView
											entries={pendingLeads}
											onEntryClick={(id) => navigate(`/leads/${id}`)}
										/>
									) : (
										<LeadTableView
											entries={pendingLeads}
											onEntryClick={(id) => navigate(`/leads/${id}`)}
										/>
									)}
								</Collapse>
							</Box>
						)}

						{/* Synced Section */}
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
									Captured Leads ({totalSyncedLeads})
								</Typography>
							</Box>
							<Tooltip title="Refresh from cloud">
								<IconButton 
									onClick={(e) => {
										e.stopPropagation();
										refetchLeads();
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
								<LeadCardView
									entries={syncedLeads}
									onEntryClick={(id) => navigate(`/leads/${id}`)}
								/>
							) : (
								<LeadTableView
									entries={syncedLeads}
									onEntryClick={(id) => navigate(`/leads/${id}`)}
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

			{/* Mobile FAB */}
			<IconButton
				color="primary"
				sx={{
					display: { xs: 'flex', sm: 'none' },
					position: 'fixed',
					bottom: 24,
					right: 24,
					width: 56,
					height: 56,
					bgcolor: 'primary.main',
					color: 'white',
					boxShadow: 3,
					'&:hover': { bgcolor: 'primary.dark' },
					zIndex: theme.zIndex.speedDial
				}}
				onClick={() => navigate("/leads/new")}
			>
				<AddIcon />
			</IconButton>
		</Container>
	);
}
