// Lux Proxy
//
// Routes all traffic through a SOCKS proxy using the proxy.onRequest API.
// Configuration lives in browser.storage.local (set from the popup); defaults
// to Tor at 127.0.0.1:9050. No native messaging — same pattern as FoxyProxy.

const DEFAULTS = { enabled: false, host: "127.0.0.1", port: 9050 };
let cfg = Object.assign({}, DEFAULTS);

function loadConfig() {
  return browser.storage.local.get(DEFAULTS).then((stored) => {
    cfg = {
      enabled: !!stored.enabled,
      host: stored.host || DEFAULTS.host,
      port: parseInt(stored.port, 10) || DEFAULTS.port
    };
    return cfg;
  });
}

browser.storage.onChanged.addListener((changes, area) => {
  if (area === "local") {
    loadConfig();
  }
});

// proxy.onRequest is evaluated live per request, so config changes take effect
// immediately once loadConfig() updates `cfg`.
function handleRequest() {
  if (!cfg.enabled) {
    return { type: "direct" };
  }
  return {
    type: "socks",   // SOCKS5
    host: cfg.host,
    port: cfg.port,
    proxyDNS: true   // resolve DNS through the proxy to avoid leaks (Tor)
  };
}

browser.proxy.onRequest.addListener(handleRequest, { urls: ["<all_urls>"] });

loadConfig();
