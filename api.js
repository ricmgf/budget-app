/**
 * [ARCHIVO_PROTEGIDO_V1.55_ESTABLE]
 * ⚠️ PROHIBIDO MODIFICAR LAS FUNCIONES DE INICIALIZACIÓN (initGoogleAuth, initGIS).
 * EL SISTEMA DE LOGIN ES SENSIBLE Y NO DEBE ALTERARSE.
 */

var tokenClient, gapiInited = false, gisInited = false;

// [BLOQUE_PROTEGIDO]
function initGoogleAuth() {
  gapi.load('client', () => {
    gapi.client.init({ apiKey: CONFIG.API_KEY, discoveryDocs: CONFIG.DISCOVERY_DOCS })
      .then(() => { gapiInited = true; maybeEnableSignIn(); });
  });
}

// [BLOQUE_PROTEGIDO]
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

// [BLOQUE_PROTEGIDO] - MÉTODOS DE SHEETS
var SheetsAPI = {
  readSheet: async (s) => (await gapi.client.sheets.spreadsheets.values.get({spreadsheetId: CONFIG.SPREADSHEET_ID, range: `${s}!A:Z`})).result.values || [],
  appendRow: async (s, data) => gapi.client.sheets.spreadsheets.values.append({
    spreadsheetId: CONFIG.SPREADSHEET_ID, range: `${s}!A1`, valueInputOption: 'USER_ENTERED', resource: {values: [data]}
  }),
  updateCell: async (s, r, c, v) => gapi.client.sheets.spreadsheets.values.update({
    spreadsheetId: CONFIG.SPREADSHEET_ID, range: `${s}!${String.fromCharCode(64 + c)}${r}`, valueInputOption: 'USER_ENTERED', resource: {values: [[v]]}
  })
};
