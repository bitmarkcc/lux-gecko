async function loadSettings() {
  const result = await browser.storage.local.get(['apiUrl', 'apiPubkeyHash', 'trustedCerts', 'trustedSigners']);
  document.getElementById('api-url').value = result.apiUrl || 'https://certimark.cc';
  document.getElementById('api-pubkey-hash').value = result.apiPubkeyHash || '512d578c6ea650c92361c8e20c8acaa1b3e9bf062a2aea839343d709b0ea3cf7';
  renderTrustedCerts(result.trustedCerts || {});
  renderTrustedSigners(result.trustedSigners || {});
}

function renderTrustedCerts(trustedCerts) {
  const list = document.getElementById('trusted-list');
  const keys = Object.keys(trustedCerts);
  if (keys.length === 0) {
    list.innerHTML = '<div style="color:#A6ADC8;font-size:12px;">No trusted certificates</div>';
    return;
  }
  var html = '';
  for (var i = 0; i < keys.length; i++) {
    var parts = keys[i].split(':');
    var domain = parts[0];
    var hash = parts.slice(1).join(':');
    var shortHash = hash.length > 16 ? hash.substring(0, 8) + '...' + hash.substring(hash.length - 8) : hash;
    html += '<div class="trusted-item"><span>' + domain + ' &mdash; ' + shortHash + '</span>';
    html += '<button class="remove-btn" data-key="' + keys[i] + '">Remove</button></div>';
  }
  list.innerHTML = html;

  var buttons = list.querySelectorAll('.remove-btn');
  for (var j = 0; j < buttons.length; j++) {
    buttons[j].addEventListener('click', function() {
      removeTrusted(this.getAttribute('data-key'));
    });
  }
}

async function removeTrusted(key) {
  const result = await browser.storage.local.get('trustedCerts');
  var trustedCerts = result.trustedCerts || {};
  delete trustedCerts[key];
  await browser.storage.local.set({ trustedCerts: trustedCerts });
  renderTrustedCerts(trustedCerts);
}

function renderTrustedSigners(trustedSigners) {
  const list = document.getElementById('signer-list');
  const keys = Object.keys(trustedSigners);
  if (keys.length === 0) {
    list.innerHTML = '<div style="color:#A6ADC8;font-size:12px;">No trusted signing keys</div>';
    return;
  }
  var html = '';
  for (var i = 0; i < keys.length; i++) {
    var shortKey = keys[i].length > 16 ? keys[i].substring(0, 8) + '...' + keys[i].substring(keys[i].length - 8) : keys[i];
    html += '<div class="trusted-item"><span>' + shortKey + '</span>';
    html += '<button class="remove-btn" data-signer="' + keys[i] + '">Remove</button></div>';
  }
  list.innerHTML = html;

  var buttons = list.querySelectorAll('.remove-btn');
  for (var j = 0; j < buttons.length; j++) {
    buttons[j].addEventListener('click', function() {
      removeSigner(this.getAttribute('data-signer'));
    });
  }
}

async function removeSigner(pubkey) {
  const result = await browser.storage.local.get('trustedSigners');
  var trustedSigners = result.trustedSigners || {};
  delete trustedSigners[pubkey];
  await browser.storage.local.set({ trustedSigners: trustedSigners });
  renderTrustedSigners(trustedSigners);
}

document.getElementById('save-btn').addEventListener('click', async function() {
  var url = document.getElementById('api-url').value.trim();
  // Remove trailing slash
  if (url.endsWith('/')) url = url.slice(0, -1);
  var pubkeyHash = document.getElementById('api-pubkey-hash').value.trim().toLowerCase();
  await browser.storage.local.set({ apiUrl: url, apiPubkeyHash: pubkeyHash });
  var msg = document.getElementById('saved-msg');
  msg.style.display = 'inline';
  setTimeout(function() { msg.style.display = 'none'; }, 2000);
});

loadSettings();
