/**
 * Content script · runs in the page context of consumer AI surfaces.
 *
 * Listens for submit events on the chat textbox and intercepts fetch
 * calls to the AI endpoints. Constructs an Event describing what the
 * user just sent, hashes the prompt locally, and asks the service
 * worker to sign a receipt.
 *
 * The receipt's payload carries the SHA-256 of the prompt — the raw
 * prompt text does not leave the page unless the user has explicitly
 * opted in via the extension popup.
 */

(function () {
  const HOST = location.hostname;
  const VENDOR = (() => {
    if (HOST.endsWith("chatgpt.com") || HOST.endsWith("openai.com")) return "openai";
    if (HOST.endsWith("claude.ai")) return "anthropic";
    if (HOST.endsWith("gemini.google.com")) return "google";
    if (HOST.endsWith("copilot.microsoft.com")) return "microsoft";
    if (HOST.endsWith("perplexity.ai")) return "perplexity";
    return "unknown";
  })();

  async function sha256Hex(s) {
    const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
    return Array.from(new Uint8Array(h)).map((x) => x.toString(16).padStart(2, "0")).join("");
  }

  function tenantFromBrowser() {
    // The user's local "tenant" is just a stable handle derived from the
    // host + a random per-install id stored in localStorage.
    let id = localStorage.getItem("pl.local_id");
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem("pl.local_id", id);
    }
    return `personal-${HOST}-${id.slice(0, 8)}`;
  }

  async function captureSubmit(promptText) {
    const event = {
      schema_version: "1.0",
      tenant_id: tenantFromBrowser(),
      event_type: "consumer.prompt",
      source_system: "browser-extension",
      event_id: "evt-" + crypto.randomUUID(),
      captured_at: new Date().toISOString(),
      context: { environment: "personal", correlation_id: location.href },
      subject: { ai_vendor: VENDOR, ai_model: "unknown" },
      payload: {
        input_hash: await sha256Hex(promptText),
        input_classification: "internal",
        input_size_bytes: promptText.length,
        metadata: { host: HOST, url_path: location.pathname },
      },
    };
    chrome.runtime.sendMessage({ type: "pl.sign", event }, (resp) => {
      if (resp?.ok) {
        document.dispatchEvent(new CustomEvent("askledger:receipt-signed", { detail: resp.receipt }));
      }
    });
  }

  // ChatGPT / Claude / Gemini all use a <textarea> or a contenteditable
  // div as the prompt input, and Enter (without Shift) or a "Send" button
  // to submit. We hook both for coverage.
  function findPromptElement() {
    return (
      document.querySelector("textarea[data-id], textarea[placeholder*='Message'], textarea[placeholder*='Reply']") ||
      document.querySelector("div[contenteditable='true']")
    );
  }

  function lastPromptText() {
    const el = findPromptElement();
    if (!el) return "";
    return el.value ?? el.textContent ?? "";
  }

  document.addEventListener(
    "keydown",
    (e) => {
      if (e.key !== "Enter" || e.shiftKey) return;
      const el = findPromptElement();
      if (!el || document.activeElement !== el) return;
      const text = lastPromptText().trim();
      if (text) captureSubmit(text);
    },
    true
  );

  document.addEventListener(
    "click",
    (e) => {
      const t = e.target;
      if (!(t instanceof Element)) return;
      const btn = t.closest("button");
      if (!btn) return;
      const label = (btn.getAttribute("aria-label") || btn.textContent || "").toLowerCase();
      if (label.includes("send") || label.includes("submit")) {
        const text = lastPromptText().trim();
        if (text) captureSubmit(text);
      }
    },
    true
  );

  console.info("[AskLedger] extension active on", VENDOR);
})();
