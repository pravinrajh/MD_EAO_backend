const API = "/api/v1";

const loginPanel = document.getElementById("login-panel");
const chatPanel = document.getElementById("chat-panel");
const loginForm = document.getElementById("login-form");
const loginError = document.getElementById("login-error");
const chatForm = document.getElementById("chat-form");
const messageInput = document.getElementById("message");
const messagesEl = document.getElementById("messages");
const userLabel = document.getElementById("user-label");
const logoutBtn = document.getElementById("logout");
const geminiStatus = document.getElementById("gemini-status");
const loginGemini = document.getElementById("login-gemini");

function state() {
  return {
    token: sessionStorage.getItem("md_token") || "",
    name: sessionStorage.getItem("md_name") || "",
    conversationId: sessionStorage.getItem("md_conversation") || "",
  };
}

function saveAuth(token, name) {
  sessionStorage.setItem("md_token", token);
  sessionStorage.setItem("md_name", name);
}

function saveConversation(id) {
  if (id) sessionStorage.setItem("md_conversation", id);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function setGeminiStatus(connected) {
  const label = connected ? "Gemini connected" : "Gemini not connected";
  if (geminiStatus) {
    geminiStatus.classList.toggle("on", Boolean(connected));
    geminiStatus.classList.toggle("off", !connected);
    geminiStatus.textContent = label;
  }
  if (loginGemini) loginGemini.textContent = connected
    ? "Gemini is connected — greetings use Gemini."
    : "Gemini is not connected — greetings are local, office answers still use live data.";
}

async function api(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  const { token } = state();
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${API}${path}`, { ...options, headers });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = body.message || `Request failed (${response.status})`;
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }
  return body;
}

async function refreshGeminiStatus() {
  try {
    const body = await api("/health");
    setGeminiStatus(Boolean(body.data?.geminiConnected));
  } catch {
    geminiStatus.textContent = "Gemini status unknown";
  }
}

function showChat() {
  const { name } = state();
  loginPanel.hidden = true;
  chatPanel.hidden = false;
  userLabel.textContent = name ? `Signed in as ${name}` : "Signed in";
  if (!messagesEl.childElementCount) {
    addBubble(
      "bot",
      "Hi! You can say hello, or ask about projects, tasks, people, meetings, or sales. Business answers come from live office data.",
    );
  }
  refreshGeminiStatus();
  messageInput.focus();
}

function showLogin() {
  sessionStorage.removeItem("md_token");
  sessionStorage.removeItem("md_name");
  sessionStorage.removeItem("md_conversation");
  chatPanel.hidden = true;
  loginPanel.hidden = false;
  messagesEl.innerHTML = "";
  setGeminiStatus(false);
  geminiStatus.textContent = "Checking Gemini…";
}

function cardsFromData(data) {
  if (!data || typeof data !== "object") return "";
  const projects = Array.isArray(data.projects) ? data.projects : [];
  const tasks = Array.isArray(data.tasks) ? data.tasks : [];
  const employees = Array.isArray(data.employees) ? data.employees : [];
  const bits = [];
  for (const item of projects.slice(0, 6)) {
    bits.push(
      `<div class="card"><strong>${escapeHtml(item.projectName || item.name || "Project")}</strong><br>${escapeHtml(
        item.status || "",
      )} ${item.progress != null ? `· ${escapeHtml(item.progress)}%` : ""}</div>`,
    );
  }
  for (const item of tasks.slice(0, 6)) {
    bits.push(
      `<div class="card"><strong>${escapeHtml(item.title || "Task")}</strong><br>${escapeHtml(item.status || "")} ${escapeHtml(
        item.priority || "",
      )}</div>`,
    );
  }
  for (const item of employees.slice(0, 6)) {
    bits.push(
      `<div class="card"><strong>${escapeHtml(item.employee || item.employeeName || "Employee")}</strong><br>pending ${escapeHtml(
        item.pendingTasks ?? "",
      )} · overdue ${escapeHtml(item.overdueTasks ?? item.overdue ?? "")}</div>`,
    );
  }
  return bits.length ? `<div class="cards">${bits.join("")}</div>` : "";
}

function replyMeta(payload) {
  if (payload.intent === "SMALLTALK") {
    if (payload.data?.geminiReplied || payload.gemini?.reply) return "Friendly reply · Gemini";
    if (payload.geminiConnected) return "Friendly reply · Gemini configured";
    return "Friendly reply · Gemini not connected";
  }
  if (payload.intent === "UNSUPPORTED") return "I can help with office data";
  return [payload.mode, payload.intent].filter(Boolean).join(" · ");
}

function geminiHtml(payload) {
  const g = payload.gemini && typeof payload.gemini === "object" ? payload.gemini : payload.data?.gemini || {};
  const connected = g.connected ?? payload.geminiConnected;
  const used = Boolean(g.used || g.reply);
  const plan = g.lookupPlan ? JSON.stringify(g.lookupPlan, null, 2) : "No lookup plan for this message.";
  const english = g.english ? `<p><strong>Understood as</strong><br>${escapeHtml(g.english)}</p>` : "";
  const understood = g.understood ? `<p><strong>Intent</strong><br>${escapeHtml(g.understood)}</p>` : "";
  const spoken = g.reply ? `<p><strong>Gemini wording</strong></p><div class="bubble">${escapeHtml(g.reply)}</div>` : "";
  return `
    ${understood}
    ${english}
    <p><strong>Status</strong><br>${connected ? "Gemini connected" : "Gemini not connected"}${used ? " · used for this reply" : ""}</p>
    <p><strong>Lookup plan</strong> (safe plan, not a raw database command)</p>
    <pre>${escapeHtml(plan)}</pre>
    ${spoken}
  `;
}

function addBubble(role, text, meta = "", data, payload) {
  const row = document.createElement("div");
  row.className = `row ${role}`;
  if (role === "bot" && payload) {
    row.innerHTML = `
      <div class="tabs">
        <button type="button" class="tab on" data-tab="answer">Answer</button>
        <button type="button" class="tab" data-tab="gemini">Gemini</button>
      </div>
      <div class="tab-panel" data-panel="answer">
        <div class="bubble">${escapeHtml(text)}</div>
        ${meta ? `<div class="meta">${escapeHtml(meta)}</div>` : ""}
        ${cardsFromData(data)}
      </div>
      <div class="tab-panel" data-panel="gemini" hidden>${geminiHtml(payload)}</div>
    `;
  } else {
    row.innerHTML = `
      <div class="bubble">${escapeHtml(text)}</div>
      ${meta ? `<div class="meta">${escapeHtml(meta)}</div>` : ""}
      ${role === "bot" ? cardsFromData(data) : ""}
    `;
  }
  messagesEl.appendChild(row);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return row;
}

messagesEl.addEventListener("click", (event) => {
  const button = event.target.closest(".tab");
  if (!button) return;
  const row = button.closest(".row");
  const name = button.getAttribute("data-tab");
  row.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("on", tab === button));
  row.querySelectorAll(".tab-panel").forEach((panel) => {
    panel.hidden = panel.getAttribute("data-panel") !== name;
  });
});

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  loginError.hidden = true;
  const button = loginForm.querySelector("button");
  button.disabled = true;
  try {
    const body = await api("/auth/login", {
      method: "POST",
      body: JSON.stringify({
        email: document.getElementById("email").value.trim(),
        password: document.getElementById("password").value,
      }),
    });
    const token = body.data?.accessToken;
    const name = body.data?.user?.name || body.data?.user?.email || "MD";
    if (!token) throw new Error("Login did not return an access token");
    saveAuth(token, name);
    showChat();
  } catch (error) {
    loginError.hidden = false;
    loginError.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

chatForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const text = messageInput.value.trim();
  if (!text) return;
  messageInput.value = "";
  addBubble("user", text);
  const typing = addBubble("bot", "Thinking…");
  typing.classList.add("typing");
  chatForm.querySelector("button").disabled = true;
  try {
    const { conversationId, token } = state();
    if (!token) {
      showLogin();
      throw new Error("Please sign in again");
    }
    const body = await api("/assistant/chat", {
      method: "POST",
      body: JSON.stringify({
        message: text,
        conversationId: conversationId || undefined,
      }),
    });
    const payload = body.data || {};
    saveConversation(payload.conversationId);
    if (typeof payload.geminiConnected === "boolean") setGeminiStatus(payload.geminiConnected);
    typing.remove();
    addBubble("bot", payload.reply || "No reply returned.", replyMeta(payload), payload.data, payload);
  } catch (error) {
    typing.remove();
    if (error.status === 401) {
      showLogin();
      loginError.hidden = false;
      loginError.textContent = "Session expired. Please sign in again.";
      return;
    }
    addBubble("bot", error.message || "The assistant could not answer that.");
  } finally {
    chatForm.querySelector("button").disabled = false;
    messageInput.focus();
  }
});

logoutBtn.addEventListener("click", showLogin);

if (state().token) showChat();
else refreshGeminiStatus();
