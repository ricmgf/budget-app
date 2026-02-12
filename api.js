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
      console.log('[Auth] gapi client initialized');
      maybeEnableSignIn();
    }).catch(function(err) {
      console.error('[Auth] gapi init error:', err);
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
  console.log('[Auth] GIS token client initialized');
  maybeEnableSignIn();
}

function maybeEnableSignIn() {
  if (gapiInited && gisInited) {
    const btn = document.getElementById('signin-btn');
    const msg = document.getElementById('loading-msg');
    if (btn && msg) {
      msg.style.display = 'none';
      btn.style.display = 'block';
    } else {
      setTimeout(maybeEnableSignIn, 100);
    }
  }
}

function handleAuthClick() {
  if (gapi.client.getToken() === null) {
    tokenClient.requestAccessToken({prompt: 'consent'});
  } else {
    tokenClient.requestAccessToken({prompt: ''});
  }
}

function onTokenResponse(resp) {
  if (resp.error !== undefined) throw (resp);
  document.getElementById('signin-overlay').style.display = 'none';
  if (typeof initApp === 'function') initApp();
}

var SheetsAPI = {
  readSheet: async function(sheetName) {
    const response = await gapi.client.sheets.spreadsheets.values.get({
      spreadsheetId: CONFIG.SPREADSHEET_ID,
      range: `${sheetName}!A:Z`,
    });
    return response.result.values || [];
  },
  appendRow: async function(sheetName, rowData) {
    return gapi.client.sheets.spreadsheets.values.append({
      spreadsheetId: CONFIG.SPREADSHEET_ID,
      range: `${sheetName}!A1`,
      valueInputOption: 'USER_ENTERED',
      resource: { values: [rowData] }
    });
  },
  updateRow: async function(sheetName, rowIndex, rowData) {
    return gapi.client.sheets.spreadsheets.values.update({
      spreadsheetId: CONFIG.SPREADSHEET_ID,
      range: `${sheetName}!A${rowIndex}`,
      valueInputOption: 'USER_ENTERED',
      resource: { values: [rowData] }
    });
  },
  deleteRow: async function(sheetName, rowIndex) {
    const resp = await gapi.client.sheets.spreadsheets.get({ spreadsheetId: CONFIG.SPREADSHEET_ID });
    let sheetId = null;
    resp.result.sheets.forEach(s => { if (s.properties.title === sheetName) sheetId = s.properties.sheetId; });
    return gapi.client.sheets.spreadsheets.batchUpdate({
      spreadsheetId: CONFIG.SPREADSHEET_ID,
      resource: { requests: [{ deleteDimension: { range: { sheetId: sheetId, dimension: 'ROWS', startIndex: rowIndex-1, endIndex: rowIndex } } }] }
    });
  }
};

var DataCache = {
  _cache: {}, _timestamps: {}, TTL: 60000,
  get: function(key) {
    if (this._cache[key] && (Date.now() - this._timestamps[key]) < this.TTL) return Promise.resolve(this._cache[key]);
    return null;
  },
  set: function(key, data) { this._cache[key] = data; this._timestamps[key] = Date.now(); },
  invalidate: function() { this._cache = {}; }
};
