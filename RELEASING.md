# Releasing `create-lorekeeper`

Lorekeeper publishes one npm package, `create-lorekeeper`, which installs the
`lore` command. The private `@lorekeeper/core` workspace is inlined into the
package's single `dist/lore.js` at pack time, so nothing private is ever
requested from the registry. `yaml` is the one runtime dependency.

**The version comes from one place.** The newest `## [X.Y.Z]` heading in
`CHANGELOG.md` is the source of truth. `packages/cli/package.json`, the Git tag
and the GitHub Release must agree with it; the release workflow and the publish
guard both refuse otherwise.

**Nothing public exists until npm has the package.** A published version, a
pushed tag and a Release are permanent. A mistake is corrected by superseding
it, never by removing it.

## First publication (one time, by a human)

npm can bind a trusted publisher only to a package that already exists, so
`0.1.0` is published by hand once. Until then, `.github/workflows/release.yml`
refuses to run.

1. Merge the release PR. On an up-to-date `main` with a clean tree:

   ```sh
   npm ci
   node packages/cli/scripts/verify-package.mjs --keep /tmp/lore-release
   ```

   Every check must pass. The verified tarball is
   `/tmp/lore-release/create-lorekeeper-0.1.0.tgz`. Compare its `shasum` with the
   one recorded for the release candidate. The build is deterministic, so a
   difference means the tree differs.
2. Log in as the package owner: `npm login` (account `riki.lamadrid`).
3. Re-check that the name is still free. Both must return `404`:

   ```sh
   curl -s -o /dev/null -w '%{http_code}\n' https://registry.npmjs.org/create-lorekeeper
   curl -s -o /dev/null -w '%{http_code}\n' https://registry.npmjs.org/createlorekeeper
   ```

   npm refuses a new name that matches an existing package once `-`, `.` and
   `_` are removed, which is why the second check is there.
4. Publish the verified tarball, exactly those bytes:

   ```sh
   npm publish /tmp/lore-release/create-lorekeeper-0.1.0.tgz
   ```

   npm runs no lifecycle scripts for a tarball, so the publish guard does not
   run here. This step is the deliberate human act. npm asks for your 2FA code.
   No provenance is attached to this one publish: provenance needs a supported
   CI identity, and a laptop has none. That's why `publishConfig.provenance` is
   not set. Every workflow publish after this one carries provenance
   automatically.
5. On <https://www.npmjs.com/package/create-lorekeeper/access>, under
   **Trusted Publisher**, choose GitHub Actions: user `rikilamadrid`, repository
   `lorekeeper`, workflow filename **`release.yml`**, no environment. Leave
   "require 2FA for publishing" on.
6. Tag and release `v0.1.0` by dispatching the workflow, which now sees the
   version on the registry, skips the publish, and does the rest:

   ```sh
   gh workflow run release.yml --ref main -f version=0.1.0
   ```

7. Verify from outside: `npm view create-lorekeeper version`,
   `npx create-lorekeeper@0.1.0 init scratch-brain`, and `gh release view v0.1.0`.

## Every later release

1. Rename `[Unreleased]` in `CHANGELOG.md` to `## [X.Y.Z] - YYYY-MM-DD` and add
   a fresh empty `[Unreleased]` above it. The GitHub Release notes are this
   section, extracted verbatim.
2. Set the same version in `packages/cli/package.json`.
3. Open the release PR. CI packs and verifies the tarball. Squash merge.
4. `gh workflow run release.yml --ref main -f version=X.Y.Z`. It refuses unless
   the input, the changelog and the manifest agree and `main`'s tip is the
   commit being released. In order, it tests, verifies the package, publishes
   through trusted publishing with provenance, reads the version back from the
   registry, pushes the annotated tag, and creates the Release.
5. If it fails, **re-dispatch it.** Every step skips an effect that already
   exists. Never invent a new version to get past a failed run.

## Publishing by hand, if the workflow cannot be used

From a clean `main` at the release commit:

```sh
cd packages/cli
LOREKEEPER_PUBLISH=yes npm publish
# then, only after the registry serves it:
git tag -a vX.Y.Z -m "vX.Y.Z" && git push origin vX.Y.Z
```

The publish guard (`packages/cli/scripts/publish-guard.mjs`) refuses unless
intent is explicit, the version is not the `0.0.0` sentinel, the changelog
agrees, the tree is clean and `HEAD` is contained in `origin/main`.

The trusted publisher is bound to the workflow's filename. Renaming
`release.yml` silently breaks every future publish.
