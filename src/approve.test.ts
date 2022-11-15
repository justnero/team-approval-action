import * as core from "@actions/core";
import { Context } from "@actions/github/lib/context";
import { create } from "domain";
import nock from "nock";
import { approve } from "./approve";

const originalEnv = process.env;

beforeEach(() => {
  jest.restoreAllMocks();
  jest.spyOn(core, "setFailed").mockImplementation(jest.fn());
  jest.spyOn(core, "startGroup").mockImplementation(jest.fn());
  jest.spyOn(core, "endGroup").mockImplementation(jest.fn());
  jest.spyOn(core, "info").mockImplementation(jest.fn());
  jest.spyOn(core, "debug").mockImplementation(jest.fn());
  nock.disableNetConnect();

  process.env = { GITHUB_REPOSITORY: "justnero/test" };
});

afterEach(() => {
  nock.cleanAll();
  nock.enableNetConnect();
  process.env = originalEnv;
});

const apiNock = nock("https://api.github.com");
const apiMocks = {
  getUser: (status?: number, body?: object) =>
    apiNock
      .get("/user")
      .reply(status ?? 200, body ?? { login: "justnero-bot" }),
  getPull: (status?: number, body?: object) =>
    apiNock.get("/repos/justnero/test/pulls/101").reply(
      status ?? 200,
      body ?? {
        labels: [],
        assignies: [],
        head: { sha: "675fe4aa72b4e423df2ff0fb0096a93046f83257" },
      }
    ),
  getReviews: (status?: number, body?: any) =>
    apiNock
      .get("/repos/justnero/test/pulls/101/reviews")
      .reply(status ?? 200, body ?? []),
  getTeamMembers: (
    org?: string,
    teamSlug?: string,
    status?: number,
    body?: any
  ) =>
    apiNock
      .get(`/orgs/${org ?? "org"}/teams/${teamSlug ?? "team"}/members`)
      .reply(status ?? 200, body ?? []),
  createReview: () =>
    apiNock.post("/repos/justnero/test/pulls/101/reviews").reply(200, {}),
  dismissReview: () =>
    apiNock
      .put("/repos/justnero/test/pulls/101/reviews/202/dismissals")
      .reply(200, {}),
};

test("a PR is left untouched with no requirements", async () => {
  apiMocks.getUser();
  apiMocks.getPull();
  apiMocks.getReviews();
  const createReview = apiMocks.createReview();

  await approve("gh-foo", ghContext(), [], false, false);

  expect(createReview.isDone()).toBe(false);
});

test("a PR is successfully approved with no requirements", async () => {
  apiMocks.getUser();
  apiMocks.getPull();
  apiMocks.getReviews();
  const createReview = apiMocks.createReview();

  await approve("gh-foo", ghContext(), [], true, false);

  expect(createReview.isDone()).toBe(true);
});

test("a PR is successfully approved", async () => {
  apiMocks.getUser();
  apiMocks.getPull(200, {
    labels: [{ name: "foo" }],
    assignies: [],
    head: { sha: "675fe4aa72b4e423df2ff0fb0096a93046f83257" },
  });
  apiMocks.getReviews(200, [
    { id: 201, state: "APPROVED", user: { login: "justnero" } },
  ]);
  const createReview = apiMocks.createReview();

  await approve(
    "gh-foo",
    ghContext(),
    [{ label: "foo", owners: ["justnero"] }],
    false,
    false
  );

  expect(createReview.isDone()).toBe(true);
});

test("a PR approval is successfully dismissed", async () => {
  apiMocks.getUser();
  apiMocks.getPull(200, {
    labels: [{ name: "foo" }],
    assignies: [],
    head: { sha: "675fe4aa72b4e423df2ff0fb0096a93046f83257" },
  });
  apiMocks.getReviews(200, [
    { id: 202, state: "APPROVED", user: { login: "justnero-bot" } },
  ]);
  const dismissReview = apiMocks.dismissReview();

  await approve(
    "gh-foo",
    ghContext(),
    [{ label: "foo", owners: ["justnero"] }],
    false,
    false
  );

  expect(dismissReview.isDone()).toBe(true);
});

test("a PR is not approved when requirement is not satisfied", async () => {
  apiMocks.getUser();
  apiMocks.getPull(200, {
    labels: [{ name: "foo" }],
    assignies: [],
    head: { sha: "675fe4aa72b4e423df2ff0fb0096a93046f83257" },
  });
  apiMocks.getReviews(200, [
    { id: 200, state: "APPROVED", user: { login: "justnero-alternative" } },
  ]);
  const createReview = apiMocks.createReview();
  const dismissReview = apiMocks.dismissReview();

  await approve(
    "gh-foo",
    ghContext(),
    [{ label: "foo", owners: ["justnero"] }],
    false,
    false
  );

  expect(createReview.isDone()).toBe(false);
  expect(dismissReview.isDone()).toBe(false);
});

test("a PR is successfully approved with team requirement", async () => {
  apiMocks.getUser();
  apiMocks.getPull(200, {
    labels: [{ name: "foo" }],
    assignies: [],
    head: { sha: "675fe4aa72b4e423df2ff0fb0096a93046f83257" },
  });
  apiMocks.getReviews(200, [
    { id: 201, state: "APPROVED", user: { login: "justnero" } },
  ]);
  apiMocks.getTeamMembers("org", "team", 200, [{ login: "justnero" }]);
  const createReview = apiMocks.createReview();

  await approve(
    "gh-foo",
    ghContext(),
    [{ label: "foo", owners: ["org/team"] }],
    false,
    false
  );

  expect(createReview.isDone()).toBe(true);
});

test("a PR approval is successfully dismissed with team requirement", async () => {
  apiMocks.getUser();
  apiMocks.getPull(200, {
    labels: [{ name: "foo" }],
    assignies: [],
    head: { sha: "675fe4aa72b4e423df2ff0fb0096a93046f83257" },
  });
  apiMocks.getReviews(200, [
    { id: 202, state: "APPROVED", user: { login: "justnero-bot" } },
  ]);
  apiMocks.getTeamMembers("org", "team", 200, [{ login: "justnero" }]);
  const dismissReview = apiMocks.dismissReview();

  await approve(
    "gh-foo",
    ghContext(),
    [{ label: "foo", owners: ["org/team"] }],
    false,
    false
  );

  expect(dismissReview.isDone()).toBe(true);
});

test("a PR is not approved when requirement is not satisfied with team requirement", async () => {
  apiMocks.getUser();
  apiMocks.getPull(200, {
    labels: [{ name: "foo" }],
    assignies: [],
    head: { sha: "675fe4aa72b4e423df2ff0fb0096a93046f83257" },
  });
  apiMocks.getReviews(200, [
    { id: 200, state: "APPROVED", user: { login: "justnero-alternative" } },
  ]);
  apiMocks.getTeamMembers("org", "team", 200, [{ login: "justnero" }]);
  const createReview = apiMocks.createReview();
  const dismissReview = apiMocks.dismissReview();

  await approve(
    "gh-foo",
    ghContext(),
    [{ label: "foo", owners: ["org/team"] }],
    false,
    false
  );

  expect(createReview.isDone()).toBe(false);
  expect(dismissReview.isDone()).toBe(false);
});

test("a PR is successfully approved with multiple requirements", async () => {
  apiMocks.getUser();
  apiMocks.getPull(200, {
    labels: [{ name: "foo" }, { name: "bar" }],
    assignies: [],
    head: { sha: "675fe4aa72b4e423df2ff0fb0096a93046f83257" },
  });
  apiMocks.getReviews(200, [
    { id: 200, state: "APPROVED", user: { login: "justnero-backend" } },
    { id: 201, state: "APPROVED", user: { login: "justnero-frontend" } },
  ]);
  apiMocks.getTeamMembers("org", "backend", 200, [
    { login: "justnero-backend" },
  ]);
  apiMocks.getTeamMembers("org", "frontend", 200, [
    { login: "justnero-frontend" },
  ]);
  const createReview = apiMocks.createReview();

  await approve(
    "gh-foo",
    ghContext(),
    [
      { label: "foo", owners: ["org/backend"] },
      { label: "bar", owners: ["org/frontend"] },
    ],
    false,
    false
  );

  expect(createReview.isDone()).toBe(true);
});

test("a PR is successfully approved with multiple requirements and overlapping teams", async () => {
  apiMocks.getUser();
  apiMocks.getPull(200, {
    labels: [{ name: "foo" }, { name: "bar" }],
    assignies: [],
    head: { sha: "675fe4aa72b4e423df2ff0fb0096a93046f83257" },
  });
  apiMocks.getReviews(200, [
    { id: 201, state: "APPROVED", user: { login: "justnero" } },
  ]);
  apiMocks.getTeamMembers("org", "backend", 200, [
    { login: "justnero-backend" },
    { login: "justnero" },
  ]);
  apiMocks.getTeamMembers("org", "frontend", 200, [
    { login: "justnero-frontend" },
    { login: "justnero" },
  ]);
  const createReview = apiMocks.createReview();

  await approve(
    "gh-foo",
    ghContext(),
    [
      { label: "foo", owners: ["org/backend"] },
      { label: "bar", owners: ["org/frontend"] },
    ],
    false,
    false
  );

  expect(createReview.isDone()).toBe(true);
});

test("a PR approval is successfully dismissed with multiple requirements", async () => {
  apiMocks.getUser();
  apiMocks.getPull(200, {
    labels: [{ name: "foo" }, { name: "bar" }],
    assignies: [],
    head: { sha: "675fe4aa72b4e423df2ff0fb0096a93046f83257" },
  });
  apiMocks.getReviews(200, [
    { id: 201, state: "APPROVED", user: { login: "justnero-backend" } },
    { id: 202, state: "APPROVED", user: { login: "justnero-bot" } },
  ]);
  apiMocks.getTeamMembers("org", "backend", 200, [
    { login: "justnero-backend" },
  ]);
  apiMocks.getTeamMembers("org", "frontend", 200, [
    { login: "justnero-frontend" },
  ]);
  const dismissReview = apiMocks.dismissReview();

  await approve(
    "gh-foo",
    ghContext(),
    [
      { label: "foo", owners: ["org/backend"] },
      { label: "bar", owners: ["org/frontend"] },
    ],
    false,
    false
  );

  expect(dismissReview.isDone()).toBe(true);
});

test("a PR is not approved when requirement is not satisfied with multiple requirements", async () => {
  apiMocks.getUser();
  apiMocks.getPull(200, {
    labels: [{ name: "foo" }, { name: "bar" }],
    assignies: [],
    head: { sha: "675fe4aa72b4e423df2ff0fb0096a93046f83257" },
  });
  apiMocks.getReviews(200, [
    { id: 201, state: "APPROVED", user: { login: "justnero-frontend" } },
  ]);
  apiMocks.getTeamMembers("org", "team", 200, [{ login: "justnero" }]);
  apiMocks.getTeamMembers("org", "backend", 200, [
    { login: "justnero-backend" },
  ]);
  apiMocks.getTeamMembers("org", "frontend", 200, [
    { login: "justnero-frontend" },
  ]);
  const createReview = apiMocks.createReview();
  const dismissReview = apiMocks.dismissReview();

  await approve(
    "gh-foo",
    ghContext(),
    [
      { label: "foo", owners: ["org/backend"] },
      { label: "bar", owners: ["org/frontend"] },
    ],
    false,
    false
  );

  expect(createReview.isDone()).toBe(false);
  expect(dismissReview.isDone()).toBe(false);
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
