const assert = require("node:assert/strict");
const { test } = require("node:test");

interface ProposalPage {
  proposals: Array<{ id: number; status: string }>;
  nextCursor: number;
}

function appendPage(existing: ProposalPage["proposals"], page: ProposalPage) {
  return {
    proposals: [...existing, ...page.proposals],
    nextCursor: page.nextCursor === 0 ? null : page.nextCursor,
  };
}

test("proposal pages append boundary records without duplicates or gaps", () => {
  const first = appendPage([], {
    proposals: [{ id: 1, status: "Active" }, { id: 2, status: "Active" }],
    nextCursor: 2,
  });
  const last = appendPage(first.proposals, { proposals: [{ id: 3, status: "Executed" }], nextCursor: 0 });

  assert.deepEqual(last.proposals.map((proposal) => proposal.id), [1, 2, 3]);
  assert.equal(last.nextCursor, null);
});

test("an empty terminal proposal page disables further loading", () => {
  const terminal = appendPage([], { proposals: [], nextCursor: 0 });

  assert.deepEqual(terminal.proposals, []);
  assert.equal(terminal.nextCursor, null);
});

test("terminal proposal statuses remain available in paginated results", () => {
  const page = appendPage([], {
    proposals: [
      { id: 1, status: "Executed" },
      { id: 2, status: "Rejected" },
      { id: 3, status: "Expired" },
    ],
    nextCursor: 0,
  });

  assert.deepEqual(page.proposals.map((proposal) => proposal.status), ["Executed", "Rejected", "Expired"]);
});
