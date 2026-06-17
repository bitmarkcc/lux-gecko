const DEFAULTS = { enabled: false, host: "127.0.0.1", port: 9050 };

const enabledEl = document.getElementById("enabled");
const hostEl = document.getElementById("host");
const portEl = document.getElementById("port");
const statusEl = document.getElementById("status");
const toggleStateEl = document.getElementById("toggle-state");

function updateToggleLabel() {
  toggleStateEl.textContent = enabledEl.checked ? "On" : "Off";
  toggleStateEl.style.color = enabledEl.checked ? "#A6E3A1" : "#A6ADC8";
}

function flash(message) {
  statusEl.textContent = message;
  setTimeout(() => { statusEl.textContent = ""; }, 1500);
}

function saveConfig(message) {
  return browser.storage.local.set({
    enabled: enabledEl.checked,
    host: (hostEl.value || DEFAULTS.host).trim(),
    port: parseInt(portEl.value, 10) || DEFAULTS.port
  }).then(() => { if (message) flash(message); });
}

function restore() {
  browser.storage.local.get().then((stored) => {
    enabledEl.checked = !!stored.enabled;
    hostEl.value = stored.host || DEFAULTS.host;
    portEl.value = stored.port || DEFAULTS.port;
    updateToggleLabel();
  });
}

// Flipping the switch applies immediately — one tap to turn the proxy on/off.
enabledEl.addEventListener("change", () => {
  updateToggleLabel();
  saveConfig(enabledEl.checked ? "Proxy on" : "Proxy off");
});

// Auto-save host/port as they're edited: debounced while typing, and committed
// immediately on blur, so there's no need for a Save button.
let saveTimer = null;
[hostEl, portEl].forEach((el) => {
  el.addEventListener("input", () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => saveConfig("Saved"), 500);
  });
  el.addEventListener("change", () => {
    clearTimeout(saveTimer);
    saveConfig("Saved");
  });
});

restore();
