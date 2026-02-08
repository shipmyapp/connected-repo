import CreateJournalEntryPage from "@frontend/modules/journal-entries/pages/CreateJournalEntry.page";
import JournalEntriesPage from "@frontend/modules/journal-entries/pages/JournalEntries.page";
import SyncedJournalEntryDetailPage from "@frontend/modules/journal-entries/pages/SyncedJournalEntryDetail.page";
import PendingSyncJournalEntryDetailPage from "@frontend/modules/journal-entries/pages/PendingSyncJournalEntryDetail.page";
import { Route, Routes } from "react-router";

const JournalEntriesRouter = () => {
	return (
		<Routes>
      <Route path="/" element={<JournalEntriesPage />} />
      <Route path="/new" element={<CreateJournalEntryPage />} />
      <Route path="/synced/:entryId" element={<SyncedJournalEntryDetailPage />} />
      <Route path="/pending-sync/:entryId" element={<PendingSyncJournalEntryDetailPage />} />
    </Routes>
	);
};

export default JournalEntriesRouter;