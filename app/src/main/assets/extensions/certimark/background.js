// Per-tab state: { domain, browserCertHash, apiResponse, matchIndex }
const tabState = {};
const topHost = {}; // tab -> navigated top-level host
const topPath = {}; // tab -> navigated top-level path

// API response cache: domain -> { data, timestamp }
const apiCache = {};
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

const DEFAULT_API_URL = 'https://certimark.cc';
const DEFAULT_API_PUBKEY_HASH = '512d578c6ea650c92361c8e20c8acaa1b3e9bf062a2aea839343d709b0ea3cf7';
const DEFAULT_MARK_URL = 'https://xmark.cc';
const DEFAULT_MARK_PUBKEY_HASH = 'a924a21bdecec29dff228fb13d36394f010c399d39bd9abd17a0ca7c349ce96d';

async function getApiUrl() {
  try {
    const result = await browser.storage.local.get('apiUrl');
    return result.apiUrl || DEFAULT_API_URL;
  } catch (e) {
    return DEFAULT_API_URL;
  }
}

async function getApiPubkeyHash() {
  try {
    const result = await browser.storage.local.get('apiPubkeyHash');
    return result.apiPubkeyHash || DEFAULT_API_PUBKEY_HASH;
  } catch (e) {
    return DEFAULT_API_PUBKEY_HASH;
  }
}

async function getTrustedCerts() {
  try {
    const result = await browser.storage.local.get('trustedCerts');
    return result.trustedCerts || {};
  } catch (e) {
    return {};
  }
}

async function getTrustedSigners() {
  try {
    const result = await browser.storage.local.get('trustedSigners');
    return result.trustedSigners || {};
  } catch (e) {
    return {};
  }
}

function normalizeFingerprintHex(fp) {
  // Firefox fingerprint format: "AA:BB:CC:..." -> "aabbcc..."
  return fp.replace(/:/g, '').toLowerCase();
}

function pemToDER(pemBytes) {
  var pem = new TextDecoder().decode(pemBytes);
  var lines = pem.split('\n');
  var b64 = '';
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (line.indexOf('-----') === 0) continue;
    b64 += line;
  }
  var binary = atob(b64);
  var der = new Uint8Array(binary.length);
  for (var j = 0; j < binary.length; j++) {
    der[j] = binary.charCodeAt(j);
  }
  return der;
}

function extractSPKI(certDER) {
  var pos = 0;

  function readLength() {
    var b = certDER[pos++];
    if (b < 0x80) return b;
    var numBytes = b & 0x7f;
    var len = 0;
    for (var i = 0; i < numBytes; i++) {
      len = (len << 8) | certDER[pos++];
    }
    return len;
  }

  function skipTLV() {
    pos++; // tag
    var len = readLength();
    pos += len;
  }

  // Outer SEQUENCE
  pos++; // tag 0x30
  readLength();

  // tbsCertificate SEQUENCE
  pos++; // tag 0x30
  readLength();

  // version [0] EXPLICIT - optional (tag 0xa0)
  if (certDER[pos] === 0xa0) {
    skipTLV();
  }

  skipTLV(); // serialNumber
  skipTLV(); // signature AlgorithmIdentifier
  skipTLV(); // issuer
  skipTLV(); // validity
  skipTLV(); // subject

  // subjectPublicKeyInfo - capture full TLV
  var spkiStart = pos;
  pos++; // tag 0x30
  var spkiLen = readLength();
  var spkiEnd = pos + spkiLen;

  return certDER.slice(spkiStart, spkiEnd);
}

async function computeSPKIDigest(certDER) {
  var spki = extractSPKI(certDER);
  var hash = await crypto.subtle.digest('SHA-256', spki);
  var bytes = new Uint8Array(hash);
  var binary = '';
  for (var i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

async function queryApi(domain, path) {
  path = path || '';
  // Check cache (keyed by domain + path)
  const cacheKey = domain + '|' + path;
  const cached = apiCache[cacheKey];
  if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
    return cached.data;
  }

  const apiUrl = await getApiUrl();
  let url = apiUrl + '/check?domain=' + encodeURIComponent(domain);
  if (path) {
    url += '&path=' + encodeURIComponent(path);
  }

  try {
    const resp = await fetch(url, { method: 'GET' });
    if (!resp.ok) {
      return null;
    }
    const data = await resp.json();
    apiCache[cacheKey] = { data: data, timestamp: Date.now() };
    return data;
  } catch (e) {
    return null;
  }
}

function updateIcon(tabId, state) {
  // state: 'match_top', 'match_other', 'no_match', 'not_marked', 'error', 'trusted', 'signed_trusted', 'onion_secure'
  var color;
  switch (state) {
    case 'match_top':
    case 'trusted':
    case 'signed_trusted':
    case 'onion_secure':
      color = 'green';
      break;
    case 'match_other':
      color = 'yellow';
      break;
    case 'no_match':
      color = 'red';
      break;
    default:
      color = 'grey';
      break;
  }
  browser.browserAction.setIcon({
    tabId: tabId,
    path: {
      "16": "icons/icon-" + color + "-16.png",
      "19": "icons/icon-" + color + "-19.png",
      "32": "icons/icon-" + color + "-32.png",
      "48": "icons/icon-" + color + "-48.png"
    }
  });
}

async function checkCert(tabId, hostname, path, securityInfo) {
  if (!securityInfo || !securityInfo.certificates || securityInfo.certificates.length === 0) {
    return;
  }

  const cert = securityInfo.certificates[0];
  const fingerprint = cert.fingerprint && cert.fingerprint.sha256;
  if (!fingerprint) {
    return;
  }

  const browserCertHash = normalizeFingerprintHex(fingerprint);

  // Query API
  const apiData = await queryApi(hostname, path);

  if (!apiData || apiData.error) {
    tabState[tabId] = { domain: hostname, browserCertHash: browserCertHash, status: 'error' };
    updateIcon(tabId, 'error');
    return;
  }

  if (!apiData.marked || !apiData.certs || apiData.certs.length === 0) {
    tabState[tabId] = { domain: hostname, browserCertHash: browserCertHash, status: 'not_marked', apiData: apiData };
    updateIcon(tabId, 'not_marked');
    return;
  }

  // Check if user has trusted this cert for this domain
  const trustedCerts = await getTrustedCerts();
  const trustedKey = hostname + ':' + browserCertHash;
  if (trustedCerts[trustedKey]) {
    tabState[tabId] = { domain: hostname, browserCertHash: browserCertHash, status: 'trusted', apiData: apiData, matchIndex: -1 };
    updateIcon(tabId, 'trusted');
    return;
  }

  // Compare against marked certs (already sorted by weight desc from API)
  let matchIndex = -1;
  let keyMatch = false;
  for (let i = 0; i < apiData.certs.length; i++) {
    if (apiData.certs[i].hash_hex === browserCertHash) {
      matchIndex = i;
      break;
    }
  }

  // If no hash match, try public key comparison via cert_url
  if (matchIndex === -1) {
    const browserSPKI = cert.subjectPublicKeyInfoDigest && cert.subjectPublicKeyInfoDigest.sha256;
    if (browserSPKI) {
      for (let i = 0; i < apiData.certs.length; i++) {
        if (apiData.certs[i].cert_url) {
          try {
            const resp = await fetch(apiData.certs[i].cert_url);
            if (resp.ok) {
              const buf = await resp.arrayBuffer();
              let der = new Uint8Array(buf);
              // Handle PEM format
              if (der[0] === 0x2d) {
                der = pemToDER(der);
              }
              const spkiDigest = await computeSPKIDigest(der);
              if (spkiDigest === browserSPKI) {
                matchIndex = i;
                keyMatch = true;
                break;
              }
            }
          } catch (e) {
            // skip this cert
          }
        }
      }
    }
  }

  // Check if matched cert is signed by a trusted signer
  if (matchIndex >= 0) {
    const trustedSigners = await getTrustedSigners();
    const certSigners = apiData.certs[matchIndex].signerPubkeys || [];
    for (let k = 0; k < certSigners.length; k++) {
      if (trustedSigners[certSigners[k]]) {
        tabState[tabId] = { domain: hostname, browserCertHash: browserCertHash, status: 'signed_trusted', apiData: apiData, matchIndex: matchIndex, keyMatch: keyMatch, trustedSignerKey: certSigners[k] };
        updateIcon(tabId, 'signed_trusted');
        return;
      }
    }
  }

  if (matchIndex === 0) {
    tabState[tabId] = { domain: hostname, browserCertHash: browserCertHash, status: 'match_top', apiData: apiData, matchIndex: 0, keyMatch: keyMatch };
    updateIcon(tabId, 'match_top');
  } else if (matchIndex > 0) {
    tabState[tabId] = { domain: hostname, browserCertHash: browserCertHash, status: 'match_other', apiData: apiData, matchIndex: matchIndex, keyMatch: keyMatch };
    updateIcon(tabId, 'match_other');
  } else {
    tabState[tabId] = { domain: hostname, browserCertHash: browserCertHash, status: 'no_match', apiData: apiData, matchIndex: -1 };
    updateIcon(tabId, 'no_match');
  }
}

// Verify the API server and marking server certificates against pinned hashes.
let apiPinningFailed = false;

function hostOf(url) {
  try { return new URL(url).hostname; } catch (e) { return null; }
}

browser.webRequest.onHeadersReceived.addListener(
  async function(details) {
    const reqHost = new URL(details.url).hostname;

    // Pin both the API server (certimark.cc) and the marking server (xmark.cc)
    // against their configured pubkey hashes.
    const cfg = await browser.storage.local.get(['apiUrl', 'apiPubkeyHash', 'markUrl', 'markPubkeyHash']);
    const pins = [
      { host: hostOf(cfg.apiUrl || DEFAULT_API_URL), hash: cfg.apiPubkeyHash || DEFAULT_API_PUBKEY_HASH },
      { host: hostOf(cfg.markUrl || DEFAULT_MARK_URL), hash: cfg.markPubkeyHash || DEFAULT_MARK_PUBKEY_HASH }
    ];
    let expectedHash = null;
    for (let i = 0; i < pins.length; i++) {
      if (pins[i].host === reqHost && pins[i].hash) { expectedHash = pins[i].hash; break; }
    }
    if (!expectedHash) return; // host not pinned (or pinning disabled with empty hash)

    let secInfo;
    try {
      secInfo = await browser.webRequest.getSecurityInfo(details.requestId, { certificateChain: true });
    } catch (e) {
      return;
    }
    if (!secInfo || !secInfo.certificates || secInfo.certificates.length === 0) return;

    const spkiDigest = secInfo.certificates[0].subjectPublicKeyInfoDigest &&
                       secInfo.certificates[0].subjectPublicKeyInfoDigest.sha256;
    if (!spkiDigest) return;

    // Firefox SPKI digest is base64; convert to hex for comparison
    const binary = atob(spkiDigest);
    let hex = '';
    for (let i = 0; i < binary.length; i++) {
      hex += ('0' + binary.charCodeAt(i).toString(16)).slice(-2);
    }

    if (hex !== expectedHash.toLowerCase()) {
      console.error('Certimark: pubkey hash mismatch for ' + reqHost + '! Expected: ' + expectedHash + ' Got: ' + hex);
      apiPinningFailed = true;
      return { cancel: true };
    }
    apiPinningFailed = false;
  },
  { urls: ['https://*/*'] },
  ['blocking']
);

// Reset per-tab state at the start of each top-level navigation, so the popup
// never shows stale info from the previously visited page. .onion sites are
// end-to-end encrypted by design, so mark them secure immediately.
browser.webRequest.onBeforeRequest.addListener(
  function(details) {
    if (details.tabId < 0) return;
    try {
      const u = new URL(details.url);
      const host = u.hostname;
      topHost[details.tabId] = host;
      topPath[details.tabId] = u.pathname;
      if (host.endsWith('.onion')) {
        const tabId = details.tabId;
        tabState[tabId] = { domain: host, browserCertHash: null, status: 'onion_secure' };
        updateIcon(tabId, 'onion_secure');
        // Onion addresses are authenticated by their cryptographic name, so we
        // don't verify a cert. We still query the marking database to surface
        // the domaincert collection's description for this domain.
        queryApi(host, u.pathname).then(function(apiData) {
          if (apiData && tabState[tabId] && tabState[tabId].domain === host) {
            tabState[tabId].apiData = apiData;
          }
        });
      } else {
        delete tabState[details.tabId];
        updateIcon(details.tabId, 'not_marked'); // grey until the cert is checked
      }
    } catch (e) {}
  },
  { urls: ['<all_urls>'], types: ['main_frame'] }
);

// Capture the page's TLS certificate from the first network response on the
// top-level host. Using all request types (not just main_frame) covers
// service-worker / cached main documents (e.g. x.com) whose main_frame request
// produces no onHeadersReceived — we then read the cert from the first
// same-host sub-request, which carries the same certificate.
browser.webRequest.onHeadersReceived.addListener(
  function(details) {
    if (details.tabId < 0) return;
    let url;
    try { url = new URL(details.url); } catch (e) { return; }
    if (url.protocol !== 'https:') return;
    if (url.hostname.endsWith('.onion')) return; // handled as onion_secure
    if (url.hostname !== topHost[details.tabId]) return; // only the page's own host
    const st = tabState[details.tabId];
    if (st && st.domain === url.hostname) return; // already resolved for this host
    // Fetch the security info while the request is still suspended (GeckoView
    // releases it once the request resumes); the slower API lookup runs after.
    return browser.webRequest.getSecurityInfo(details.requestId, { certificateChain: true })
      .then(function(securityInfo) {
        checkCert(details.tabId, topHost[details.tabId], topPath[details.tabId], securityInfo);
      })
      .catch(function() {});
  },
  { urls: ['https://*/*'] },
  ['blocking']
);

// Re-apply icon when tab finishes loading
// Also handle .onion addresses which are cryptographically secure by design
browser.tabs.onUpdated.addListener(function(tabId, changeInfo, tab) {
  if (changeInfo.status === 'complete') {
    if (tabState[tabId]) {
      updateIcon(tabId, tabState[tabId].status);
    } else if (tab.url) {
      try {
        var url = new URL(tab.url);
        if (url.hostname.endsWith('.onion')) {
          tabState[tabId] = { domain: url.hostname, browserCertHash: null, status: 'onion_secure' };
          updateIcon(tabId, 'onion_secure');
        }
      } catch (e) {}
    }
  }
});

// Clean up on tab close
browser.tabs.onRemoved.addListener(function(tabId) {
  delete tabState[tabId];
});

// Revert tab states when trusted signers or certs are removed via options
browser.storage.onChanged.addListener(function(changes, areaName) {
  if (areaName !== 'local') return;
  if (changes.trustedSigners) {
    var newSigners = changes.trustedSigners.newValue || {};
    for (var tabId in tabState) {
      if (tabState[tabId].status === 'signed_trusted') {
        var signerKey = tabState[tabId].trustedSignerKey;
        if (!newSigners[signerKey]) {
          if (tabState[tabId].matchIndex === 0) {
            tabState[tabId].status = 'match_top';
          } else {
            tabState[tabId].status = 'match_other';
          }
          delete tabState[tabId].trustedSignerKey;
          updateIcon(parseInt(tabId), tabState[tabId].status);
        }
      }
    }
  }
  if (changes.trustedCerts) {
    var newCerts = changes.trustedCerts.newValue || {};
    for (var tabId in tabState) {
      if (tabState[tabId].status === 'trusted') {
        var certKey = tabState[tabId].domain + ':' + tabState[tabId].browserCertHash;
        if (!newCerts[certKey]) {
          // Re-evaluate: check if cert matches a marked cert
          var apiData = tabState[tabId].apiData;
          var browserCertHash = tabState[tabId].browserCertHash;
          var matchIndex = -1;
          if (apiData && apiData.certs) {
            for (var i = 0; i < apiData.certs.length; i++) {
              if (apiData.certs[i].hash_hex === browserCertHash) {
                matchIndex = i;
                break;
              }
            }
          }
          if (matchIndex === 0) {
            tabState[tabId].status = 'match_top';
            tabState[tabId].matchIndex = 0;
          } else if (matchIndex > 0) {
            tabState[tabId].status = 'match_other';
            tabState[tabId].matchIndex = matchIndex;
          } else {
            tabState[tabId].status = 'no_match';
            tabState[tabId].matchIndex = -1;
          }
          updateIcon(parseInt(tabId), tabState[tabId].status);
        }
      }
    }
  }
});

// Handle messages from popup
browser.runtime.onMessage.addListener(function(msg, sender, sendResponse) {
  if (msg.type === 'getState') {
    sendResponse(tabState[msg.tabId] || null);
  } else if (msg.type === 'trustCert') {
    // Save cert as trusted for this domain
    getTrustedCerts().then(function(trustedCerts) {
      const key = msg.domain + ':' + msg.certHash;
      trustedCerts[key] = true;
      browser.storage.local.set({ trustedCerts: trustedCerts }).then(function() {
        // Update badge
        tabState[msg.tabId].status = 'trusted';
        updateIcon(msg.tabId, 'trusted');
        sendResponse({ ok: true });
      });
    });
    return true; // async response
  } else if (msg.type === 'trustSigner') {
    getTrustedSigners().then(function(trustedSigners) {
      trustedSigners[msg.pubkey] = true;
      browser.storage.local.set({ trustedSigners: trustedSigners }).then(function() {
        // Update tab state to green if applicable
        if (msg.tabId && tabState[msg.tabId] && tabState[msg.tabId].matchIndex >= 0) {
          tabState[msg.tabId].status = 'signed_trusted';
          tabState[msg.tabId].trustedSignerKey = msg.pubkey;
          updateIcon(msg.tabId, 'signed_trusted');
        }
        sendResponse({ ok: true });
      });
    });
    return true; // async response
  }
});
