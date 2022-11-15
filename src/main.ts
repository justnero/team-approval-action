import * as core from "@actions/core";
import * as github from "@actions/github";
import { approve } from "./approve";

export async function run() {
  try {
    const token = core.getInput("github-token");
    const skipAssignees = core.getInput("skip-assignees") === "true";
    const approveNoRequirements =
      core.getInput("approve-no-requirements") === "true";
    if (!token) {
      throw new Error("This action requies `github-token` to be set");
    }
    await approve(
      token,
      github.context,
      labelRequirements(),
      approveNoRequirements,
      skipAssignees
    );
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message);
    } else {
      core.setFailed("Unknown error");
    }
  }
}
function labelRequirements(): Array<{ label: string; owners: string[] }> {
  return (core.getInput("label-requirements") || "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line)
    .map((line) => {
      if (!line.includes("=")) {
        throw new Error(
          "Label requirement lines must be in a format of `label=team,user`"
        );
      }
      const [label, owners] = line.split("=");
      return { label, owners: owners.split(",") };
    });
}

if (require.main === module) {
  run();
}
