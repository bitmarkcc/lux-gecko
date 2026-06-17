const enabledEl = document.getElementById("enabled");
const statusEl = document.getElementById("status");
const toggleStateEl = document.getElementById("toggle-state");

function updateLabel() {
  toggleStateEl.textContent = enabledEl.checked ? "On" : "Off";
  toggleStateEl.style.color = enabledEl.checked ? "#A6E3A1" : "#A6ADC8";
}

function flash(message) {
  statusEl.textContent = message;
  setTimeout(() => { statusEl.textContent = ""; }, 1500);
}

// Default is on (xmarkEnabled !== false), matching the background script.
browser.storage.local.get("xmarkEnabled").then((r) => {
  enabledEl.checked = r.xmarkEnabled !== false;
  updateLabel();
});

enabledEl.addEventListener("change", () => {
  updateLabel();
  browser.storage.local.set({ xmarkEnabled: enabledEl.checked })
    .then(() => flash(enabledEl.checked ? "Marking on" : "Marking off"));
});
