/**
 * [BLOQUE_RESTAURADO_V1.6.2] - API DE GOOGLE & DATA ACCESS LAYER
 * Se restaura la estructura original de v1.55 para garantizar el login.
 * Se añade lógica de IDs y Timestamps solo en la capa de datos.
 */

var tokenClient;
var gapiInited = false;
var gisInited = false;

// --- FUNCIONES DE AUTENTICACIÓN (ESTRUCTURA ORIGINAL INAMOVIBLE) ---

function initGoogleAuth() {
  gapi.load('client', () => {
    gapi.client.init({
      apiKey: CONFIG.API_KEY,
      discoveryDocs: CONFIG.DISCOVERY_DOCS,
    }).then(() => {
      gapiInited = true;
      maybeEnableSignIn();
    });
  });
}

function initGIS() {
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CONFIG.CLIENT_ID,
    scope: CONFIG.SCOPES,
    callback: (resp) => {
      if (resp.error !== undefined) throw (resp);
      onSignedIn();
    },
  });
  gisInited = true;
  maybeEnableSignIn();
}

function maybeEnableSignIn() {
  const btn = document.getElementById('signin-btn');
  if (gapiInited && gisInited && btn) {
    btn.style.display = 'block';
  }
}

function handleAuthClick() {
  tokenClient.requestAccessToken({ prompt: 'consent' });
}

function onSignedIn() {
  const overlay = document.getElementById('signin-overlay');
  if (overlay) overlay.style.display = 'none';
  if (typeof initApp === 'function') initApp();
}

// --- DATA ACCESS LAYER (CON LÓGICA DE ESCALABILIDAD) ---

var SheetsAPI = {
  // Lectura estándar: No cambia
  readSheet: async (s) => {
    const response = await gapi.client.sheets.spreadsheets.values.get({
      spreadsheetId: CONFIG.SPREADSHEET_ID,
      range: `${s}!A:Z`,
    });
    return response.result.values || [];
  },

  // Append Robusto: Añade IDs y Timestamps sin romper el mapeo
  appendRow: async (s, data) => {
    // 1. Generar ID único en la Columna 0 si está vacía
    if (!data[0] || data[0] === "") {
      data[0] = 'tx_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
    }
    
    const now = new Date().toISOString();
    
    // 2. Inyectar Timestamps respetando el conteo de columnas legacy
    if (s === CONFIG.SHEETS.GASTOS) {
      data[12] = now; // Columna M (created_at)
      data[13] = now; // Columna N (updated_at)
    } else if (s === CONFIG.SHEETS.INGRESOS) {
      data[9] = now;  // Columna J (created_at)
      data[10] = now; // Columna K (updated_at)
    }

    return gapi.client.sheets.spreadsheets.values.append({
      spreadsheetId: CONFIG.SPREADSHEET_ID,
      range: `${s}!A1`,
      valueInputOption: 'USER_ENTERED',
      resource: { values: [data] }
    });
  },

  updateCell: async (s, r, c, v) => {
    return gapi.client.sheets.spreadsheets.values.update({
      spreadsheetId: CONFIG.SPREADSHEET_ID,
      range: `${s}!${String.fromCharCode(64 + c)}${r}`,
      valueInputOption: 'USER_ENTERED',
      resource: { values: [[v]] }
    });
  },

  // Nueva función para borrar por ID (Soft Delete)
  deleteRowById: async (sheetName, id) => {
    const rows = await SheetsAPI.readSheet(sheetName);
    const index = rows.findIndex(r => r[0] === id);
    if (index === -1) return;
    
    // Marcamos como DELETED en la columna de estado
    const colIndex = (sheetName === CONFIG.SHEETS.GASTOS) ? 11 : 8;
    return SheetsAPI.updateCell(sheetName, index + 1, colIndex + 1, 'DELETED');
  }
};
