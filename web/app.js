// app.js — WebLLM primary runtime with WebGPU, WASM fallback via wllama
const WEBLLM_URL = "https://unpkg.com/@mlc-ai/web-llm@0.2.79?module";
const WLLAMA_URL = "https://unpkg.com/@wllama/wllama@2.3.5/esm/wasm-from-cdn.js?module";

  const els = {
    messages: document.getElementById("messages"),
    prompt: document.getElementById("prompt"),
    send: document.getElementById("send"),
    form: document.getElementById("chat-form"),
    toolBtn: document.getElementById("btn-tool-demo"),
    initLabel: document.getElementById("init-label"),
    runtimeBadge: document.getElementById("runtime-badge"),
    settingsDlg: document.getElementById("settings"),
    settingsBtn: document.getElementById("btn-settings"),
    closeSettingsBtn: document.getElementById("btn-close-settings"),
    modelSelect: document.getElementById("model-select"),
    reloadModelBtn: document.getElementById("btn-reload-model"),
    clearBtn: document.getElementById("btn-clear"),
    themeSelect: document.getElementById("theme-select"),
    // History elements
    historyBtn: document.getElementById("btn-history"),
    historyDlg: document.getElementById("history"),
    historyList: document.getElementById("history-list"),
    histExportBtn: document.getElementById("btn-history-export"),
    histClearBtn: document.getElementById("btn-history-clear"),
    histCloseBtn: document.getElementById("btn-history-close"),
    historySearch: document.getElementById("history-search"),
  };

// --- Core state (was missing) ---
let engine = null;                   // set by init() depending on runtime
let runtime = "detecting";           // "webgpu" | "wasm"
let messages = [
  { role: "system", content: "You are a concise, helpful assistant that runs 100% locally in the user's browser." }
];
let currentModel = (els.modelSelect && els.modelSelect.value) ? els.modelSelect.value : "";

// --- Theme handling ---
const THEME_KEY = "llgpt_theme";
function applyTheme(theme) {
  // theme: 'dark' | 'light'
  const b = document.body;
  b.classList.remove("light", "dark");
  b.classList.add(theme === "light" ? "light" : "dark");
}
function loadSavedTheme() {
  return localStorage.getItem(THEME_KEY) || "dark";
}
function saveTheme(theme) {
  try { localStorage.setItem(THEME_KEY, theme); } catch {}
}
if (els.themeSelect) {
  els.themeSelect.addEventListener("change", (e) => {
    const theme = e.target.value;
    applyTheme(theme);
    saveTheme(theme);
  });
}

// --- History handling ---
const HISTORY_KEY = "llgpt_history";
function loadHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}
function saveHistory(list) {
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(list)); } catch {}
}
function deleteHistoryEntry(id) {
  const list = loadHistory().filter(e => String(e.id) !== String(id));
  saveHistory(list);
}
function addHistoryEntry({ prompt, response, model, runtime }) {
  const list = loadHistory();
  const entry = {
    id: Date.now(),
    ts: new Date().toISOString(),
    prompt,
    response,
    model,
    runtime,
  };
  list.push(entry);
  saveHistory(list);
  renderHistory();
}
function renderHistory() {
  if (!els.historyList) return;
  const q = (historyFilter || "").toLowerCase();
  let list = loadHistory();
  if (q) {
    list = list.filter(e =>
      (e.prompt && e.prompt.toLowerCase().includes(q)) ||
      (e.response && e.response.toLowerCase().includes(q)) ||
      (e.model && e.model.toLowerCase().includes(q)) ||
      (e.runtime && e.runtime.toLowerCase().includes(q))
    );
  }
  if (!list.length) {
    els.historyList.innerHTML = '<div class="empty">No history yet.</div>';
    return;
  }
  const items = [...list].reverse().map((e) => {
    const resp = (e.response || "").replace(/</g, "&lt;").slice(0, 220);
    const prm = (e.prompt || "").replace(/</g, "&lt;").slice(0, 140);
    return `
      <div class="hist-item" data-id="${e.id}">
        <div class="meta">
          <span class="ts">${new Date(e.ts).toLocaleString()}</span>
          <span class="model">${e.model || ""}</span>
          <span class="runtime">${e.runtime || ""}</span>
        </div>
        <div class="p">Q: ${prm}</div>
        <div class="r">A: ${resp}${e.response && e.response.length > 220 ? "…" : ""}</div>
        <div class="row actions">
          <button class="hist-rerun" data-id="${e.id}">Re-run</button>
          <button class="hist-copy-q" data-id="${e.id}">Copy Q</button>
          <button class="hist-copy-a" data-id="${e.id}">Copy A</button>
          <button class="hist-delete" data-id="${e.id}">Delete</button>
        </div>
      </div>`;
  }).join("");
  els.historyList.innerHTML = items;
}
function getHistoryById(id) {
  const list = loadHistory();
  return list.find(e => String(e.id) === String(id));
}
// --- UI helpers ---
function addMsg(who, text) {
  const row = document.createElement("div");
  row.className = "msg " + (who === "assistant" ? "assistant" : "user");
  const whoEl = document.createElement("div");
  whoEl.className = "who";
  whoEl.textContent = who;
  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.textContent = text;
  row.append(whoEl, bubble);
  els.messages.append(row);
  els.messages.scrollTop = els.messages.scrollHeight;
  return bubble;
}
function setBadge(txt, ok = true) {
  els.runtimeBadge.textContent = txt;
  els.runtimeBadge.style.background = ok ? "#dcfce7" : "#fee2e2";
  els.runtimeBadge.style.border = "1px solid " + (ok ? "#bbf7d0" : "#fecaca");
  els.runtimeBadge.style.color = ok ? "#14532d" : "#7f1d1d";
}

// --- Function-calling demo schema ---
const tools = [{
  type: "function",
  function: {
    name: "getTime",
    description: "Get the current local time as an ISO string.",
    parameters: {
      type: "object",
      properties: {},
    },
  },
}];

function toolRouter(name, _args) {
  if (name === "getTime") {
    return { now: new Date().toISOString() };
  }
  return { error: "Unknown tool" };
}

// --- Runtime detection + init ---
async function init() {
  // Apply theme early
  const initialTheme = loadSavedTheme();
  applyTheme(initialTheme);
  if (els.themeSelect) {
    els.themeSelect.value = initialTheme;
  }
  // Try WebGPU first
  if (navigator.gpu) {
    try {
      const webllm = await import(WEBLLM_URL);

      // Dynamically populate the model dropdown from WebLLM's prebuilt list
      try {
        const list = webllm.prebuiltAppConfig?.model_list || [];
        if (Array.isArray(list) && list.length) {
          els.modelSelect.innerHTML = "";
          for (const m of list) {
            const opt = document.createElement("option");
            opt.value = m.model_id;          // <-- guaranteed valid ID
            opt.textContent = m.model_id;
            els.modelSelect.appendChild(opt);
          }
          currentModel = els.modelSelect.value;
        }
      } catch (e) {
        console.warn("Could not populate model list:", e);
      }

      setBadge("WebGPU (WebLLM) — initializing…");
      els.initLabel.textContent = "Loading model (first run downloads weights)…";

      const engineConfig = {
        initProgressCallback: (r) => (els.initLabel.textContent = r.text || "Loading…"),
        appConfig: webllm.prebuiltAppConfig, // use the prebuilt model list
      };

      engine = await webllm.CreateMLCEngine(currentModel, engineConfig);
      runtime = "webgpu";
      setBadge("WebGPU (WebLLM)");
      els.initLabel.textContent = "Ready.";
      return;
    } catch (err) {
      console.warn("WebGPU path failed, falling back to WASM:", err);
    }
  }

  // Fallback to WASM (wllama)
  // Fallback to WASM (wllama)
  runtime = "wasm";
  setBadge("WASM (wllama) — initializing…", true);
  els.initLabel.textContent = "Loading tiny GGUF (first run downloads)…";

  // Import the CDN helper; it can be a function (returning assets) OR a ready assets object.
// inside init(), WASM fallback block in app.js
const { default: WasmFromCDN } = await import(WLLAMA_URL);
const assets = (typeof WasmFromCDN === "function") ? WasmFromCDN() : WasmFromCDN;

const { startWasmFallback } = await import("./fallback/wllama.js");
engine = await startWasmFallback({ WasmFromCDN: assets });


  setBadge("WASM (wllama)");
  els.initLabel.textContent = "Ready (fallback).";
}


async function reloadModel() {
  if (runtime !== "webgpu") return alert("Model reload only applies to WebLLM path.");
  els.initLabel.textContent = "Reloading model…";
  const webllm = await import(WEBLLM_URL);
  const cfg = { initProgressCallback: (r) => (els.initLabel.textContent = r.text || "Loading…") };
  engine = await webllm.CreateMLCEngine(currentModel, cfg);
  els.initLabel.textContent = "Ready.";
}

// --- Chat send ---
async function handleSend(prompt) {
  if (!engine) return;
  addMsg("user", prompt);
  let bubble = addMsg("assistant", "…");
  if (runtime === "webgpu") {
    const webllm = await import(WEBLLM_URL);
    messages.push({ role: "user", content: prompt });
    try {
      const chunks = await engine.chat.completions.create({
        messages,
        stream: true,
        stream_options: { include_usage: true },
        temperature: Number(document.getElementById("temperature").value || 0.7),
        seed: Number(document.getElementById("seed").value || 0),
      });
      let acc = "";
      for await (const ch of chunks) {
        const delta = ch.choices?.[0]?.delta?.content || "";
        acc += delta;
        bubble.textContent = acc;
      }
      messages.push({ role: "assistant", content: acc });
      // Save to history
      addHistoryEntry({ prompt, response: acc, model: currentModel, runtime });
    } catch (e) {
      bubble.textContent = "Error: " + e.message;
      console.error(e);
    }
} else {
  try {
    bubble.textContent = "Thinking (WASM)…";
    const out = await engine.complete(prompt, { nPredict: 128, temp: 0.7 });
    bubble.textContent = out || "(no output)";
    messages.push({ role: "assistant", content: out || "" });
    // Save to history
    addHistoryEntry({ prompt, response: out || "", model: currentModel, runtime });
  } catch (e) {
    bubble.textContent = "Error: " + e.message;
    console.error(e);
  }
}

}


els.form.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = els.prompt.value.trim();
  if (!text) return;
  els.prompt.value = "";
  handleSend(text);
});

els.toolBtn.addEventListener("click", () => { runToolDemo(); return; /* below is legacy */

  
});

els.settingsBtn.addEventListener("click", () => els.settingsDlg.showModal());
els.closeSettingsBtn?.addEventListener("click", () => els.settingsDlg.close());

els.reloadModelBtn.addEventListener("click", async (e) => {
  e.preventDefault();
  currentModel = els.modelSelect.value;
  await reloadModel();
});

els.clearBtn.addEventListener("click", () => {
  messages = [{ role: "system", content: "You are a concise, helpful assistant that runs 100% locally in the user's browser." }];
  els.messages.innerHTML = "";
});

// History dialog controls
if (els.historyBtn && els.historyDlg) {
  els.historyBtn.addEventListener("click", () => {
    renderHistory();
    els.historyDlg.showModal();
  });
}
els.histCloseBtn?.addEventListener("click", () => els.historyDlg?.close());
els.histClearBtn?.addEventListener("click", (e) => {
  e.preventDefault();
  saveHistory([]);
  renderHistory();
});
els.histExportBtn?.addEventListener("click", (e) => {
  e.preventDefault();
  const data = JSON.stringify(loadHistory(), null, 2);
  const blob = new Blob([data], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `llgpt-history-${Date.now()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
});

// Delegate clicks inside history list for Delete and Re-run
els.historyList?.addEventListener("click", (e) => {
  const target = e.target;
  if (!(target instanceof HTMLElement)) return;
  const item = target.closest('.hist-item');
  if (!item) return;
  const id = item.getAttribute('data-id');
  if (!id) return;
  if (target.classList.contains('hist-delete')) {
    e.preventDefault();
    deleteHistoryEntry(id);
    renderHistory();
  } else if (target.classList.contains('hist-rerun')) {
    e.preventDefault();
    const entry = getHistoryById(id);
    if (entry && entry.prompt) {
      els.historyDlg?.close();
      els.prompt.value = entry.prompt;
      handleSend(entry.prompt);
    }
  } else if (target.classList.contains('hist-copy-q')) {
    e.preventDefault();
    const entry = getHistoryById(id);
    if (entry) {
      navigator.clipboard?.writeText(entry.prompt || "");
    }
  } else if (target.classList.contains('hist-copy-a')) {
    e.preventDefault();
    const entry = getHistoryById(id);
    if (entry) {
      navigator.clipboard?.writeText(entry.response || "");
    }
  }
});

// History search filter
els.historySearch?.addEventListener("input", (e) => {
  const v = e.target && e.target.value ? String(e.target.value) : "";
  historyFilter = v;
  renderHistory();
});

// Kick off init
init();


async function runToolDemo() {
  if (!engine) return;
  const q = "What time is it now? If you can, call getTime().";
  addMsg("user", q);
  let bubble = addMsg("assistant", "…");

  if (runtime !== "webgpu") {
    bubble.textContent = "Tool-calling demo requires WebLLM path.";
    return;
  }
  const webllm = await import(WEBLLM_URL);
  messages.push({ role: "user", content: q });
  try {
    const reply = await engine.chat.completions.create({
      messages,
      tools,
      tool_choice: "auto",
      temperature: 0.0,
      seed: Number(document.getElementById("seed").value || 0),
    });
    const msg = reply.choices?.[0]?.message;
    if (msg && msg.tool_calls && msg.tool_calls.length > 0) {
      const call = msg.tool_calls[0];
      const toolRes = toolRouter(call.function.name, call.function.arguments ? JSON.parse(call.function.arguments) : {});
      messages.push({ role: "tool", content: JSON.stringify(toolRes), tool_call_id: call.id || "tool-1" });
      const final = await engine.chat.completions.create({ messages });
      const finalText = final.choices?.[0]?.message?.content || "(no content)";
      bubble.textContent = finalText;
      messages.push({ role: "assistant", content: finalText });
    } else {
      bubble.textContent = msg?.content || "(no tool call; model replied directly)";
      messages.push({ role: "assistant", content: msg?.content || "" });
    }
  } catch (e) {
    bubble.textContent = "Error: " + e.message;
  }
}

