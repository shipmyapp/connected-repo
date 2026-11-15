# Legal texts: skeletons

> **A fork must replace these texts.** They are placeholders written for the template, not for any product, company or country. Do not publish them as they stand.

Starting points for a project built on this template, to be completed and reviewed by counsel. They are not legal advice. Every `TODO:` is something only the project can fill in.

- [terms.md](./terms.md): terms of use
- [privacy.md](./privacy.md): privacy notice

Publish both where your users can read them and set `VITE_TERMS_URL` and `VITE_PRIVACY_URL` (frontend env). The sign-in page and the profile then link them, and every account is asked to agree once. With either one blank, the app shows no links and asks nothing.

Rules for the pull requests that follow:

- A change that collects new personal data, adds a processor or a cookie updates `privacy.md` in the same pull request.
- A material change to either text bumps `LEGAL_VERSION` (`packages/zod-schemas/src/legal.zod.ts`) to the date it takes effect; everyone is asked again.
- Describe what the product does; never claim it is "secure" or "encrypted".
