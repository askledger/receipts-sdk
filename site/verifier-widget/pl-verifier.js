// <pl-verifier receipt-id="01J9X..."></pl-verifier>
// Drops a verifier badge onto any web page. Renders status, kid, chain
// height, and a link to the full receipt detail at askledger.github.io/receipts-sdk/verify.html.
//
// Zero dependencies. Web Component / Custom Element. ~8 KB minified.

(function () {
  if (customElements.get("pl-verifier")) return;

  const BASE = "https://askledger.github.io/receipts-sdk/verify.html";
  const STYLES = `
    :host { display: inline-block; font-family: ui-sans-serif, system-ui, sans-serif; }
    .pl { display: inline-flex; align-items: center; gap: 8px;
          padding: 6px 12px; border-radius: 8px;
          background: #0b1c2c; color: #e9f1ff; font-size: 13px; line-height: 1;
          box-shadow: 0 1px 0 rgba(255,255,255,0.06) inset, 0 1px 2px rgba(0,0,0,0.2); }
    .pl[data-state="valid"]   .dot { background: #22c55e; }
    .pl[data-state="invalid"] .dot { background: #ef4444; }
    .pl[data-state="loading"] .dot { background: #94a3b8; animation: pulse 1.2s ease-in-out infinite; }
    .dot { width: 8px; height: 8px; border-radius: 999px; }
    a { color: inherit; text-decoration: none; opacity: 0.85; }
    a:hover { opacity: 1; text-decoration: underline; }
    @keyframes pulse { 0%,100% { opacity: 0.4 } 50% { opacity: 1 } }
  `;

  class PLVerifier extends HTMLElement {
    static get observedAttributes() { return ["receipt-id", "endpoint"]; }
    constructor() {
      super();
      this.attachShadow({ mode: "open" });
      this._root = document.createElement("div");
      this._root.className = "pl";
      this._root.dataset.state = "loading";
      const style = document.createElement("style");
      style.textContent = STYLES;
      this.shadowRoot.append(style, this._root);
    }
    connectedCallback() { this.refresh(); }
    attributeChangedCallback() { if (this.isConnected) this.refresh(); }

    async refresh() {
      const id = this.getAttribute("receipt-id");
      const endpoint = this.getAttribute("endpoint") || BASE;
      if (!id) { this.render("loading", { msg: "no receipt id" }); return; }
      this.render("loading", { msg: "verifying…" });
      try {
        const res = await fetch(`${endpoint}/api/verify/${encodeURIComponent(id)}`, {
          headers: { accept: "application/json" },
          credentials: "omit",
        });
        const json = await res.json();
        if (res.ok && json && json.valid === true) {
          this.render("valid", json);
        } else {
          this.render("invalid", json || { msg: `HTTP ${res.status}` });
        }
      } catch (e) {
        this.render("invalid", { msg: e && e.message ? e.message : "network error" });
      }
    }

    render(state, payload) {
      this._root.dataset.state = state;
      const id = this.getAttribute("receipt-id") || "";
      const short = id ? id.slice(0, 14) + "…" : "";
      const label = state === "valid" ? "AI Receipt verified"
                  : state === "invalid" ? "AI Receipt invalid"
                  : "Verifying…";
      const link = `${BASE}/?receipt_id=${encodeURIComponent(id)}`;
      const meta = payload && payload.chain_height
        ? ` · height ${payload.chain_height}` : "";
      this._root.innerHTML =
        `<span class="dot" aria-hidden="true"></span>` +
        `<a href="${link}" target="_blank" rel="noopener noreferrer">${label}${meta}</a>` +
        (short ? ` <span style="opacity:.6;font-family:ui-monospace,monospace">${short}</span>` : "");
    }
  }

  customElements.define("pl-verifier", PLVerifier);
})();
