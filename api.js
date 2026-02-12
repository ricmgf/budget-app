var tokenClient = null;
var gapiInited = false;
var gisInited = false;

// --- Initialize Google API Client ---
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
      // Show error on screen if the key is wrong
      const msg = document.getElementById('loading-msg');
      if (msg) msg.innerHTML = '<span style="color:red">Error: Clave API no válida</span>';
    });
  });
}

// --- Initialize Identity Services ---
function initGIS() {
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CONFIG.CLIENT_ID,
    scope: CONFIG.SCOPES,
    callback: (resp) => {
      if (resp.error !== undefined) throw (resp);
      onSignedIn();
    }
  });
  gisInited = true;
  console.log('[Auth] GIS initialized');
  maybeEnableSignIn();
}

// --- Safety check to find HTML elements ---
function maybeEnableSignIn() {
  if (gapiInited && gisInited) {
    const btn = document.getElementById('auth-btn');
    const msg = document.getElementById('loading-msg');
    
    // If HTML isn't ready, wait 100ms and try again
    if (!btn || !msg) {
      setTimeout(maybeEnableSignIn, 100);
      return;
    }

    msg.style.display = 'none';
    btn.style.display = 'block';
    console.log('[Auth] Ready for sign-in');
  }
}

function handleAuthClick() {
  tokenClient.requestAccessToken({prompt: 'consent'});
}

function onSignedIn() {
  const overlay = document.getElementById('signin-overlay');
  if (overlay) overlay.style.display = 'none';
  if (typeof initApp === 'function') initApp();
}

// --- Sheets API Library ---
var SheetsAPI = {
  readSheet: async function(sheetName) {
    const response = await gapi.client.sheets.spreadsheets.values.get({
      spreadsheetId: CONFIG.SPREADSHEET_ID,
      range: `${sheetName}!A:Z`,
    });
    return response.result.values || [];
  }
};

// --- DATA CACHE ---
var DataCache = {
  _cache: {},
  get: function(key) { return this._cache[key] || null; },
  set: function(key, val) { this._cache[key] = val; }
};
