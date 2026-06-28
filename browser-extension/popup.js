const $ = (id) => document.getElementById(id);

function shortHash(h) { return h ? `${h.slice(0,8)}…${h.slice(-4)}` : "—"; }

function render(receipts) {
  $("totalCount").textContent = receipts.length;
  const today = new Date().toISOString().slice(0, 10);
  $("todayCount").textContent = receipts.filter(r => r.receipt.issued_at.startsWith(today)).length;
  const vendors = new Set(receipts.map(r => r.receipt.event.subject?.ai_vendor));
  $("vendorCount").textContent = vendors.size;

  const list = $("list");
  if (receipts.length === 0) {
    list.innerHTML = `<div class="empty">No receipts yet. Open ChatGPT, Claude, or Gemini and ask anything.</div>`;
    return;
  }
  list.innerHTML = receipts.slice(0, 50).map(r => {
    const vendor = r.receipt.event.subject?.ai_vendor ?? "unknown";
    const t = new Date(r.receipt.issued_at);
    const when = t.toLocaleTimeString().slice(0, 5) + " · " + t.toLocaleDateString();
    return `<div class="entry">
      <div class="row1">
        <span class="vendor">${vendor}</span>
        <span class="when">${when}</span>
      </div>
      <div class="hash">receipt_hash: ${shortHash(r.receipt.integrity.receipt_hash)}</div>
    </div>`;
  }).join("");
}

chrome.runtime.sendMessage({ type: "pl.list" }, (resp) => render(resp?.receipts ?? []));
chrome.runtime.sendMessage({ type: "pl.pubkey" }, (resp) => {
  if (resp?.public_key) $("pubkey").textContent = "pk: " + resp.public_key.slice(0, 8) + "…";
});

$("exportBtn").addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "pl.list" }, (resp) => {
    const blob = new Blob([JSON.stringify(resp?.receipts ?? [], null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    chrome.downloads.download({ url, filename: "project-ledger-receipts.json", saveAs: true });
  });
});

$("clearBtn").addEventListener("click", () => {
  if (confirm("Clear all receipts? You will lose the chain history.")) {
    chrome.runtime.sendMessage({ type: "pl.clear" }, () => location.reload());
  }
});

$("optionsBtn").addEventListener("click", () => chrome.runtime.openOptionsPage());
