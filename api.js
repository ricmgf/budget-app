// ============================================================
// Budget App — Google Sheets API & Auth Wrapper
// ============================================================

var tokenClient = null;
var gapiInited = false;
var gisInited = false;

function initGoogleAuth() {
  gapi.load('client', function() {
    gapi.client.init({
      apiKey: CONFIG.API_KEY,
      discoveryDocs: CONFIG.DISCOVERY_DOCS
    }).then(() => { gapiInited = true; maybeEnableSignIn(); });
  });
}

function initGIS() {
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CONFIG.CLIENT_ID,
    scope: CONFIG.SCOPES,
    callback: (resp) => { if (resp.error !== undefined) throw (resp); onSignedIn(); }
  });
  gisInited = true;
  maybeEnableSignIn();
}

function maybeEnableSignIn() {
  if (gapiInited && gisInited) {
    const btn = document.getElementById('signin-btn');
    if (btn) btn.style.display = 'block';
  }
}

function handleAuthClick() {
  tokenClient.requestAccessToken({prompt: gapi.client.getToken() === null ? 'consent' : ''});
}

function onSignedIn() {
  document.getElementById('signin-overlay').style.display = 'none';
  initApp();
}

var SheetsAPI = {
  readSheet: async (s) => {
    const r = await gapi.client.sheets.spreadsheets.values.get({spreadsheetId: CONFIG.SPREADSHEET_ID, range: `${s}!A:Z`});
    return r.result.values || [];
  },
  appendRow: async (s, data) => {
    return gapi.client.sheets.spreadsheets.values.append({
      spreadsheetId: CONFIG.SPREADSHEET_ID, range: `${s}!A1`,
      valueInputOption: 'USER_ENTERED', resource: {values: [data]}
    });
  },
  updateCell: async (s, row, col, val) => {
    const range = `${s}!${String.fromCharCode(64 + col)}${row}`;
    return gapi.client.sheets.spreadsheets.values.update({
      spreadsheetId: CONFIG.SPREADSHEET_ID, range: range,
      valueInputOption: 'USER_ENTERED', resource: {values: [[val]]}
    });
  }
};

var DataCache = {
  _cache: {}, _ts: {}, TTL: 300000,
  get: function(k) { if(this._cache[k] && (Date.now() - this._ts[k] < this.TTL)) return Promise.resolve(this._cache[k]); return null; },
  set: function(k, d) { this._cache[k] = d; this._ts[k] = Date.now(); }
};
