/**
 * [ARCHIVO_PROTEGIDO_V1.55_ESTABLE]
 * ⚠️ PROHIBIDO MODIFICAR LA INICIALIZACIÓN DE GOOGLE API (Login).
 */
var tokenClient, gapiInited = false, gisInited = false;

function initGoogleAuth() {
  gapi.load('client', () => {
    gapi.client.init({ apiKey: CONFIG.API_KEY, discoveryDocs: CONFIG.DISCOVERY_DOCS })
      .then(() => { gapiInited = true; maybeEnableSignIn(); });
  });
}

function initGIS() {
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CONFIG.CLIENT_ID, scope: CONFIG.SCOPES,
    callback: (resp) => { if (!resp.error) onSignedIn(); }
  });
  gisInited = true;
  maybeEnableSignIn();
}

function maybeEnableSignIn() {
  const btn = document.getElementById('signin-btn');
  if (gapiInited && gisInited && btn) btn.style.display = 'block';
}

function handleAuthClick() { tokenClient.requestAccessToken({prompt: 'consent'}); }
function onSignedIn() { document.getElementById('signin-overlay').style.display = 'none'; initApp(); }

// Auto-refresh expired tokens (tokens expire ~1hr)
async function ensureToken() {
  const token = gapi.client.getToken();
  if (!token) {
    return new Promise((resolve) => {
      tokenClient.callback = (resp) => { if (!resp.error) resolve(); };
      tokenClient.requestAccessToken({ prompt: '' });
    });
  }
}

async function safeApiCall(fn) {
  try { return await fn(); }
  catch (e) {
    if (e?.status === 401 || e?.result?.error?.code === 401) {
      await ensureToken();
      return await fn();
    }
    throw e;
  }
}

var SheetsAPI = {
  readSheet: async (s) => safeApiCall(() => gapi.client.sheets.spreadsheets.values.get({spreadsheetId: CONFIG.SPREADSHEET_ID, range: `${s}!A:AZ`, valueRenderOption: 'UNFORMATTED_VALUE'}).then(r => r.result.values || [])),
  readRange: async (s, range) => safeApiCall(() => gapi.client.sheets.spreadsheets.values.get({spreadsheetId: CONFIG.SPREADSHEET_ID, range: `${s}!${range}`, valueRenderOption: 'UNFORMATTED_VALUE'}).then(r => r.result.values || [])),
  appendRow: async (s, data) => safeApiCall(() => gapi.client.sheets.spreadsheets.values.append({
    spreadsheetId: CONFIG.SPREADSHEET_ID, range: `${s}!A1`, valueInputOption: 'USER_ENTERED', resource: {values: [data]}
  })),
  batchAppend: async (s, rows) => safeApiCall(() => gapi.client.sheets.spreadsheets.values.append({
    spreadsheetId: CONFIG.SPREADSHEET_ID, range: `${s}!A1`, valueInputOption: 'USER_ENTERED', resource: {values: rows}
  })),
  updateCell: async (s, r, c, v) => safeApiCall(() => {
    const colRef = SheetsAPI.colToLetter(c);
    return gapi.client.sheets.spreadsheets.values.update({
      spreadsheetId: CONFIG.SPREADSHEET_ID, range: `${s}!${colRef}${r}`, valueInputOption: 'USER_ENTERED', resource: {values: [[v]]}
    });
  }),
  batchUpdate: async (s, updates) => safeApiCall(() => {
    const data = updates.map(u => ({
      range: `${s}!${SheetsAPI.colToLetter(u.col)}${u.row}`,
      values: [[u.value]]
    }));
    return gapi.client.sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: CONFIG.SPREADSHEET_ID,
      resource: { valueInputOption: 'USER_ENTERED', data: data }
    });
  }),
  colToLetter: (c) => {
    // 1=A, 26=Z, 27=AA, 28=AB, etc.
    let s = '';
    while (c > 0) { c--; s = String.fromCharCode(65 + (c % 26)) + s; c = Math.floor(c / 26); }
    return s;
  },
  updateRow: async (s, row, values) => safeApiCall(() => gapi.client.sheets.spreadsheets.values.update({
    spreadsheetId: CONFIG.SPREADSHEET_ID, range: `${s}!A${row}`,
    valueInputOption: 'USER_ENTERED', resource: { values: [values] }
  }))
};
