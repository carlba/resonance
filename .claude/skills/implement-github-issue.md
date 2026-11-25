---
name: implement-github-issue
description: Implement a GitHub issue end to end in the local repo — read the issue, check it's workable, branch, code, add tests, then pause for the user to test before committing and opening a PR. Use whenever the user gives an issue number or GitHub issue URL and wants it worked on ("implement #42", "fix issue 118", "pick up https://github.com/org/repo/issues/7", "/implement-github-issue 42").
---

# Implement a GitHub issue

You are taking one GitHub issue from "open" to "ready for the user to test" in the repo the user is working in, and then — only when they say so — to a pull request. The user wants to stay in control of what gets committed, so the workflow has a deliberate pause before anything is committed or pushed.

Use the `gh` CLI for all GitHub interaction.

## Overview

1. Parse the issue reference
2. Pre-flight checks (stop if anything is off)
3. Read and understand the issue
4. Clarity check → if vague, ask on the issue and stop
5. Size check → if non-trivial, show a plan and wait for approval
6. Signal that work has started
7. Create the branch
8. Implement + add tests
9. Run checks
10. **Pause** — hand off to the user for testing
11. On the user's go-ahead: commit, push, open PR, swap label

---

## 1. Parse the issue reference

Accept only an issue number (`42`, `#42`) or a full issue URL. If the user didn't give one, ask for it — don't search or guess which issue they mean.

If a URL points to a different repo than the current one (`gh repo view --json nameWithOwner`), stop and tell the user; working in the wrong repo is an expensive mistake.

## 2. Pre-flight checks

Run these before touching anything. Each one is a reason to stop and ask, because proceeding would either clobber the user's work or step on someone else's.

- **gh is authenticated**: `gh auth status`. If not, tell the user to run `gh auth login`.
- **Working tree is clean**: `git status --porcelain`. If there are uncommitted changes, list them and ask what to do. Don't stash or discard on your own — those changes might be half-finished work the user cares about.
- **Issue is open**: if closed, report and stop.
- **Not someone else's**: check assignees and linked open PRs:
  ```bash
  gh issue view N --json assignees,closedByPullRequestsReferences
  gh pr list --state open --search "N in:body"
  ```
  If it's assigned to anyone other than the current user (`gh api user -q .login`), or an open PR already references it, report who/what and stop for a decision.

## 3. Read the issue properly

```bash
gh issue view N --json number,title,body,labels,assignees,state,url,comments
```

Read the body *and all comments* — later comments often change or narrow the request. Follow links to related issues/PRs if they look load-bearing. Then explore the relevant parts of the codebase until you understand where the change belongs.

## 4. Clarity check

An issue is too vague to implement if you'd have to guess at something that changes *what* gets built — expected behaviour, which of several readings is meant, missing reproduction steps for a bug you can't reproduce, conflicting requirements. Minor details you can reasonably decide (naming, small UI wording) are not a reason to stop; note them as assumptions instead.

If it's vague:
- Post the questions as a comment on the issue: numbered, specific, each answerable in a line. Briefly say what you understood so far so the author can correct it.
  ```bash
  gh issue comment N --body-file /tmp/issue-N-questions.md
  ```
- Do **not** assign, label or post "working on it" — work hasn't started, and an "in progress" label on a blocked issue misleads the team.
- Tell the user you posted questions (with the comment link) and stop.

**Re-invocation on an issue you've asked about before**: look for your earlier question comment and read every comment after it. If the questions are answered, carry on from step 5. If not, tell the user they're still open and stop — don't post the same questions again.

## 5. Size check and plan gate

Trivial: a contained change you can fully describe in a sentence or two — a typo, a one-function bug fix, a config tweak, a small, well-specified addition. Go straight on.

Non-trivial: touches several modules, changes a public API or data model, needs a design decision, or you're not confident of the approach. Post a plan in chat and wait for approval:

- What you'll change, file by file (or area by area)
- The approach, and any alternative you rejected and why
- What tests you'll add
- Anything you're unsure about

Adjust and re-present if the user pushes back. Proceed only on approval.

## 6. Signal that work has started

Now that the issue is clear and the approach agreed:

```bash
# Create the label the first time it's needed
gh label list --search "in progress" --json name -q '.[].name' | grep -qx "in progress" \
  || gh label create "in progress" --color FBCA04 --description "Being worked on"

gh issue edit N --add-assignee @me --add-label "in progress"
gh issue comment N --body "Working on this."
```

Keep the comment short. If the plan gate ran, one line on the approach is fine, but no essay.

## 7. Create the branch

Branch off the freshly fetched default branch so the work starts from current code:

```bash
DEFAULT=$(gh repo view --json defaultBranchRef -q .defaultBranchRef.name)
git fetch origin "$DEFAULT"
git switch -c <prefix>/<slug> "origin/$DEFAULT"
```

**Prefix**: pick the one that best describes the work:

| Prefix | When |
|---|---|
| `fix/` | Bug fixes, regressions, incorrect behaviour |
| `feature/` | New functionality or user-visible enhancements |
| `refactor/` | Restructuring without behaviour change |
| `docs/` | Documentation-only changes |
| `chore/` | Tooling, dependencies, CI, config, housekeeping |
| `test/` | Test-only changes |
| `perf/` | Performance improvements |

Use issue labels as a strong hint (`bug` → `fix/`, `enhancement` → `feature/`, `documentation` → `docs/`), and judge from the content when labels are missing or misleading.

**Slug**: 2–5 lowercase kebab-case words from the issue's essence, not the full title — `fix/null-login-crash`, `feature/csv-export`. No issue number in the branch name. If the branch already exists locally or on the remote, ask whether to reuse it or pick another name.

## 8. Implement and add tests

- Follow the conventions already in the codebase (structure, naming, error handling, style) over your own preferences.
- Keep the change scoped to the issue. If you spot unrelated problems, note them for the hand-off instead of fixing them. Drive-by changes make the PR harder to review.
- Add tests that cover the new behaviour or reproduce the bug, using the repo's existing test framework and layout. For a bug, the test should fail without your fix. If the code is hard to test, say so in the hand-off rather than skipping silently.

## 9. Run checks

Find how this repo runs its checks (package.json scripts, Makefile, CI workflow files, README/CONTRIBUTING) and run tests, lint, and type-checking. Fix anything your change broke. If something was already failing before your change (verify on the default branch if unsure), don't fix it, but report it.

## 10. Pause and hand off

Stop here. Do not commit, push or open a PR. The user wants to test and maybe adjust things first.

Hand-off message, in this order:

1. **What changed and why**: brief, per file or area
2. **How to test it by hand**: concrete steps (commands to run, pages to open, input to try, expected result)
3. **Check results**: tests/lint/types, pass/fail, and which new tests were added
4. **Assumptions & open points**: anything you decided on the user's behalf, anything left out of scope, unrelated issues you noticed, pre-existing failures

End by saying you'll commit and open the PR when they're ready.

While paused, the user may ask for changes. Make them, re-run the relevant checks, and give a short updated hand-off.

## 11. Commit, push, open the PR (only when asked)

When the user says to go ahead ("commit it", "open the PR", "ship it"):

**Match the repo's conventions.** Check before writing anything:
- `git log --oneline -20` on the default branch for commit message style (Conventional Commits? Capitalised imperative? Prefixes? Issue refs?)
- `CONTRIBUTING.md`, `.github/PULL_REQUEST_TEMPLATE.md` (or `.github/PULL_REQUEST_TEMPLATE/`), `docs/` for explicit rules

Explicit written rules win over inferred style. Use one commit unless the work naturally splits into logical steps.

```bash
git add <the files you changed>      # not `git add -A` — avoid sweeping in stray files
git commit -m "<message in repo style>"
git push -u origin HEAD
gh pr create --title "<title in repo style>" --body-file /tmp/pr-N.md
```

**PR body**: fill the repo's PR template if there is one. Otherwise: a summary of the change, how it was tested, and the assumptions from the hand-off. Always include `Closes #N` so the issue closes on merge. Open it as a normal (ready for review) PR, not a draft.

**Swap the label** to show the issue has moved to review:

```bash
gh label list --search "in review" --json name -q '.[].name' | grep -qx "in review" \
  || gh label create "in review" --color 0E8A16 --description "PR open, awaiting review"
gh issue edit N --remove-label "in progress" --add-label "in review"
```

Finish with the PR link.
