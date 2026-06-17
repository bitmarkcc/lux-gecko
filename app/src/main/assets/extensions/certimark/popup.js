function showHash(hex) {
  return hex || '';
}

function showTrustSignerPrompt(pubkey, tabId) {
  var content = document.getElementById('content');
  content.innerHTML = '<div class="domain">Trust this signing key?</div>'
    + '<div class="cert-info"><span class="label">Public key:</span><div class="value" style="margin-top:4px;">' + pubkey + copyBtn(pubkey) + '</div></div>'
    + '<p style="color:#A6ADC8;font-size:24px;margin:10px 0;">If you trust this key, certificates signed by it will show a green shield.</p>'
    + '<button class="btn" id="trust-yes" style="margin-right:8px;border-color:#2E7D32;color:#A6E3A1;">Yes, trust</button>'
    + '<button class="btn" id="trust-no">No</button>';

  document.getElementById('trust-yes').addEventListener('click', function() {
    browser.runtime.sendMessage({ type: 'trustSigner', pubkey: pubkey, tabId: tabId }).then(function() {
      content.innerHTML = '<div class="status green"><span class="status-icon">&#10004;</span><span class="status-text">Key trusted. Certificates signed by this key will show a green shield.</span></div>';
    });
  });

  document.getElementById('trust-no').addEventListener('click', function() {
    window.close();
  });
}

function renderSignerInfo(certDetails, signerPubkeys, tabId) {
  if (!signerPubkeys || signerPubkeys.length === 0) return;

  var signerDiv = document.createElement('div');
  signerDiv.className = 'cert-info';

  var html = '<span class="label">Signed by: </span>';
  html += '<a href="#" class="signer-link" data-pubkey="' + signerPubkeys[0] + '">' + signerPubkeys[0] + '</a>';
  if (signerPubkeys.length > 1) {
    html += ' <a href="#" id="expand-signers">and ' + (signerPubkeys.length - 1) + ' more</a>';
  }
  html += '<div id="all-signers" style="display:none">';
  var max = Math.min(signerPubkeys.length, 1024);
  for (var i = 1; i < max; i++) {
    html += '<div style="margin-top:3px;"><a href="#" class="signer-link" data-pubkey="' + signerPubkeys[i] + '">' + signerPubkeys[i] + '</a></div>';
  }
  html += '</div>';

  signerDiv.innerHTML = html;
  certDetails.appendChild(signerDiv);

  // Expand handler
  var expandBtn = document.getElementById('expand-signers');
  if (expandBtn) {
    expandBtn.addEventListener('click', function(e) {
      e.preventDefault();
      document.getElementById('all-signers').style.display = 'block';
      this.style.display = 'none';
    });
  }

  // Signer link handlers
  var signerLinks = signerDiv.querySelectorAll('.signer-link');
  for (var i = 0; i < signerLinks.length; i++) {
    signerLinks[i].addEventListener('click', function(e) {
      e.preventDefault();
      showTrustSignerPrompt(this.getAttribute('data-pubkey'), tabId);
    });
  }
}

const DEFAULT_MARK_URL = 'https://xmark.cc';

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, function(c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
  });
}

// Small copy-to-clipboard button shown next to certificate hashes and keys.
var COPY_SVG = '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-0.15em"><rect x="9" y="9" width="11" height="11" rx="2"></rect><path d="M5 15V5a2 2 0 0 1 2-2h10"></path></svg>';

function copyBtn(text) {
  if (!text) return '';
  return ' <button class="copy-btn" type="button" data-copy="' + escapeHtml(text) + '" title="Copy">' + COPY_SVG + '</button>';
}

function copyText(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).catch(function() { fallbackCopy(text); });
  } else {
    fallbackCopy(text);
  }
}

function fallbackCopy(text) {
  var ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); } catch (e) {}
  document.body.removeChild(ta);
}

function getMarkUrl() {
  return browser.storage.local.get('markUrl')
    .then(function(r) { return r.markUrl || DEFAULT_MARK_URL; })
    .catch(function() { return DEFAULT_MARK_URL; });
}

// Source description: the <meta name="description"> content, else the page
// title, else the page URL.
function getPageDesc(tab) {
  return browser.tabs.executeScript(tab.id, {
    code: 'var m=document.querySelector(\'meta[name="description"]\');(m&&m.content)?m.content:"";'
  }).then(function(res) {
    var d = (res && res.length && res[0]) ? res[0] : '';
    if (d && d.trim()) return d;
    if (tab.title && tab.title.trim()) return tab.title;
    return tab.url || '';
  }).catch(function() {
    return (tab.title && tab.title.trim()) ? tab.title : (tab.url || '');
  });
}

// Normalize a description for marking: non-alphanumeric/dash characters become
// spaces, runs of spaces collapse to one, lowercase, capped at 92 chars.
function processDesc(s) {
  var out = (s || '').replace(/[^A-Za-z0-9-]+/g, ' ');
  out = out.replace(/ {2,}/g, ' ').trim().toLowerCase();
  return out.slice(0, 92);
}

// "Mark" button: sends a markdesclink request to the marking server with the
// page description, the address-bar URL, and the loaded cert's sha256 hash.
function setupMarkButton(tab, state) {
  var btn = document.getElementById('mark-btn');
  var result = document.getElementById('mark-result');
  var descInput = document.getElementById('mark-desc');
  if (!btn) return;

  // Pre-fill the editable description preview with the normalized description.
  if (descInput) {
    getPageDesc(tab).then(function(d) {
      descInput.value = processDesc(d);
    });
    // On phones the on-screen keyboard can cover the textarea; scroll it into
    // view once the keyboard has appeared (body has extra bottom padding).
    descInput.addEventListener('focus', function() {
      setTimeout(function() {
        descInput.scrollIntoView({ block: 'start' });
      }, 300);
    });
  }

  btn.addEventListener('click', function() {
    result.className = '';
    result.textContent = '';
    var link = tab.url;
    var desc = descInput ? descInput.value.trim() : '';
    var isOnion = false;
    try { isOnion = new URL(link).hostname.endsWith('.onion'); } catch (e) {}
    var cert = state && state.browserCertHash;
    if (!desc) {
      result.className = 'mark-err';
      result.innerHTML = '&#10008; Description is empty';
      return;
    }
    // Onion links encode their identity (cert) in the address, so no cert is
    // needed; everything else requires the loaded certificate.
    if (!isOnion && !cert) {
      result.className = 'mark-err';
      result.innerHTML = '&#10008; No certificate loaded for this page';
      return;
    }
    btn.disabled = true;
    result.className = '';
    result.textContent = 'Marking…';
    getMarkUrl().then(function(markUrl) {
      var url = markUrl + '/cgi-bin/act?a=markdesclink'
        + '&desc=' + encodeURIComponent(desc)
        + '&link=' + encodeURIComponent(link);
      if (!isOnion && cert) {
        url += '&cert=' + encodeURIComponent(cert);
      }
      return fetch(url);
    }).then(function(resp) {
      return resp.json();
    }).then(function(data) {
      var ok = false, errMsg = '';
      if (data.error) {
        errMsg = data.error;
      } else if (data.bitmark_rpc_response) {
        try {
          var rpc = JSON.parse(data.bitmark_rpc_response);
          if (rpc.error) errMsg = String(rpc.error);
          else if (rpc.result) ok = true;
          else errMsg = 'unexpected marking response';
        } catch (e) { errMsg = 'could not parse marking response'; }
      } else {
        errMsg = 'unexpected response';
      }
      if (ok) {
        result.className = 'mark-ok';
        result.innerHTML = '&#10004; Marked';
      } else {
        result.className = 'mark-err';
        result.innerHTML = '&#10008; ' + escapeHtml(errMsg);
      }
    }).catch(function(e) {
      result.className = 'mark-err';
      result.innerHTML = '&#10008; ' + escapeHtml(e && e.message ? e.message : 'network error');
    }).then(function() {
      btn.disabled = false;
    });
  });
}

async function init() {
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tabs || tabs.length === 0) return;

  const tab = tabs[0];
  const state = await browser.runtime.sendMessage({ type: 'getState', tabId: tab.id });

  document.getElementById('loading').style.display = 'none';
  document.getElementById('content').style.display = 'block';

  // The mark button is available regardless of the shield state.
  setupMarkButton(tab, state);

  // Copy-to-clipboard for any cert hash / key (delegated; survives re-renders).
  document.getElementById('content').addEventListener('click', function(e) {
    var b = e.target.closest ? e.target.closest('.copy-btn') : null;
    if (!b) return;
    e.preventDefault();
    copyText(b.getAttribute('data-copy') || '');
    var t = b.getAttribute('title');
    b.classList.add('copied');
    b.setAttribute('title', 'Copied!');
    setTimeout(function() { b.classList.remove('copied'); b.setAttribute('title', t || 'Copy'); }, 1200);
  });

  const domainEl = document.getElementById('domain');
  const statusBox = document.getElementById('status-box');
  const certDetails = document.getElementById('cert-details');
  const actions = document.getElementById('actions');

  if (!state) {
    domainEl.textContent = new URL(tab.url).hostname;
    statusBox.innerHTML = '<div class="status grey"><span class="status-icon">-</span><span class="status-text">No data for this page</span></div>';
    return;
  }

  domainEl.textContent = state.domain;
  if (state.apiData && state.apiData.description) {
    var descEl = document.createElement('div');
    descEl.className = 'description';
    descEl.textContent = state.apiData.description;
    domainEl.after(descEl);
  }

  if (state.status === 'signed_trusted') {
    statusBox.innerHTML = '<div class="status green"><span class="status-icon">&#10004;</span><span class="status-text">Certificate signed by a trusted key</span></div>';

    var cert = state.apiData.certs[state.matchIndex];
    var html = '<div class="cert-info">';
    html += '<div><span class="label">Browser cert: </span><span class="value">' + showHash(state.browserCertHash) + '</span>' + copyBtn(state.browserCertHash) + '</div>';
    html += '<div><span class="label">Trusted signer: </span><span class="value">' + state.trustedSignerKey + '</span>' + copyBtn(state.trustedSignerKey) + '</div>';
    if (cert) {
      html += '<div><span class="label">Weight: </span><span class="cert-weight">' + cert.weight.toLocaleString() + '</span></div>';
    }
    html += '</div>';
    certDetails.innerHTML = html;

  } else if (state.status === 'match_top' || state.status === 'trusted') {
    var label = state.status === 'trusted' ? 'Certificate trusted by you' :
                state.keyMatch ? 'Verified (same public key)' : 'Certificate verified';
    statusBox.innerHTML = '<div class="status green"><span class="status-icon">&#10004;</span><span class="status-text">' + label + '</span></div>';

    var cert = state.status === 'trusted' ? null : state.apiData.certs[state.matchIndex];
    var html = '<div class="cert-info">';
    html += '<div><span class="label">Browser cert: </span><span class="value">' + showHash(state.browserCertHash) + '</span>' + copyBtn(state.browserCertHash) + '</div>';
    if (cert) {
      if (state.keyMatch) {
        html += '<div><span class="label">Marked cert: </span><span class="value">' + showHash(cert.hash_hex) + '</span>' + copyBtn(cert.hash_hex) + '</div>';
      }
      html += '<div><span class="label">Weight: </span><span class="cert-weight">' + cert.weight.toLocaleString() + '</span></div>';
    }
    html += '</div>';
    certDetails.innerHTML = html;

    // Show signer info for match_top too
    if (cert && cert.signerPubkeys && cert.signerPubkeys.length > 0) {
      renderSignerInfo(certDetails, cert.signerPubkeys, tab.id);
    }

  } else if (state.status === 'match_other') {
    var matchedCert = state.apiData.certs[state.matchIndex];
    var topCert = state.apiData.certs[0];

    var yellowLabel = state.keyMatch ? 'Public key matches, but not the top-weighted cert' :
                                       'Matches a marked cert, but not the top-weighted one';
    statusBox.innerHTML = '<div class="status yellow"><span class="status-icon">&#9888;</span><span class="status-text">' + yellowLabel + '</span></div>';

    var html = '<div class="cert-info">';
    html += '<div><span class="label">Browser cert: </span><span class="value">' + showHash(state.browserCertHash) + '</span>' + copyBtn(state.browserCertHash) + '</div>';
    html += '<div><span class="label">This cert weight: </span><span class="cert-weight">' + matchedCert.weight.toLocaleString() + '</span></div>';
    html += '<div><span class="label">Top cert weight: </span><span class="cert-weight">' + topCert.weight.toLocaleString() + '</span></div>';
    html += '<div><span class="label">Top cert hash: </span><span class="value">' + showHash(topCert.hash_hex) + '</span>' + copyBtn(topCert.hash_hex) + '</div>';
    html += '</div>';
    certDetails.innerHTML = html;

    // Show signer info if the matched cert is signed
    if (matchedCert.signerPubkeys && matchedCert.signerPubkeys.length > 0) {
      renderSignerInfo(certDetails, matchedCert.signerPubkeys, tab.id);
    }

    actions.innerHTML = '<button class="btn btn-trust" id="trust-btn">Trust this certificate</button>';
    document.getElementById('trust-btn').addEventListener('click', function() {
      browser.runtime.sendMessage({
        type: 'trustCert',
        tabId: tab.id,
        domain: state.domain,
        certHash: state.browserCertHash
      }).then(function() {
        statusBox.innerHTML = '<div class="status green"><span class="status-icon">&#10004;</span><span class="status-text">Certificate trusted by you</span></div>';
        actions.innerHTML = '';
      });
    });

  } else if (state.status === 'no_match') {
    statusBox.innerHTML = '<div class="status red"><span class="status-icon">&#10008;</span><span class="status-text">Certificate does NOT match any marked certificate</span></div>';

    var html = '<div class="cert-info">';
    html += '<div><span class="label">Browser cert: </span><span class="value">' + showHash(state.browserCertHash) + '</span>' + copyBtn(state.browserCertHash) + '</div>';
    html += '</div>';
    if (state.apiData && state.apiData.certs && state.apiData.certs.length > 0) {
      html += '<div class="cert-info"><div><span class="label">Marked certs:</span></div>';
      for (var i = 0; i < state.apiData.certs.length; i++) {
        var c = state.apiData.certs[i];
        html += '<div><span class="value">' + showHash(c.hash_hex) + '</span>' + copyBtn(c.hash_hex) + ' <span class="cert-weight">w:' + c.weight.toLocaleString() + '</span></div>';
      }
      html += '</div>';
    }
    certDetails.innerHTML = html;

  } else if (state.status === 'not_marked') {
    statusBox.innerHTML = '<div class="status grey"><span class="status-icon">-</span><span class="status-text">This domain has no marked certificates via Linkmark</span></div>';

    certDetails.innerHTML = '<div class="cert-info"><div><span class="label">Browser cert: </span><span class="value">' + showHash(state.browserCertHash) + '</span></div></div>';

  } else if (state.status === 'onion_secure') {
    statusBox.innerHTML = '<div class="status green"><span class="status-icon"><svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" style="width:1.6rem;height:1.6rem;vertical-align:middle"><path d="M16 7 C16 4 18 3 20 3 C19 5 18 6 16 7Z" fill="#7D4698"/><path d="M16 7 C16 5 15 4 13 4 C14 6 15 6 16 7Z" fill="#7D4698"/><path d="M16 7 C9 9 6 15 8 21 C9.5 26 13 28 16 28 C19 28 22.5 26 24 21 C26 15 23 9 16 7Z" fill="#7D4698"/><path d="M16 12 C13 14 12 18 13 22" stroke="#C9A6E0" stroke-width="1.4" fill="none" stroke-linecap="round"/><path d="M16 12 C19 14 20 18 19 22" stroke="#C9A6E0" stroke-width="1.4" fill="none" stroke-linecap="round"/></svg></span><span class="status-text">Onion address — cryptographically secure</span></div>';
    certDetails.innerHTML = '<div class="cert-info"><span class="label">This is a Tor hidden service. The address itself is derived from the service\'s cryptographic key, providing authentication without a traditional certificate.</span></div>';

  } else if (state.status === 'error') {
    statusBox.innerHTML = '<div class="status grey"><span class="status-icon">E</span><span class="status-text">Could not reach Certimark API</span></div>';
  }
}

init();
