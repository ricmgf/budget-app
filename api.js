var tokenClient = null;
var gapiInited = false;
var gisInited = false;

function initGoogleAuth() {
  gapi.load('client', function() {
    gapi.client.init({
      apiKey: CONFIG.API_KEY,
      discoveryDocs: CONFIG.DISCOVERY_DOCS
    }).then(function() {
      gapiInited = true;
      maybeEnableSignIn();
    });
  });
}

function initGIS() {
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CONFIG.CLIENT_ID,
    scope: CONFIG.SCOPES,
    callback: onTokenResponse
  });
  gisInited = true;
  maybeEnableSignIn();
}

function maybeEnableSignIn() {
  if (gapiInited && gisInited) {
    const btn = document.getElementById('signin-btn');
    if (btn) btn.style.display = 'block';
    const msg = document.getElementById('loading-msg');
    if (msg) msg.textContent = 'Servicios listos';
  }
}

function handleAuthClick() {
  tokenClient.requestAccessToken({prompt: gapi.client.getToken() === null ? 'consent' : ''});
}

function onTokenResponse(resp) {
  if (resp.error !== undefined) throw (resp);
  document.getElementById('signin-overlay').style.display = 'none';
  if (typeof initApp === 'function') initApp();
}

var SheetsAPI = {
  readSheet: async function(s) {
    const r = await gapi.client.sheets.spreadsheets.values.get({spreadsheetId: CONFIG.SPREADSHEET_ID, range: `${s}!A:Z`});
    return r.result.values || [];
  },
  appendRow: async function(s, data) {
    return gapi.client.sheets.spreadsheets.values.append({spreadsheetId: CONFIG.SPREADSHEET_ID, range: `${s}!A1`, valueInputOption: 'USER_ENTERED', resource: {values: [data]}});
  },
  updateRow: async function(s, idx, data) {
    return gapi.client.sheets.spreadsheets.values.update({spreadsheetId: CONFIG.SPREADSHEET_ID, range: `${s}!A${idx}`, valueInputOption: 'USER_ENTERED', resource: {values: [data]}});
  },
  deleteRow: async function(s, idx) {
    const res = await gapi.client.sheets.spreadsheets.get({spreadsheetId: CONFIG.SPREADSHEET_ID});
    let id = null;
    res.result.sheets.forEach(sh => { if(sh.properties.title === s) id = sh.properties.sheetId; });
    return gapi.client.sheets.spreadsheets.batchUpdate({spreadsheetId: CONFIG.SPREADSHEET_ID, resource: {requests: [{deleteDimension: {range: {sheetId: id, dimension: 'ROWS', startIndex: idx-1, endIndex: idx}}}]}});
  }
};

var DataCache = {
  _cache: {}, _ts: {}, TTL: 60000,
  get: function(k) { if(this._cache[k] && (Date.now() - this._ts[k] < this.TTL)) return Promise.resolve(this._cache[k]); return null; },
  set: function(k, d) { this._cache[k] = d; this._ts[k] = Date.now(); }
};
