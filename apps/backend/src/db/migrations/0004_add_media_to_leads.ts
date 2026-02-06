import { change } from '../db_script';

change(async (db) => {
  await db.changeTable('leads', (t) => ({
    visitingCardFrontUrl: t.add(t.string(2048).nullable()),
    visitingCardBackUrl: t.add(t.string(2048).nullable()),
    voiceNoteUrl: t.add(t.string(2048).nullable()),
  }));
});
