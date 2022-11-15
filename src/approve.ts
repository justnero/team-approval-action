import * as core from "@actions/core";
import * as github from "@actions/github";
import { RequestError } from "@octokit/request-error";
import { Context } from "@actions/github/lib/context";
import { GitHub } from "@actions/github/lib/utils";

export async function approve(
  token: string,
  context: Context,
  labelRequirements: Array<{ label: string; owners: string[] }>,
  approveNoRequirements: boolean,
  skipAssignees: boolean
) {
  const client = github.getOctokit(token);
  const prNumber = context.payload.pull_request?.number;
  if (!prNumber) {
    throw new Error("This action must be run using a `pull_request` event");
  }

  try {
    const { owner, repo } = context.repo;

    core.info(`Fetching user, pull request information, and existing reviews`);
    const [login, { data: pr }, { data: reviews }] = await Promise.all([
      getLoginForToken(client),
      client.rest.pulls.get({ owner, repo, pull_number: prNumber }),
      client.rest.pulls.listReviews({ owner, repo, pull_number: prNumber }),
    ]);

    core.info(`Current user is ${login}`);

    const activeRequirements = labelRequirements.filter(({ label }) =>
      pr.labels.some(({ name }) => name === label)
    );

    if (activeRequirements.length) {
      core.startGroup("Label requirements");
      activeRequirements.forEach(({ label, owners }) =>
        core.info(
          `Label "${label}" requires an approval from: ${owners.join(" or ")}`
        )
      );
      core.endGroup();
    } else {
      core.info("No label requirements for PR");
    }

    const teamsToCollect = activeRequirements.reduce(
      (teams: { org: string; team_slug: string }[], { owners }) => {
        owners.forEach((owner) => {
          if (owner.includes("/")) {
            const [org, team_slug] = owner.split("/");
            teams.push({ org, team_slug });
          }
        });
        return teams;
      },
      []
    );

    let teams = {};
    if (teamsToCollect.length > 0) {
      core.debug(`Loading ${teamsToCollect.length} teams`);
      teams = (
        await Promise.all(
          teamsToCollect.map((team) =>
            client.rest.teams.listMembersInOrg(team).then(({ data }) => ({
              name: `${team.org}/${team.team_slug}`,
              members: data,
            }))
          )
        )
      ).reduce(
        (teams: { [name: string]: Array<string> }, { name, members }) => ({
          ...teams,
          [name]: members.map(({ login }) => login),
        }),
        {}
      );
      core.debug("Loaded teams");
    }

    const prHead = pr.head.sha;
    core.info(`Commit SHA is ${prHead}`);

    const approvals = reviews
      .filter(
        ({ state, user }) =>
          state === "APPROVED" &&
          (!skipAssignees ||
            !pr.assignees?.some(({ login }) => user?.login === login))
      )
      .map((review) => review.user?.login);

    let labelsSatisfied = true;
    core.startGroup("Evaluating label requirements");
    activeRequirements.forEach(({ label, owners }) => {
      if (
        !owners.some((owner) =>
          owner.includes("/")
            ? teams[owner]?.some((member) => approvals.includes(member))
            : approvals.includes(owner)
        )
      ) {
        core.info(`❌ ${label} requirements are not satisfied`);
        labelsSatisfied = false;
      } else {
        core.info(`✅ ${label} requirements are satisfied`);
      }
    });
    core.endGroup();
    core.info(
      labelsSatisfied
        ? "✅ All label requirements are satisfied"
        : "❌ At least one label requirement is not satisfied"
    );

    const existingApproval = reviews.find(
      ({ user, state }) => user?.login === login && state === "APPROVED"
    );
    if (existingApproval && !labelsSatisfied) {
      await client.rest.pulls.dismissReview({
        owner: context.repo.owner,
        repo: context.repo.repo,
        pull_number: prNumber,
        review_id: existingApproval.id,
        message: `Requirements are no longer satisfied`,
      });
      core.info(`❌ Dismissed pull request #${prNumber} approval`);
      return;
    }
    if (
      (approveNoRequirements || activeRequirements.length > 0) &&
      !existingApproval &&
      labelsSatisfied
    ) {
      await client.rest.pulls.createReview({
        owner: context.repo.owner,
        repo: context.repo.repo,
        pull_number: prNumber,
        event: "APPROVE",
      });
      core.info(`✅ Approved pull request #${prNumber}`);
      return;
    }
    core.info("Approval is up to date");
  } catch (error) {
    if (error instanceof RequestError) {
      switch (error.status) {
        case 401:
          core.setFailed(
            `${error.message}. Please check that the \`github-token\` input parameter is set correctly.`
          );
          break;
        case 403:
          core.setFailed(
            `${error.message}. In some cases, the GitHub token used for actions triggered ` +
              "from `pull_request` events are read-only, which can cause this problem. " +
              "Switching to the `pull_request_target` event typically resolves this issue."
          );
          break;
        case 404:
          core.setFailed(
            `${error.message}. This typically means the token you're using doesn't have ` +
              "access to this repository. Use the built-in `${{ secrets.GITHUB_TOKEN }}` token " +
              "or review the scopes assigned to your personal access token."
          );
          break;
        case 422:
          core.setFailed(
            `${error.message}. This typically happens when you try to approve the pull ` +
              "request with the same user account that created the pull request. Try using " +
              "the built-in `${{ secrets.GITHUB_TOKEN }}` token, or if you're using a personal " +
              "access token, use one that belongs to a dedicated bot account."
          );
          break;
        default:
          core.setFailed(`Error (code ${error.status}): ${error.message}`);
      }
      return;
    }

    if (error instanceof Error) {
      core.setFailed(error);
    } else {
      core.setFailed("Unknown error");
    }
    return;
  }
}

async function getLoginForToken(
  client: InstanceType<typeof GitHub>
): Promise<string> {
  try {
    const { data: user } = await client.rest.users.getAuthenticated();
    return user.login;
  } catch (error) {
    if (error instanceof RequestError) {
      // If you use the GITHUB_TOKEN provided by GitHub Actions to fetch the current user
      // you get a 403. For now we'll assume any 403 means this is an Actions token.
      if (error.status === 403) {
        return "github-actions[bot]";
      }
    }
    throw error;
  }
}
