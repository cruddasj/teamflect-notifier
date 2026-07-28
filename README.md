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

## API-key privacy

The API key is held in browser memory only. The browser includes it in each
request to the local server, which immediately forwards it in Teamflect's
`x-api-key` header. The application does not persist, cache, or log the key and
does not require a database or `.env` file.

The local server proxies only:

- `GET /users/GetUsers`
- `POST /feedback/sendFeedbackRequest`
