"use strict";

const assert = require("node:assert/strict");
const { afterEach, test } = require("node:test");
const { createApp } = require("../server");

const servers = [];
afterEach(() => Promise.all(servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve)))));

async function start(mockFetch) {
  const server = createApp(mockFetch).listen(0, "127.0.0.1");
  servers.push(server);
  await new Promise((resolve) => server.once("listening", resolve));
  return `http://127.0.0.1:${server.address().port}`;
}

test("serves the frontend", async () => {
  const origin = await start(() => { throw new Error("unexpected upstream request"); });
  const response = await fetch(origin);
  assert.equal(response.status, 200);
  assert.match(await response.text(), /Teamflect feedback requests/);
});

test("presents the template first and locks later workflow steps initially", async () => {
  const origin = await start(() => { throw new Error("unexpected upstream request"); });
  const response = await fetch(origin);
  const html = await response.text();

  assert.ok(
    html.indexOf('id="template-title-heading"') < html.indexOf('id="step1-title"'),
  );
  assert.match(html, /id="step2" class="workflow-step is-locked"[^>]*aria-disabled="true"/);
  assert.match(html, /id="step3" class="workflow-step is-locked"[^>]*aria-disabled="true"/);
  assert.match(html, /setStepLocked\(ui\.step3, !connected \|\| validatedRows === null\)/);
  assert.match(
    html,
    /validatedRows = clean;[\s\S]*?updateStepAvailability\(\);/,
  );
});

test("forwards the user operation and API key", async () => {
  let call;
  const origin = await start(async (...args) => {
    call = args;
    return new Response(JSON.stringify([{ email: "user@informed.com" }]), {
      headers: { "content-type": "application/json" },
    });
  });
  const response = await fetch(`${origin}/api/users/GetUsers`, {
    headers: { "x-api-key": "secret" },
  });
  assert.equal(response.status, 200);
  assert.equal(call[0].href, "https://api.teamflect.com/users/GetUsers");
  assert.equal(call[1].headers["x-api-key"], "secret");
});

test("forwards feedback JSON and rejects a missing key", async () => {
  let upstreamUrl;
  let options;
  const origin = await start(async (url, receivedOptions) => {
    upstreamUrl = url;
    options = receivedOptions;
    return new Response(null, { status: 204 });
  });
  const missing = await fetch(`${origin}/api/feedback/sendFeedbackRequest`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  assert.equal(missing.status, 400);

  const payload = { templateTitle: "Quarterly feedback" };
  const response = await fetch(`${origin}/api/feedback/sendFeedbackRequest`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": "secret" },
    body: JSON.stringify(payload),
  });
  assert.equal(response.status, 204);
  assert.equal(
    upstreamUrl.href,
    "https://api.teamflect.com/feedback/sendFeedbackRequest",
  );
  assert.deepEqual(JSON.parse(options.body), payload);
});

test("resolves operations against a configured Teamflect base URL", async () => {
  let upstreamUrl;
  const server = createApp(
    async (url) => {
      upstreamUrl = url;
      return new Response("[]", {
        headers: { "content-type": "application/json" },
      });
    },
    "https://teamflect.example.test/integration/",
  ).listen(0, "127.0.0.1");
  servers.push(server);
  await new Promise((resolve) => server.once("listening", resolve));

  const response = await fetch(
    `http://127.0.0.1:${server.address().port}/api/users/GetUsers`,
    { headers: { "x-api-key": "secret" } },
  );

  assert.equal(response.status, 200);
  assert.equal(
    upstreamUrl.href,
    "https://teamflect.example.test/integration/users/GetUsers",
  );
});

test("does not expose an arbitrary API proxy", async () => {
  const origin = await start(() => { throw new Error("unexpected upstream request"); });
  const response = await fetch(`${origin}/api/anything`, { headers: { "x-api-key": "secret" } });
  assert.equal(response.status, 404);
});
