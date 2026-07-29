# Teamflect notifier

A local browser interface for validating a feedback-request CSV and sending the
requests through Teamflect. The Node.js server serves the interface and exposes
only the two Teamflect operations the interface needs, avoiding browser CORS
restrictions.

## Run locally

Install [Node.js 18 or newer](https://nodejs.org/), then run:

```bash
npm install
npm start
```

Open <http://127.0.0.1:3000>, enter your Teamflect integration API key, and
follow the three steps shown in the page. Set `PORT` before `npm start` to use a
different port; the server always binds to the loopback interface.

In the browser's network tools, requests are expected to go to local URLs such
as `http://127.0.0.1:3000/api/users/GetUsers`. The local server resolves those
routes against `https://api.teamflect.com/` and makes the Teamflect request
server-side. A different frontend/static-file server will return 404 for these
proxy routes, so open the application through the URL printed by `npm start`.

For development against another compatible API endpoint, set
`TEAMFLECT_API_BASE_URL` before starting the server. The value is treated as a
base URL, so include a trailing slash when it contains a path:

```bash
TEAMFLECT_API_BASE_URL=https://example.test/integration/ npm start
```

## API-key privacy

The API key is held in browser memory only. The browser includes it in each
request to the local server, which immediately forwards it in Teamflect's
`x-api-key` header. The application does not persist, cache, or log the key and
does not require a database or `.env` file.

The local server proxies only these operations. Query parameters on `GetUsers`
are forwarded so the browser can retrieve every page of the user directory:

- `GET /user/GetUsers`
- `POST /feedback/sendFeedbackRequest`
