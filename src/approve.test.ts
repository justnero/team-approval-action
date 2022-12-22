import * as core from "@actions/core";
import { Context } from "@actions/github/lib/context";
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
        assignees: [],
      }
    ),
  getReviews: (status?: number, body?: any) => {
    // Emulate data on the second page for pagination
    apiNock
      .get("/repos/justnero/test/pulls/101/reviews?per_page=100")
      .reply(status ?? 200, [], {
        link: '<https://api.github.com/repos/justnero/test/pulls/101/reviews?per_page=100&page=2>; rel="next", <https://api.github.com/repos/justnero/test/pulls/101/reviews?per_page=100&page=2>; rel="last"',
      });
    apiNock
      .get("/repos/justnero/test/pulls/101/reviews?per_page=100&page=2")
      .reply(status ?? 200, body ?? []);
  },
  getTeamMembers: (
    org?: string,
    teamSlug?: string,
    status?: number,
    body?: any
  ) => {
    // Emulate data on the second page for pagination
    const path = `/orgs/${org ?? "org"}/teams/${
      teamSlug ?? "team"
    }/members?per_page=100`;
    apiNock.get(path).reply(status ?? 200, [], {
      link: `<https://api.github.com${path}&page=2>; rel="next", <https://api.github.com${path}&page=2>; rel="last"`,
    });
    apiNock.get(`${path}&page=2`).reply(status ?? 200, body ?? []);
  },
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

  await approve("gh-foo", ghContext(), [], false, false, 0);

  expect(createReview.isDone()).toBe(false);
});

test("a PR is successfully approved with no requirements", async () => {
  apiMocks.getUser();
  apiMocks.getPull();
  apiMocks.getReviews();
  const createReview = apiMocks.createReview();

  await approve("gh-foo", ghContext(), [], true, false, 0);

  expect(createReview.isDone()).toBe(true);
});

test("a PR is successfully approved", async () => {
  apiMocks.getUser();
  apiMocks.getPull(200, {
    labels: [{ name: "foo" }],
    assignees: [],
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
    false,
    0
  );

  expect(createReview.isDone()).toBe(true);
});

test("a PR approval is successfully dismissed", async () => {
  apiMocks.getUser();
  apiMocks.getPull(200, {
    labels: [{ name: "foo" }],
    assignees: [],
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
    false,
    0
  );

  expect(dismissReview.isDone()).toBe(true);
});

test("a PR is not approved when requirement is not satisfied", async () => {
  apiMocks.getUser();
  apiMocks.getPull(200, {
    labels: [{ name: "foo" }],
    assignees: [],
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
    false,
    0
  );

  expect(createReview.isDone()).toBe(false);
  expect(dismissReview.isDone()).toBe(false);
});

test("a PR is successfully approved with team requirement", async () => {
  apiMocks.getUser();
  apiMocks.getPull(200, {
    labels: [{ name: "foo" }],
    assignees: [],
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
    false,
    0
  );

  expect(createReview.isDone()).toBe(true);
});

test("a PR approval is successfully dismissed with team requirement", async () => {
  apiMocks.getUser();
  apiMocks.getPull(200, {
    labels: [{ name: "foo" }],
    assignees: [],
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
    false,
    0
  );

  expect(dismissReview.isDone()).toBe(true);
});

test("a PR is not approved when requirement is not satisfied with team requirement", async () => {
  apiMocks.getUser();
  apiMocks.getPull(200, {
    labels: [{ name: "foo" }],
    assignees: [],
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
    false,
    0
  );

  expect(createReview.isDone()).toBe(false);
  expect(dismissReview.isDone()).toBe(false);
});

test("a PR is successfully approved with multiple requirements", async () => {
  apiMocks.getUser();
  apiMocks.getPull(200, {
    labels: [{ name: "foo" }, { name: "bar" }],
    assignees: [],
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
    false,
    0
  );

  expect(createReview.isDone()).toBe(true);
});

test("a PR is successfully approved with multiple requirements and overlapping teams", async () => {
  apiMocks.getUser();
  apiMocks.getPull(200, {
    labels: [{ name: "foo" }, { name: "bar" }],
    assignees: [],
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
    false,
    0
  );

  expect(createReview.isDone()).toBe(true);
});

test("a PR approval is successfully dismissed with multiple requirements", async () => {
  apiMocks.getUser();
  apiMocks.getPull(200, {
    labels: [{ name: "foo" }, { name: "bar" }],
    assignees: [],
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
    false,
    0
  );

  expect(dismissReview.isDone()).toBe(true);
});

test("a PR is not approved when requirement is not satisfied with multiple requirements", async () => {
  apiMocks.getUser();
  apiMocks.getPull(200, {
    labels: [{ name: "foo" }, { name: "bar" }],
    assignees: [],
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
    false,
    0
  );

  expect(createReview.isDone()).toBe(false);
  expect(dismissReview.isDone()).toBe(false);
});

test("a PR is not approved with only assignee approval", async () => {
  apiMocks.getUser();
  apiMocks.getPull(200, {
    labels: [{ name: "foo" }],
    assignees: [{ login: "justnero" }],
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
    true,
    0
  );

  expect(createReview.isDone()).toBe(false);
});

test("a PR approval is dismissed with only assignee approval", async () => {
  apiMocks.getUser();
  apiMocks.getPull(200, {
    labels: [{ name: "foo" }],
    assignees: [{ login: "justnero" }],
  });
  apiMocks.getReviews(200, [
    { id: 201, state: "APPROVED", user: { login: "justnero" } },
    { id: 202, state: "APPROVED", user: { login: "justnero-bot" } },
  ]);
  const dismissReview = apiMocks.dismissReview();

  await approve(
    "gh-foo",
    ghContext(),
    [{ label: "foo", owners: ["justnero"] }],
    false,
    true,
    0
  );

  expect(dismissReview.isDone()).toBe(true);
});

test("a PR is not approved when minimum approvals is not satisfied", async () => {
  apiMocks.getUser();
  apiMocks.getPull(200, {
    labels: [{ name: "foo" }],
    assignees: [],
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
    true,
    2
  );

  expect(createReview.isDone()).toBe(false);
});

test("a PR is successfully approved when minimum approvals is satisfied", async () => {
  apiMocks.getUser();
  apiMocks.getPull(200, {
    labels: [{ name: "foo" }],
    assignees: [],
  });
  apiMocks.getReviews(200, [
    { id: 200, state: "APPROVED", user: { login: "justnero-backend" } },
    { id: 201, state: "APPROVED", user: { login: "justnero" } },
  ]);
  const createReview = apiMocks.createReview();

  await approve(
    "gh-foo",
    ghContext(),
    [{ label: "foo", owners: ["justnero"] }],
    false,
    true,
    2
  );

  expect(createReview.isDone()).toBe(true);
});

test("a PR is not approved when minimum approvals is not satisfied due to assignee approval", async () => {
  apiMocks.getUser();
  apiMocks.getPull(200, {
    labels: [{ name: "foo" }],
    assignees: [{ login: "justnero-backend" }],
  });
  apiMocks.getReviews(200, [
    { id: 200, state: "APPROVED", user: { login: "justnero-backend" } },
    { id: 201, state: "APPROVED", user: { login: "justnero" } },
  ]);
  const createReview = apiMocks.createReview();

  await approve(
    "gh-foo",
    ghContext(),
    [{ label: "foo", owners: ["justnero"] }],
    false,
    true,
    2
  );

  expect(createReview.isDone()).toBe(false);
});

test("a PR approval is dismissed when minimum approvals is not satisfied due to assignee approval", async () => {
  apiMocks.getUser();
  apiMocks.getPull(200, {
    labels: [{ name: "foo" }],
    assignees: [{ login: "justnero-backend" }],
  });
  apiMocks.getReviews(200, [
    { id: 200, state: "APPROVED", user: { login: "justnero-backend" } },
    { id: 201, state: "APPROVED", user: { login: "justnero" } },
    { id: 202, state: "APPROVED", user: { login: "justnero-bot" } },
  ]);
  const dismissReview = apiMocks.dismissReview();

  await approve(
    "gh-foo",
    ghContext(),
    [{ label: "foo", owners: ["justnero"] }],
    false,
    true,
    2
  );

  expect(dismissReview.isDone()).toBe(true);
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
