(() => {
  "use strict";
  // Requests stay same-origin; the local server forwards only these operations.
  const API_ORIGIN = "/api";
  const API_VALID_MESSAGE = "✓ The API key is valid.";
  const CONNECTION_FAILED_MESSAGE =
    "A successful connection could not be made.";
  const USERS_PAGE_SIZE = 100;
  const HEADERS = [
    "Feedback Subject",
    "Feedback provider 1",
    "Feedback provider 2",
    "Feedback provider 3",
    "Feedback provider 4",
    "Feedback provider 5",
  ];
  const PROVIDERS = HEADERS.slice(1);
  const $ = (id) => document.getElementById(id);
  const ui = Object.fromEntries(
    [
      "api-key",
      "show-api-key",
      "test-key",
      "connection-fields",
      "connection-status",
      "step2",
      "step3",
      "csv-fields",
      "csv-file",
      "validate-csv",
      "csv-status",
      "preview",
      "send-fields",
      "feedback-note",
      "due-days",
      "template-title",
      "send",
      "retry",
      "send-status",
      "failures",
      "template-link",
    ].map((id) => [id, $(id)]),
  );
  let usersByEmail = null,
    validatedRows = null,
    dispatching = false,
    failedRequests = [];

  const setStatus = (el, message = "", type = "") => {
    el.className = `status${type ? " " + type : ""}`;
    el.textContent = message;
  };
  const authHeaders = (json = false) => ({
    "x-api-key": ui["api-key"].value.trim(),
    ...(json ? { "Content-Type": "application/json" } : {}),
  });
  const apiFetch = (path, options = {}) =>
    fetch(`${API_ORIGIN}${path}`, options);
  const normal = (value) => value.trim().toLowerCase();
  const validInformedEmail = (value) =>
    /^[^\s@]+@informed\.com$/i.test(value.trim());
  const requestCount = (rows) =>
    rows.reduce((n, row) => n + row.providers.length, 0);

  const setStepLocked = (step, locked) => {
    step.classList.toggle("is-locked", locked);
    step.setAttribute("aria-disabled", String(locked));
  };
  const updateStepAvailability = () => {
    const connected = usersByEmail !== null;
    setStepLocked(ui.step2, !connected);
    setStepLocked(ui.step3, !connected || validatedRows === null);
  };

  function resetAfterKey() {
    usersByEmail = validatedRows = null;
    failedRequests = [];
    ui["csv-fields"].disabled = true;
    ui["csv-file"].value = "";
    ui["send-fields"].disabled = true;
    ui.send.disabled = true;
    ui.retry.hidden = true;
    setStatus(ui["connection-status"]);
    setStatus(ui["csv-status"]);
    setStatus(ui["send-status"]);
    ui.preview.replaceChildren();
    ui.failures.replaceChildren();
    updateStepAvailability();
  }
  function resetAfterFile() {
    validatedRows = null;
    failedRequests = [];
    ui["send-fields"].disabled = true;
    ui.send.disabled = true;
    ui.retry.hidden = true;
    setStatus(ui["csv-status"]);
    setStatus(ui["send-status"]);
    ui.preview.replaceChildren();
    ui.failures.replaceChildren();
    updateStepAvailability();
  }
  ui["api-key"].addEventListener("input", resetAfterKey);
  ui["csv-file"].addEventListener("change", resetAfterFile);

  const setApiKeyVisibility = (visible) => {
    ui["api-key"].type = visible ? "text" : "password";
    ui["show-api-key"].setAttribute("aria-pressed", String(visible));
  };
  ui["show-api-key"].addEventListener("pointerdown", () =>
    setApiKeyVisibility(true),
  );
  document.addEventListener("pointerup", () => setApiKeyVisibility(false));
  document.addEventListener("pointercancel", () => setApiKeyVisibility(false));
  ui["show-api-key"].addEventListener("keydown", (event) => {
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      setApiKeyVisibility(true);
    }
  });
  ui["show-api-key"].addEventListener("keyup", () =>
    setApiKeyVisibility(false),
  );
  ui["show-api-key"].addEventListener("blur", () => setApiKeyVisibility(false));

  // Step 1: authenticate once and cache the Teamflect user directory.
  const apiError = async (response) => {
    if (!response) return CONNECTION_FAILED_MESSAGE;
    const body = await response.text();
    return `HTTP ${response.status}: ${body}`;
  };

  const userCollection = (body) => {
    if (Array.isArray(body)) return body;
    for (const key of ["users", "data", "result", "items"]) {
      if (Array.isArray(body?.[key])) return body[key];
    }
    return null;
  };

  const pagingValue = (body, names) => {
    const sources = [body, body?.pagination, body?.paging, body?.meta];
    for (const source of sources) {
      for (const name of names) {
        if (source?.[name] !== undefined) return source[name];
      }
    }
    return undefined;
  };

  const hasAnotherUsersPage = (body, collection, page) => {
    const explicit = pagingValue(body, ["hasNextPage", "hasNext"]);
    if (typeof explicit === "boolean") return explicit;
    const totalPages = Number(
      pagingValue(body, ["totalPages", "pageCount", "totalPageCount"]),
    );
    if (Number.isFinite(totalPages)) return page < totalPages;
    const totalUsers = Number(
      pagingValue(body, ["totalCount", "itemCount", "count"]),
    );
    if (Number.isFinite(totalUsers)) return page * USERS_PAGE_SIZE < totalUsers;
    return collection.length === USERS_PAGE_SIZE;
  };

  async function getAllUsers() {
    const users = [];
    for (let page = 1; ; page++) {
      const query = new URLSearchParams({
        page: String(page),
        pageSize: String(USERS_PAGE_SIZE),
      });
      const response = await apiFetch(`/users/GetUsers?${query}`, {
        method: "GET",
        headers: authHeaders(),
      });
      if (!response.ok) throw new Error(await apiError(response));
      let body;
      try {
        body = await response.json();
      } catch {
        throw new SyntaxError("Malformed JSON");
      }
      const collection = userCollection(body);
      if (!collection) throw new SyntaxError("Unexpected user collection");
      users.push(...collection);
      if (!hasAnotherUsersPage(body, collection, page)) return users;
    }
  }

  ui["test-key"].addEventListener("click", async () => {
    resetAfterKey();
    if (!ui["api-key"].value.trim())
      return setStatus(
        ui["connection-status"],
        "Enter an API key first.",
        "error",
      );
    if (window.location.protocol === "file:") {
      return setStatus(
        ui["connection-status"],
        CONNECTION_FAILED_MESSAGE,
        "error",
      );
    }
    ui["connection-fields"].disabled = true;
    setStatus(ui["connection-status"], "Testing API key…");
    try {
      const collection = await getAllUsers();
      const cache = new Map();
      for (const user of collection) {
        const email =
          typeof user === "string"
            ? user
            : user?.email || user?.mail || user?.userPrincipalName || user?.upn;
        if (typeof email === "string" && email.trim())
          cache.set(normal(email), user);
      }
      if (!cache.size && collection.length)
        throw new SyntaxError("Users did not contain email addresses");
      usersByEmail = cache;
      ui["csv-fields"].disabled = false;
      updateStepAvailability();
      setStatus(
        ui["connection-status"],
        API_VALID_MESSAGE,
        "success",
      );
    } catch (error) {
      usersByEmail = null;
      setStatus(ui["connection-status"], error.message, "error");
    } finally {
      ui["connection-fields"].disabled = false;
    }
  });

  // Step 2: parse, validate, normalize, and preview the selected CSV.
  // RFC 4180-style parser: quotes escape as "", and quoted values may contain commas/newlines.
  function parseCsv(text) {
    const rows = [];
    let row = [],
      field = "",
      quoted = false,
      afterQuote = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (quoted) {
        if (c === '"') {
          if (text[i + 1] === '"') {
            field += '"';
            i++;
          } else {
            quoted = false;
            afterQuote = true;
          }
        } else field += c;
        continue;
      }
      if (afterQuote && c !== "," && c !== "\r" && c !== "\n")
        throw new Error("Unexpected character after a closing quote.");
      if (c === '"' && field === "") {
        quoted = true;
        afterQuote = false;
      } else if (c === ",") {
        row.push(field);
        field = "";
        afterQuote = false;
      } else if (c === "\n") {
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
        afterQuote = false;
      } else if (c === "\r") {
        if (text[i + 1] === "\n") i++;
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
        afterQuote = false;
      } else field += c;
    }
    if (quoted) throw new Error("Unclosed quoted field.");
    if (field || row.length) {
      row.push(field);
      rows.push(row);
    }
    return rows;
  }

  ui["validate-csv"].addEventListener("click", async () => {
    resetAfterFile();
    const file = ui["csv-file"].files[0];
    if (!usersByEmail)
      return setStatus(
        ui["csv-status"],
        "Test the API key before validating a CSV.",
        "error",
      );
    if (!file)
      return setStatus(ui["csv-status"], "Choose a CSV file first.", "error");
    try {
      let rows = parseCsv((await file.text()).replace(/^\uFEFF/, ""));
      while (rows.length && rows.at(-1).every((v) => v === "")) rows.pop();
      if (!rows.length) throw new Error("The CSV is empty.");
      if (
        rows[0].length !== HEADERS.length ||
        rows[0].some((v, i) => v !== HEADERS[i])
      )
        throw new Error(
          `Headers must appear exactly once in this order: ${HEADERS.join(", ")}.`,
        );
      const errors = [],
        clean = [];
      rows.slice(1).forEach((values, index) => {
        const rowNumber = index + 2;
        if (values.length !== HEADERS.length) {
          errors.push(
            `Row ${rowNumber}, column structure, value "${values.join(", ")}": expected exactly ${HEADERS.length} columns.`,
          );
          return;
        }
        const subject = normal(values[0]);
        if (!subject)
          errors.push(
            `Row ${rowNumber}, column ${HEADERS[0]}, value "": Feedback Subject is required.`,
          );
        else if (!validInformedEmail(subject))
          errors.push(
            `Row ${rowNumber}, column ${HEADERS[0]}, value "${values[0]}": invalid email/domain; domain must be exactly informed.com.`,
          );
        else if (!usersByEmail.has(subject))
          errors.push(
            `Row ${rowNumber}, column ${HEADERS[0]}, value "${values[0]}": absent from Teamflect.`,
          );
        const providers = [];
        PROVIDERS.forEach((name, i) => {
          const raw = values[i + 1],
            email = normal(raw);
          if (!email) return;
          if (!validInformedEmail(email))
            errors.push(
              `Row ${rowNumber}, column ${name}, value "${raw}": invalid email/domain; domain must be exactly informed.com.`,
            );
          else if (!usersByEmail.has(email))
            errors.push(
              `Row ${rowNumber}, column ${name}, value "${raw}": absent from Teamflect.`,
            );
          else providers.push(email);
        });
        if (!providers.length)
          errors.push(
            `Row ${rowNumber}, column Feedback providers, value "": at least one provider is required.`,
          );
        clean.push({ subject, providers });
      });
      if (!clean.length) errors.push("At least one data row is required.");
      if (errors.length) throw new Error(errors.join("\n"));
      validatedRows = clean;
      ui["send-fields"].disabled = false;
      ui.send.disabled = false;
      updateStepAvailability();
      setStatus(
        ui["csv-status"],
        `✓ ${clean.length} row${clean.length === 1 ? "" : "s"} validated; ${requestCount(clean)} request${requestCount(clean) === 1 ? "" : "s"} ready.`,
        "success",
      );
      renderPreview(clean);
    } catch (error) {
      setStatus(ui["csv-status"], error.message, "error");
    }
  });

  function renderPreview(rows) {
    const table = document.createElement("table"),
      cap = document.createElement("caption");
    cap.textContent = `Preview of ${Math.min(rows.length, 5)} validated row(s)`;
    table.append(cap);
    const head = document.createElement("tr");
    HEADERS.forEach((v) => {
      const th = document.createElement("th");
      th.scope = "col";
      th.textContent = v;
      head.append(th);
    });
    const thead = document.createElement("thead");
    thead.append(head);
    table.append(thead);
    const body = document.createElement("tbody");
    rows.slice(0, 5).forEach((r) => {
      const tr = document.createElement("tr");
      [
        r.subject,
        ...r.providers,
        ...Array(5 - r.providers.length).fill(""),
      ].forEach((v) => {
        const td = document.createElement("td");
        td.textContent = v;
        tr.append(td);
      });
      body.append(tr);
    });
    table.append(body);
    ui.preview.replaceChildren(table);
  }

  function validateSendFields() {
    const note = ui["feedback-note"].value.trim(),
      title = ui["template-title"].value.trim(),
      due = Number(ui["due-days"].value);
    if (!note) throw new Error("Feedback note is required.");
    if (!Number.isInteger(due) || due < 1)
      throw new Error("Due date must be a positive whole number.");
    if (!title) throw new Error("Template title is required.");
    return { note, title, due };
  }
  const allRequests = () =>
    validatedRows.flatMap((row) =>
      row.providers.map((provider) => ({ subject: row.subject, provider })),
    );

  // Step 3: confirm and dispatch each request while retaining individual results.
  ui.send.addEventListener("click", () => startDispatch(allRequests(), false));
  ui.retry.addEventListener("click", () =>
    startDispatch([...failedRequests], true),
  );
  async function startDispatch(requests, isRetry) {
    if (dispatching || !validatedRows || !usersByEmail) return;
    let fields;
    try {
      fields = validateSendFields();
    } catch (e) {
      return setStatus(ui["send-status"], e.message, "error");
    }
    if (!requests.length) return;
    if (
      !confirm(
        `${isRetry ? "Retry" : "Create"} ${requests.length} feedback request${requests.length === 1 ? "" : "s"}?\n\nOnly continue if you are sure; sending twice may create duplicates.`,
      )
    )
      return;
    dispatching = true;
    failedRequests = [];
    ui["connection-fields"].disabled =
      ui["csv-fields"].disabled =
      ui["send-fields"].disabled =
        true;
    ui.retry.hidden = true;
    ui.failures.replaceChildren();
    let completed = 0,
      successful = 0;
    for (const request of requests) {
      setStatus(
        ui["send-status"],
        `Sending… ${completed}/${requests.length} completed.`,
      );
      let response;
      try {
        response = await apiFetch("/feedback/sendFeedbackRequest", {
          method: "POST",
          headers: authHeaders(true),
          body: JSON.stringify({
            feedbackAboutUPNorId: request.subject,
            feedbackRequestReceiverUPNorId: request.provider,
            feedbackNote: fields.note,
            dueDateInDays: fields.due,
            templateTitle: fields.title,
            isPrivate: true
          }),
        });
        if (!response.ok) throw new Error(await apiError(response));
        successful++;
      } catch (error) {
        failedRequests.push({ ...request, error: error.message });
      }
      completed++;
    }
    dispatching = false;
    ui["connection-fields"].disabled =
      ui["csv-fields"].disabled =
      ui["send-fields"].disabled =
        false;
    ui.send.disabled = false;
    const failed = failedRequests.length,
      summary = `Attempted: ${requests.length}. Successful: ${successful}. Failed: ${failed}.`;
    setStatus(
      ui["send-status"],
      failed
        ? `${summary} Some requests were not sent successfully.`
        : `✓ ${summary} All requests were sent successfully.`,
      failed ? "error" : "success",
    );
    renderFailures();
    ui.retry.hidden = !failed;
  }
  function renderFailures() {
    if (!failedRequests.length) return ui.failures.replaceChildren();
    const title = document.createElement("h3");
    title.textContent = "Failed requests";
    const list = document.createElement("ul");
    list.className = "failures";
    failedRequests.forEach((f) => {
      const li = document.createElement("li");
      li.textContent = `Subject ${f.subject}; provider ${f.provider}: ${f.error}`;
      list.append(li);
    });
    ui.failures.replaceChildren(title, list);
  }

  const template =
    [
      HEADERS,
      [
        "alex@informed.com",
        "jamie@informed.com",
        "morgan@informed.com",
        "",
        "",
        "",
      ],
      ["sam@informed.com", "taylor@informed.com", "", "", "", ""],
    ]
      .map((r) => r.join(","))
      .join("\r\n") + "\r\n";
  // A data URL works when the page is opened from file:// without creating a
  // separate blob origin, which some browsers reject for local-file downloads.
  ui["template-link"].href =
    `data:text/csv;charset=utf-8,${encodeURIComponent(template)}`;
})();
