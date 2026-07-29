"use strict";

const fs = require("node:fs/promises");
const http = require("node:http");
const path = require("node:path");

const DEFAULT_TEAMFLECT_API_BASE_URL = "https://api.teamflect.com/api/v1/";
const DEFAULT_PORT = 3000;
const DEFAULT_HOST = "127.0.0.1";
const MAX_BODY_BYTES = 100 * 1024;

function send(response, status, body, contentType = "application/json; charset=utf-8") {
  response.writeHead(status, {
    "content-type": contentType,
    "content-length": Buffer.byteLength(body),
  });
  response.end(body);
}

async function readBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new Error("BODY_TOO_LARGE");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function createApp(
  fetchImplementation = globalThis.fetch,
  teamflectApiBaseUrl = DEFAULT_TEAMFLECT_API_BASE_URL,
) {
  if (typeof fetchImplementation !== "function") {
    throw new TypeError("A fetch implementation is required");
  }
  const apiBaseUrl = new URL(teamflectApiBaseUrl);

  return http.createServer(async (request, response) => {
    const url = new URL(request.url, "http://localhost");
    const routes = new Map([
      ["GET /api/users/GetUsers", "user/GetUsers"],
      ["POST /api/feedback/sendFeedbackRequest", "feedback/sendFeedbackRequest"],
    ]);
    const upstreamPath = routes.get(`${request.method} ${url.pathname}`);

    if (upstreamPath) {
      const apiKey = request.headers["x-api-key"];
      if (typeof apiKey !== "string" || !apiKey.trim()) {
        return send(response, 400, JSON.stringify({ error: "The x-api-key header is required." }));
      }
      const headers = { "x-api-key": apiKey };
      const options = { method: request.method, headers };
      try {
        if (request.method === "POST") {
          const body = await readBody(request);
          JSON.parse(body);
          headers["content-type"] = "application/json";
          options.body = body;
        }
        // The browser deliberately calls this local route. Resolve the corresponding
        // operation against the Teamflect base URL before making the server-side call.
        const upstreamUrl = new URL(upstreamPath, apiBaseUrl);
        // GetUsers is paged, so preserve its documented paging query parameters.
        upstreamUrl.search = url.search;
        const upstream = await fetchImplementation(upstreamUrl, options);
        const body = Buffer.from(await upstream.arrayBuffer());
        const contentType = upstream.headers.get("content-type") || "application/octet-stream";
        response.writeHead(upstream.status, {
          "content-type": contentType,
          "content-length": body.length,
        });
        return response.end(body);
      } catch (error) {
        if (error instanceof SyntaxError) {
          return send(response, 400, JSON.stringify({ error: "The request body must be valid JSON." }));
        }
        if (error.message === "BODY_TOO_LARGE") {
          return send(response, 413, JSON.stringify({ error: "The request body is too large." }));
        }
        return send(response, 502, JSON.stringify({ error: "Teamflect could not be reached." }));
      }
    }

    const staticFiles = new Map([
      ["/", ["index.html", "text/html; charset=utf-8"]],
      ["/index.html", ["index.html", "text/html; charset=utf-8"]],
      ["/styles.css", ["styles.css", "text/css; charset=utf-8"]],
      ["/app.js", ["app.js", "text/javascript; charset=utf-8"]],
    ]);
    const staticFile = request.method === "GET" && staticFiles.get(url.pathname);
    if (staticFile) {
      try {
        const body = await fs.readFile(path.join(__dirname, staticFile[0]));
        return send(response, 200, body, staticFile[1]);
      } catch {
        return send(response, 500, "Unable to load the application.", "text/plain; charset=utf-8");
      }
    }
    return send(response, 404, JSON.stringify({ error: "Not found." }));
  });
}

if (require.main === module) {
  const port = Number.parseInt(process.env.PORT || String(DEFAULT_PORT), 10);
  const teamflectApiBaseUrl =
    process.env.TEAMFLECT_API_BASE_URL || DEFAULT_TEAMFLECT_API_BASE_URL;
  const server = createApp(globalThis.fetch, teamflectApiBaseUrl).listen(
    port,
    DEFAULT_HOST,
    () => {
      console.log(`Teamflect notifier is running at http://${DEFAULT_HOST}:${port}`);
      console.log(`Proxying Teamflect requests to ${new URL(teamflectApiBaseUrl).href}`);
    },
  );
  server.on("error", (error) => {
    console.error(`Unable to start Teamflect notifier: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { createApp };
