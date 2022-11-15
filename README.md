# Team Approval GitHub Action

[![CI](https://github.com/justnero/team-approval-action/actions/workflows/ci.yml/badge.svg?event=push)](https://github.com/justnero/team-approval-action/actions/workflows/ci.yml)

**Name:** `justnero/team-approval-action`

Approve GitHub pull requests based on a set of requirements.

## Usage instructions

Create a workflow file (e.g. `.github/workflows/team-approval.yml`) that contains a step that `uses: justnero/team-approval-action@v3`. Here's an example workflow file:

```yaml
name: Auto approve
on: pull_request_target

jobs:
  team-approval:
    runs-on: ubuntu-latest
    permissions:
      pull-requests: write
    steps:
      - uses: justnero/team-approval-action@v1
        with:
          github-token: ${{ secrets.SOME_USERS_PAT }}
          label-requirements: |
            backend=justnero,testOrg/backend
            frontend=testOrg/frontend
          approve-no-requirements: false
          skip-assignies: false
```

## Why?

GitHub lets you prevent merges of unapproved pull requests. However, it's occasionally useful to selectively circumvent this restriction - for instance, some changes require a certain team or users approval.

## Code owners

To enforce a team approval requirement consider adding personal access token user to the [CODEOWNERS file](https://docs.github.com/en/github/creating-cloning-and-archiving-repositories/about-code-owners). Rather than using a real user's personal access token, you're probably better off creating a dedicated bot user. That way you can restrict the bot user's permissions as much as possible, and your workflow won't break when people leave the team.
