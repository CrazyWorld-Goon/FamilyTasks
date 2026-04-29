# README Risks and Vulnerabilities

This file documents security and operational risks found during the project review.

## 1) Critical: possible secret leakage in repository

- **Risk:** The node master signing key is stored at `data/fabric-hub/familytasks-node-master-key.json` and contains private key material (`xprv`).
- **Current issue:** Runtime `data/fabric-hub/` is not ignored by `.gitignore`, and this file already appears as untracked in git status.
- **Impact:** If committed, anyone with repository access can mint owner envelopes and impersonate privileged actions.
- **Evidence:** `server/fabricNodeMasterKey.mjs` writes `xprv` to disk under `data/fabric-hub/`.
- **Recommended fix:**
  - Add `data/fabric-hub/` and `data/fabric-family-tasks-store/` to `.gitignore`.
  - Remove already-created secret/runtime files from git history if they were ever committed.
  - Rotate node master key if exposure is suspected.

## 2) Medium: owner token issue endpoint has no request authentication

- **Risk:** `POST /api/fabric/issue-owner-token` validates payload and ownership relation in state, but does not authenticate caller identity.
- **Current issue:** Any actor with network access to the app URL can attempt calls for known/guessable owner IDs.
- **Impact:** In non-private network or exposed tunnel scenarios, unauthorized token issuance attempts become feasible.
- **Evidence:** `server/api.mjs` checks `userId` format and owner match, but no session/API key/signature verification.
- **Recommended fix:**
  - Add request authentication (signed challenge, API key, session, or local-only guard).
  - Restrict endpoint by network policy when used in household mode.
  - Add audit logging and rate limiting for token issuance attempts.

## 3) Medium: non-portable install report script on Windows

- **Risk:** `report:install` script uses Unix command `rm -rf` and shell redirections that are not reliably portable on Windows.
- **Current issue:** The project is actively used on Windows; script can fail and produce inconsistent diagnostics.
- **Impact:** Reduced reliability of install diagnostics and developer onboarding friction.
- **Evidence:** `package.json` script `report:install`.
- **Recommended fix:**
  - Replace with cross-platform Node script (e.g., `fs.rmSync`, `fs.writeFileSync`) or `rimraf`.
  - Keep shell usage minimal and OS-agnostic.

## Notes

- The project intentionally follows a private-household trust model (single shared state, no auth).
- If deployment model changes (public internet, tunnels, broader sharing), risks #1 and #2 become substantially more severe and should be addressed before exposure.
