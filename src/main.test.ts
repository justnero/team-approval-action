import * as core from "@actions/core";
import * as github from "@actions/github";
import { Context } from "@actions/github/lib/context";
import nock from "nock";
import { approve } from "./approve";
import { run } from "./main";

jest.mock("./approve");
const mockedApprove = jest.mocked(approve);

jest.mock("@actions/github");
const mockedGithub = jest.mocked(github);

afterAll(() => {
  jest.unmock("./approve");
  jest.unmock("@actions/github");
});

const originalEnv = process.env;

beforeEach(() => {
  jest.restoreAllMocks();
  mockedApprove.mockReset();
  jest.spyOn(core, "setFailed").mockImplementation(jest.fn());
  nock.disableNetConnect();

  process.env = {
    GITHUB_REPOSITORY: "justnero/test",
    "INPUT_GITHUB-TOKEN": "tok-xyz",
  };
});

afterEach(() => {
  nock.enableNetConnect();
  process.env = originalEnv;
});

test("when a single label requirement is passed", async () => {
  mockedGithub.context = ghContext();
  process.env["INPUT_LABEL-REQUIREMENTS"] = "label1=user1,org1/team1";
  await run();
  expect(mockedApprove).toHaveBeenCalledWith(
    "tok-xyz",
    expect.anything(),
    [{ label: "label1", owners: ["user1", "org1/team1"] }],
    false,
    false
  );
});

test("when multiple label requirements are passed", async () => {
  mockedGithub.context = ghContext();
  process.env["INPUT_LABEL-REQUIREMENTS"] =
    "label1=user1,org1/team1\nlabel2=user2,org2/team2";
  await run();
  expect(mockedApprove).toHaveBeenCalledWith(
    "tok-xyz",
    expect.anything(),
    [
      { label: "label1", owners: ["user1", "org1/team1"] },
      { label: "label2", owners: ["user2", "org2/team2"] },
    ],
    false,
    false
  );
});

test("when approve no requirements flag is passed", async () => {
  process.env["INPUT_APPROVE-NO-REQUIREMENTS"] = "true";
  await run();
  expect(mockedApprove).toHaveBeenCalledWith(
    "tok-xyz",
    expect.anything(),
    expect.anything(),
    true,
    false
  );
});

test("when skip assignies flag is passed", async () => {
  process.env["INPUT_SKIP-ASSIGNIES"] = "true";
  await run();
  expect(mockedApprove).toHaveBeenCalledWith(
    "tok-xyz",
    expect.anything(),
    expect.anything(),
    false,
    true
  );
});

function ghContext(): Context {
  const ctx = new Context();
  ctx.payload = {
    pull_request: {
      number: 101,
    },
  };
  return ctx;
}
