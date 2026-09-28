# Deploying the website

The documentation site in `apps/docs` is deployed by hand. Publishing the npm
package is a separate process; see [`RELEASING.md`](RELEASING.md).

| | |
| --- | --- |
| Production | <https://lorekeeper-bay.vercel.app> |
| Hosting | Vercel, project `lorekeeper` in the `rikilamadrids-projects` scope |
| Model | Manual Vercel CLI deploy. No Git integration: merging to `main` deploys nothing. |
| Build | Defined by the Vercel project (root directory `apps/docs`) and [`apps/docs/vercel.json`](apps/docs/vercel.json). Do not change either as part of a deploy. |

## Deploy

1. Start from a clean checkout of the `main` commit you intend to ship, with no
   local changes. Write down its full SHA.
2. Work from the **repository root**, not `apps/docs`. The Vercel project already
   points its root directory at `apps/docs`, and the build installs from the root.
3. Use the existing project link. `.vercel/` is gitignored, so a fresh checkout
   has none: run `vercel link` at the root and choose the existing `lorekeeper`
   project, or copy `.vercel/project.json` from a clone that is already linked.
   Never create a new project, and never add or rotate credentials for a deploy.
4. Deploy:

   ```sh
   vercel deploy --prod
   ```

## Verify

- Every page returns 200: `/`, `/install/`, `/quickstart/`, `/concepts/`,
  `/knowledge-structure/`, `/capture/`, `/retrieval/`, `/adoption/`,
  `/agents/`, `/provenance/`, `/cli/`, `/troubleshooting/`, `/offline/`.
- The favicon, the stylesheet under `/_astro/`, and `/manifest.webmanifest`
  return 200.
- An unknown route returns 404.
- The home page shows the approved tagline: "You already wrote it down. Find
  the passage that answers."

## Report

Vercel CLI deployments do not record Git commit metadata, so the deployment
itself cannot tell you what it was built from. The operator's report must name:

- the source commit SHA from step 1,
- the Vercel deployment id or URL (`vercel inspect lorekeeper-bay.vercel.app`),
- the verification results above.
