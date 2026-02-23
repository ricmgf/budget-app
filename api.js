/**
 * api.js — v2.0 (Fase 2)
 * CAMBIOS:
 *   - ensureToken() con timeout/fallback para evitar bug canal cerrado Chrome
 *   - SheetsAPI.batchGet() — leer varias hojas en UNA sola llamada API
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

function handleAuthClick() { tokenClient.requestAccessToken({ prompt: 'consent' }); }
function onSignedIn() {
  document.getElementById('signin-overlay').style.display = 'none';
  initApp();
  // Renovar token silenciosamente cada 45 minutos (expira en 60)
  // Evita que el grid pierda sesión al hacer refresh de datos
  if (window._tokenRenewalTimer) clearInterval(window._tokenRenewalTimer);
  window._tokenRenewalTimer = setInterval(() => {
    try {
      tokenClient.callback = (resp) => {
        if (!resp.error) console.log('[auth] Token renovado silenciosamente');
      };
      tokenClient.requestAccessToken({ prompt: '' });
    } catch(e) { console.warn('[auth] Renovación silenciosa falló', e); }
  }, 45 * 60 * 1000); // 45 min
}

// ── ensureToken v2: intenta silencioso, si el canal cierra en <3s hace prompt ──
async function ensureToken() {
  const token = gapi.client.getToken();
  if (!token) {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        tokenClient.callback = (resp) => {
          if (!resp.error) {
            try { sessionStorage.setItem('goog_token_exp', String(Date.now() + 55*60*1000)); } catch(e) {}
            resolve();
          }
        };
        tokenClient.requestAccessToken({ prompt: 'consent' });
      }, 3000);
      tokenClient.callback = (resp) => {
        clearTimeout(timeout);
        if (!resp.error) {
          try { sessionStorage.setItem('goog_token_exp', String(Date.now() + 55*60*1000)); } catch(e) {}
          resolve();
        }
      };
      tokenClient.requestAccessToken({ prompt: '' });
    });
  }
}

async function safeApiCall(fn) {
  try { return await fn(); }
  catch (e) {
    if (e?.status === 401 || e?.result?.error?.code === 401) {
      // Try silent token renewal first (no prompt = no popup if session still valid)
      await new Promise((resolve) => {
        const t = setTimeout(() => resolve(), 4000); // timeout fallback
        tokenClient.callback = (resp) => { clearTimeout(t); resolve(); };
        tokenClient.requestAccessToken({ prompt: '' });
      });
      try { return await fn(); }
      catch(e2) {
        // Silent failed — need user interaction
        await ensureToken();
        return await fn();
      }
    }
    throw e;
  }
}

var SheetsAPI = {
  // ── Lectura individual (sin cambios) ──────────────────────────────────────
  readSheet: async (s) => safeApiCall(() =>
    gapi.client.sheets.spreadsheets.values.get({
      spreadsheetId: CONFIG.SPREADSHEET_ID,
      range: `${s}!A:AZ`,
      valueRenderOption: 'UNFORMATTED_VALUE'
    }).then(r => r.result.values || [])
  ),

  readRange: async (s, range) => safeApiCall(() =>
    gapi.client.sheets.spreadsheets.values.get({
      spreadsheetId: CONFIG.SPREADSHEET_ID,
      range: `${s}!${range}`,
      valueRenderOption: 'UNFORMATTED_VALUE'
    }).then(r => r.result.values || [])
  ),

  // ── batchGet: lee N hojas en UNA sola llamada ─────────────────────────────
  // Uso: const { CONFIG, ACCOUNTS, IMPORTED_STATEMENTS } =
  //        await SheetsAPI.batchGet(['CONFIG','ACCOUNTS','IMPORTED_STATEMENTS'])
  // Devuelve objeto { [sheetName]: rows[] }
  batchGet: async (sheets) => safeApiCall(() =>
    gapi.client.sheets.spreadsheets.values.batchGet({
      spreadsheetId: CONFIG.SPREADSHEET_ID,
      ranges: sheets.map(s => `${s}!A:AZ`),
      valueRenderOption: 'UNFORMATTED_VALUE'
    }).then(r => {
      const result = {};
      (r.result.valueRanges || []).forEach((vr, i) => {
        result[sheets[i]] = vr.values || [];
      });
      return result;
    })
  ),

  // ── Escritura (sin cambios) ───────────────────────────────────────────────
  appendRow: async (s, data) => safeApiCall(() =>
    gapi.client.sheets.spreadsheets.values.append({
      spreadsheetId: CONFIG.SPREADSHEET_ID,
      range: `${s}!A1`,
      valueInputOption: 'USER_ENTERED',
      resource: { values: [data] }
    })
  ),

  batchAppend: async (s, rows) => safeApiCall(() =>
    gapi.client.sheets.spreadsheets.values.append({
      spreadsheetId: CONFIG.SPREADSHEET_ID,
      range: `${s}!A1`,
      valueInputOption: 'USER_ENTERED',
      resource: { values: rows }
    })
  ),

  updateCell: async (s, r, c, v) => safeApiCall(() => {
    const colRef = SheetsAPI.colToLetter(c);
    return gapi.client.sheets.spreadsheets.values.update({
      spreadsheetId: CONFIG.SPREADSHEET_ID,
      range: `${s}!${colRef}${r}`,
      valueInputOption: 'USER_ENTERED',
      resource: { values: [[v]] }
    });
  }),

  batchUpdate: async (s, updates) => safeApiCall(() => {
    const data = updates.map(u => ({
      range: `${s}!${SheetsAPI.colToLetter(u.col)}${u.row}`,
      values: [[u.value]]
    }));
    return gapi.client.sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: CONFIG.SPREADSHEET_ID,
      resource: { valueInputOption: 'USER_ENTERED', data }
    });
  }),

  updateRow: async (s, row, values) => safeApiCall(() =>
    gapi.client.sheets.spreadsheets.values.update({
      spreadsheetId: CONFIG.SPREADSHEET_ID,
      range: `${s}!A${row}`,
      valueInputOption: 'USER_ENTERED',
      resource: { values: [values] }
    })
  ),

  colToLetter: (c) => {
    let s = '';
    while (c > 0) { c--; s = String.fromCharCode(65 + (c % 26)) + s; c = Math.floor(c / 26); }
    return s;
  }
};
