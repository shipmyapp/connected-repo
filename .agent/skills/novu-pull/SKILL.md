---
name: novu-pull
description: Check the Novu dashboard against the code and bring dashboard edits (workflows, email/push/in-app templates, the email layout) into the repo. Use before ANY change to a Novu workflow, template or layout in code, when someone says the marketing team changed a notification or email in Novu, or when asked to pull, sync or compare Novu workflows.
---

# Novu: check, tell the user, pull

People edit notification wording in the Novu dashboard. The code in
`apps/backend/src/novu/workflows/` keeps a copy of every workflow, and each
copy has an `updatedAt`. So does the email layout every email is drawn in
(`apps/backend/src/novu/layouts/`; Novu lets a layout read only `subscriber`,
`content`, `context` and `env`, so anything that depends on the payload goes
in the email bodies). Every time the backend starts (each container start
after a deploy), `ensureNovuWorkflows`
(`apps/backend/src/novu/ensure_workflows.ts`) compares each copy with Novu:

| In Novu | What boot does |
|---|---|
| missing | creates it from code |
| edited after the code's `updatedAt` | leaves it alone |
| older than the code's `updatedAt` | **updates Novu from code**, overwriting it |

The rule in the root `AGENTS.md` ("Rule: Novu workflows and templates") says
to check the dashboard before any workflow change and tell the user what
changed there. This skill is how.

## 1. The key comes from the session's environment, never from chat

The scripts read `NOVU_SECRET_KEY` and `NOVU_API_URL` from the shell. In a
cloud session they come from the environment's settings; locally, from the
shell you run them in, never from `.env` files.

- Check: `[ -n "$NOVU_SECRET_KEY" ] && echo set || echo missing`. Never print
  the key itself.
- Missing: ask the user to add it to the session environment's settings
  (the cloud environment menu in the session's title bar, then Edit: an
  environment variable `NOVU_SECRET_KEY` holding the Secret Key of the Novu
  environment to check, **Production** unless they say otherwise, from Novu
  dashboard → that environment → **API Keys**, and `NOVU_API_URL`). A new
  session picks it up. **Never ask for the key in chat**, and keep it out of
  files, commits, PR text and summaries.
- Or as a network secret (the environment's **Network secrets**): host:
  the host of `NOVU_API_URL`, header `Authorization`, prefix `ApiKey`, the Secret
  Key as the value. The proxy then adds the key to every request and the
  session never sees it: run the scripts with `NODE_USE_ENV_PROXY=1` (Node's
  fetch ignores the proxy otherwise) and any placeholder as `NOVU_SECRET_KEY`,
  which the proxy replaces.
- `NOVU_API_URL`: the Novu API this app uses: your self-hosted Novu API's
  URL, or Novu Cloud `https://api.novu.co` (`https://eu.api.novu.co` for the EU).
- `--app-url`: the origin the environment links to, i.e. that deployment's
  `WEBAPP_URL` (production unless they say otherwise).

If the key isn't there, tell the user the dashboard was **not** checked,
and stop before changing any workflow or layout unless they say to go ahead
anyway.

## 2. Check, without writing anything

```bash
cd apps/backend
yarn novu:status --app-url https://app.example.com   # NOVU_SECRET_KEY / NOVU_API_URL from the environment
```

It prints one line per email layout (`layout app`) and per workflow, and exits 0 when everything is in sync or 2
when something differs:

- `in sync`: nothing to say.
- `EDITED IN THE DASHBOARD by <name> at <time>`: someone changed it after the
  code. The lines under it show each changed field (`~`), plus lines added
  (`+`) and removed (`-`) in a template body.
- `CODE IS NEWER`: the next deploy will overwrite what the dashboard shows.
- `only in the dashboard`, `only in code`, `defined by the old bridge`: what
  the next pull or boot does about it.

## 3. Tell the user, before changing anything

Summarise the output in plain words, for each workflow that is not in sync:
who changed what and when, quoting the changed subjects and lines, and what
the next deploy would do. Example:

> **Welcome push (`user-created`)**: Priya Shah edited it in the Novu
> dashboard on 27 Oct, 09:12 UTC. The push subject is now "You're in, {{payload.name}}!" (was
> "Welcome, {{payload.name}} 👋"), and its body says "Your account is live —
> welcome aboard." The code doesn't have this yet. I'll pull it before making
> my change, so it isn't lost.

If your planned change would overwrite a dashboard edit, say so plainly and
ask before going ahead.

## 4. Pull

```bash
git fetch origin main && git checkout -b novu-pull-$(date +%Y%m%d) origin/main   # skip if already on a branch for this work
cd apps/backend
yarn novu:pull --app-url https://app.example.com     # NOVU_SECRET_KEY / NOVU_API_URL from the environment
```

This rewrites `src/novu/workflows/<id>.workflow.ts` for every dashboard
workflow and `src/novu/layouts/<id>.layout.ts` for every email layout, with
`updatedAt` set to Novu's, and regenerates both `index.ts` files. In the
templates, the app origin becomes `${input.appUrl}`, so staging links to
staging. Run `yarn novu:status` again afterwards. It should say `in sync`
for every workflow.

## 5. Review the pulled diff

Run `git diff -- apps/backend/src/novu/workflows` and check:

- **Workflows the code triggers still exist.** Search for `workflowId: "` in
  `apps/backend/src` (`triggerNotification` calls). The pull prints
  `not in Novu: <file>` for a file it kept because the workflow is gone from
  Novu. Ask the user before deleting such a file: the next boot would create
  the workflow again from it.
- **Variables match what the code sends.** A template's `{{payload.x}}` needs
  the trigger's `payload` to carry `x`, for example `user-created` sends
  `name` (`user_created.notifications.user.ts`). Point out any new variable
  the code does not send. Novu renders a missing one as empty.
- **Names typed by users are escaped in email HTML**
  (`{{payload.name | escape}}`). Mention any place where one isn't.
- **A changed `stepId` or step type changes behaviour, not just wording.**
  Say so when you see one.

Then run `npx tsc --noEmit -p apps/backend` and
`npx biome lint apps/backend/src/novu`.

## 6. Make your own change (if any), commit, open a PR

After pulling, edit the file and set its `updatedAt` to the current UTC time
(`date -u +%Y-%m-%dT%H:%M:%S.000Z`). Never use a time in the future: boot
ignores those with a warning. To add a workflow, create `<id>.workflow.ts` in
the same shape (see `user_created.workflow.ts`) and add it to `index.ts`.

Then run `yarn novu:check` (also the first step of `yarn build`, so a deploy
stops on it). Novu does not refuse a workflow whose templates it cannot place:
it creates it and marks it "Action required", so the deploy looks fine and the
email never goes. The check applies Novu's rules: every `payload.*` a step
reads is declared in `payloadSchema` (nested ones too);
Liquid names start from `payload`, `subscriber`, `steps`, `context` or `env`,
so no `blank`, `empty` or `nil` (test an optional field with
`{% if payload.x %}`: the backend drops empty values at trigger); a layout
reads only `subscriber`, `content`, `context` and `env`.

Commit, for example "Novu: pull dashboard edits (user-created)", and open a
draft PR. In its description, say what step 3 found and what each workflow's
diff changes. Merging a pure pull needs no deploy step: the next boot finds
the code and Novu at the same `updatedAt` and leaves Novu alone. A change of
your own reaches Novu at the next deploy.
