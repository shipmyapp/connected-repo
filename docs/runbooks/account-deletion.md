# Account deletion

How a person deletes their account, what operators can do about it, and what the purge removes and keeps (ADR-046).

## What a person can do

- **Delete**: Profile → Delete my account. Refused while they belong to any team with other people in it (a shared team, as Owner, Admin or Member, or their personal team with someone else in it or invited to it); the dialog lists each team and what to do (leave it, delete it, or hand ownership over and then leave). Needs a sign-in in the last 10 minutes (`RECENT_SIGN_IN_MINUTES`): the app asks to sign in again with Google or Apple and comes back to the dialog.
- The request ends every other session, every connected AI app (tokens and consents) and push on every device; the device that asked wipes its local copy and signs out.
- **Keep**: within 30 days (`ACCOUNT_DELETION_GRACE_DAYS`), sign in → Keep my account. Signing in alone does not cancel; during the grace period every call except `account.cancelDeletion` answers `403 ACCOUNT_DELETION_PENDING`.
- **Download first**: Profile → Download my data (one JSON file; 5 000 rows per list, the file names the lists that were cut; 3 an hour).

## See an account

Console → Users → "Deletion" column: "Scheduled · <date>" for an account that asked.

## Keep an account for someone

A support request, with the person's identity checked outside the app: console → Users → **Keep**, with a reason. Recorded on the Audit page (`users.cancelDeletion`).

## Delete now

An erasure request that must not wait for the grace period. The account must have asked and left its teams: console → Users → **Delete now**, with a reason (`users.purgeNow`). The console refuses with the reason when the account has not asked or is still in a team. Operators never start a deletion: only the person can ask.

## What the purge deletes

The daily `purge_deleted_accounts` cron (02:47 UTC, in the API process, advisory lock) handles accounts whose grace period is over, 50 a run, each in its own savepoint (`purgeAccount` in `modules/users/services/purge.users.service.ts`):

1. the person's files and everything in their personal team are queued for deletion from the bucket;
2. the device keys of their sessions and devices are recorded, so those devices erase their local copy the next time they open the app online;
3. anyone whose active team is the person's personal team is moved off it;
4. their journal entries and files, anywhere, and everything in their personal team;
5. their old (already left) memberships lose their email and phone, so none can be claimed again as an invitation;
6. teams they created and handed over lose their creator (the team stays);
7. their personal team;
8. their sessions and sign-in methods;
9. the account itself, and with it devices, push addresses, connected apps, their tokens, consents and recorded actions. The `user.deleted` event deletes the Novu subscriber.

Bucket objects are deleted after the database commit, from the `storage_object_deletions` queue, on every run until the bucket confirms. Check the queue:

```sql
SELECT count(*), max(attempts) FROM storage_object_deletions;
SELECT object_key, attempts, last_error FROM storage_object_deletions ORDER BY attempts DESC LIMIT 20;
```

Rows with a high `attempts` mean the bucket refuses: check the `S3_*` credentials and `last_error`.

## What is kept, and why

- Shared teams the person created and left: they belong to their members now.
- Invitations other teams sent to the person's email: they belong to those teams.
- `teams_api` keys, subscriptions and API request logs: they belong to API tenants, not people, and nothing links them to an account.
- `operator_audit_log` rows: the operators' record of what they did. A row about the account names it only by id (`target_id`); its `before` holds the request time and team ids.
- `pg_tbus_task_log` payloads and logs (`user.created` carries the email), until their own retention. TODO: a retention job.
- Novu's copy: deleted through the `user.deleted` event; check the Novu dashboard if that task failed.

## A full export beyond the 5 000-row cap

```sql
\copy (SELECT id, team_id, prompt, content, created_at FROM journal_entries WHERE author_user_id = '<user id>' AND deleted_at IS NULL) TO 'entries.csv' CSV HEADER
\copy (SELECT id, team_id, table_name, table_id, file_name, mime_type, cdn_url, created_at FROM files WHERE created_by_user_id = '<user id>' AND deleted_at IS NULL) TO 'files.csv' CSV HEADER
```

## Devices

A device of a purged account erases its local copy (IndexedDB, file storage, the offline sign-in) the next time it opens the app online, asked through `account.localDataErasure` with its device cookie; it then acknowledges and the key is forgotten (or after 400 days, or when anyone signs in on that device). A device that never comes online keeps its copy: nothing can reach it.
