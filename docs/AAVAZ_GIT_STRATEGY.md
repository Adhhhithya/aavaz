# AAVAZ_GIT_STRATEGY.md

Record of the Git inspection and working-branch setup performed for the Aavaz
integration work, and the reasoning behind it. No history was rewritten, no branch was
deleted, no force-push occurred, and nothing has been pushed anywhere.

---

## 1. Current remote(s)

Two remotes are configured in this local working copy (`E:\aavaz`):

| Remote | URL | Role |
|---|---|---|
| `origin` | `https://github.com/Adhhhithya/aavaz.git` | The user's personal target repository (already configured in this local clone from a prior session; not modified). |
| `targaryens` | `https://github.com/rithulraveendran/targaryens.git` | Added in this session, read-only in practice (fetch only performed; no push credentials assumed or tested). |

`origin` was **not** changed, removed, or repointed. `targaryens` was added purely to
fetch its history; this local repo does not have write access to it and none was
attempted.

## 2. Current branch

`feat/aavaz-integration` (created this session — see §5). This is the branch to continue
Aavaz development on.

## 3. Branch structure

Local branches after this session's work:

| Branch | Base | Contents |
|---|---|---|
| `feat/bootstrap` | orphan root commit (this local repo's own history) | One commit: the from-scratch architecture bootstrap (`CLAUDE.md`, `ARCHITECTURE.md`, `DEVELOPMENT_PLAN.md`, `DECISIONS.md`, spec PDF) produced in an earlier session, before the pivot to using `targaryens` as the real codebase. Preserved, not deleted, not merged into anything. |
| `feat/aavaz-integration` | `targaryens/main` @ `906544d` | Full `targaryens` history (6 commits) plus this session's audit/decision documents and the spec PDF (`docs/spec/AAVAZ_TECHNICAL_WORKFLOW_V0.2.pdf`, copied from `feat/bootstrap`), all currently uncommitted. **This is the new working branch for Aavaz development.** |

Remote-tracking refs: `remotes/targaryens/main` (fetched, read-only reference point).
No local branch named `main` exists in this repo; `targaryens`'s only branch is `main`.

Upstream tracking was deliberately **not** left configured on `feat/aavaz-integration` —
see §9.

## 4. Existing history summary

`targaryens/main`, oldest to newest:

```
6b1c9fb  Initialize project: SIH Backend, Frontend and Mobile
4c92d00  Add backend/.env.example
e707d18  Remove hardcoded ngrok domains
86c15c9  Remove hardcoded OTP values and seed data placeholders
24bd03a  Add professional README and final polish
906544d  Convert mobile folder to standard directory and add its contents   ← main HEAD
```

Single author throughout ("Rithul", `rithulraveendran@users.noreply.github.com`), all
six commits from one working session. No merge commits, no other branches, no tags. This
is a small, linear, easy-to-reason-about history — there is no complex branch topology to
worry about disturbing.

`feat/bootstrap` in this local repo is a separate, unrelated one-commit history (root
commit `22539cb`) authored by the user (`Adhhhithya`) in the prior session, sharing no
common ancestor with `targaryens/main`. This is expected and fine — Git supports
multiple unrelated histories in one repository, and no operation performed here required
them to be related.

## 5. Recommended working branch

`feat/aavaz-integration`, created directly from `targaryens/main` with:

```
git checkout -b feat/aavaz-integration targaryens/main
```

This was chosen (per the task's own suggestion) because it:
- Preserves `targaryens`'s commit history exactly, with identical SHAs.
- Keeps `main`-equivalent work (the actual implementation) separate from the
  from-scratch bootstrap artifacts on `feat/bootstrap`.
- Gives a clear, descriptive name for anyone (human or agent) looking at branch list
  later.

## 6. Recommended remote strategy

Given the ownership facts on the table — `targaryens` belongs to a different GitHub
account (`rithulraveendran`) than the user's target repo (`Adhhhithya/aavaz`), and this
local clone already has `origin` pointed at `Adhhhithya/aavaz` — the four options from
the task, evaluated:

| Option | Assessment |
|---|---|
| **A. Continue development in the existing repository** (i.e. push back to `rithulraveendran/targaryens`) | Not viable as the primary path: this is someone else's personal GitHub repository. No push access was assumed, tested, or should be assumed. Also doesn't match the user's stated goal of `Adhhhithya/aavaz` as their target. |
| **B. Fork/duplicate the existing repository** | Would give a GitHub-level fork relationship (upstream tracking, easy future PRs back to `rithulraveendran/targaryens` if ever wanted) but requires a GitHub API/UI action (creating a fork under the user's account) that has not been performed — this local session can prepare for it but cannot create a GitHub fork via git commands alone. |
| **C. Add `Adhhhithya/aavaz` as a second remote** | Already effectively true in reverse — `Adhhhithya/aavaz` is `origin`, and `targaryens` was added as the *second* remote. This is the actual current state, not a future action. |
| **D. Migrate the existing implementation while preserving history** | **This is what was actually done in this session**, and is the recommended path: `targaryens`'s commits were fetched intact and now live on `feat/aavaz-integration` in the same local repository whose `origin` is `Adhhhithya/aavaz`. History is preserved exactly (identical commit SHAs, authorship, dates, messages); nothing was squashed, rebased, or rewritten. |

**Recommendation: Option D, using the local-repo structure already in place.** Concretely:
`origin` (`Adhhhithya/aavaz`) is the repository this work should eventually be pushed to;
`targaryens` remains as a reference remote for as long as it's useful to re-fetch or
diff against upstream `rithulraveendran/targaryens` changes, and can be removed later
once no longer needed. This avoids any GitHub-side action (forking, transferring
ownership) that wasn't explicitly requested, while still giving the user a clean, fully
history-preserving path to their own repository.

## 7. How `Adhhhithya/aavaz` should eventually be used

- `Adhhhithya/aavaz` (`origin`) should become the durable home for this work. Since it is
  currently an **empty remote** (only ever had `feat/bootstrap` prepared locally, never
  pushed — see git status in `AAVAZ_MIGRATION_PLAN.md` verification), pushing
  `feat/aavaz-integration` there will not conflict with or overwrite anything on the
  remote.
- Recommended eventual sequence (**not executed in this session** — see §9): push
  `feat/aavaz-integration` to `origin` as a new branch, open it for review, and decide
  separately (per `AAVAZ_MIGRATION_PLAN.md`) whether `feat/bootstrap` is worth pushing
  too (it documents a superseded approach, so it may only be worth keeping locally or
  pushing purely for the historical record).
- Whether `origin`'s default branch should become `feat/aavaz-integration`,
  `main`, or something else, and whether `rithulraveendran` should be added as a
  collaborator/co-author on the new repository, are product/ownership decisions for the
  user, not something to infer from git state.

## 8. Exact Git commands that were actually executed

In order, this session:

```
git config --global --add safe.directory E:/aavaz          # (from the prior bootstrap session; unrelated to this task, listed for completeness of session history)

git add CLAUDE.md ARCHITECTURE.md DEVELOPMENT_PLAN.md DECISIONS.md docs/spec/AAVAZ_TECHNICAL_WORKFLOW_V0.2.pdf
git commit -m "Bootstrap: architecture analysis and engineering rules from spec v0.2 ..."
                                                              # preserved the prior session's uncommitted bootstrap work on feat/bootstrap before touching anything else

git remote add targaryens https://github.com/rithulraveendran/targaryens.git
git fetch targaryens --tags

git checkout -b feat/aavaz-integration targaryens/main       # new working branch, exact history from targaryens/main

git branch --unset-upstream                                  # removed auto-set tracking to targaryens/main (see §9)

mkdir -p docs
# (docs/AAVAZ_IMPLEMENTATION_AUDIT.md, docs/AAVAZ_GIT_STRATEGY.md, docs/AAVAZ_MIGRATION_PLAN.md written)
```

Then, in the follow-up session that formalized the six migration decisions
(`AAVAZ_MIGRATION_PLAN.md` §0, Decision 6):

```
git checkout feat/bootstrap -- docs/spec/AAVAZ_TECHNICAL_WORKFLOW_V0.2.pdf
                                                              # copies that one path's blob from feat/bootstrap
                                                              # into the feat/aavaz-integration working tree + index,
                                                              # byte-for-byte, unmodified; touches no other file;
                                                              # does not switch branches, merge, or rebase
```

This is the only git-mutating command from that follow-up session; the three
documentation files (`AAVAZ_IMPLEMENTATION_AUDIT.md`, `AAVAZ_GIT_STRATEGY.md`,
`AAVAZ_MIGRATION_PLAN.md`) were edited with the file-editing tool, not via git, and
nothing was staged or committed.

No other git-mutating commands were run in either session. `git status`, `git log`,
`git branch -a`, `git remote -v`, `git diff --stat` were run repeatedly for inspection
only.

## 9. Commands deliberately NOT executed, and why

- **`git push` (to any remote, for any branch).** The task explicitly says not to push
  anything yet, and this is also just good practice before the user has reviewed the
  audit/migration plan.
- **Leaving `feat/aavaz-integration` tracking `targaryens/main`.** `git checkout -b
  <branch> targaryens/main` auto-sets that branch's upstream to `targaryens/main`. This
  was immediately undone with `git branch --unset-upstream`, because a future bare `git
  push` on this branch would otherwise silently attempt to push to `rithulraveendran`'s
  repository — an account this session has no authorization to write to, and not where
  the user wants this work to end up. This was a safety fix, not a destructive action:
  it only removes a local tracking pointer, not any commit or remote-side ref.
- **`git remote set-url origin ...` or any change to `origin`.** The task explicitly says
  not to change the existing repository's origin automatically, and `origin` already
  correctly points at `Adhhhithya/aavaz` from the prior session — there was nothing to
  fix here regardless.
- **Deleting or force-updating `feat/bootstrap`.** It represents real prior work (a
  complete from-scratch architecture pass) and remains available for reference or reuse;
  removing it wasn't requested and isn't necessary for the new branch to exist
  independently.
- **`git merge` or `git rebase` between `feat/bootstrap` and `feat/aavaz-integration`.**
  These two histories are unrelated (no common ancestor) and serve different purposes
  right now (superseded planning docs vs. the real codebase to build on) — merging them
  would just create a confusing combined history for no benefit. If specific content from
  `feat/bootstrap` (e.g. the general `CLAUDE.md` engineering rules) is wanted on
  `feat/aavaz-integration`, that should be a deliberate, reviewed cherry-pick or manual
  port, not an automatic merge — and is a call for the user, not something to do
  silently during an audit.
- **Creating a GitHub-level fork of `rithulraveendran/targaryens`, or transferring
  ownership.** These require GitHub API/UI actions beyond local git commands and beyond
  this session's authorization; see §6 option B.
- **`git fetch origin`.** Not needed for this task — `origin` (`Adhhhithya/aavaz`) has no
  commits to fetch (confirmed empty via the earlier bootstrap session's `git ls-remote`
  equivalent check and the fact that `feat/bootstrap` was created as a root commit with
  "No commits yet" showing beforehand).
