var tokenClient = null;
var gapiInited = false;
var gisInited = false;

// --- Initialize GAPI ---
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

// --- Initialize GIS ---
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
    const btn = document.getElementById('auth-btn');
    const msg = document.getElementById('loading-msg');
    
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
  tokenClient.callback = async (resp) => {
    if (resp.error !== undefined) throw (resp);
    localStorage.setItem('budget_access_token', resp.access_token);
    onSignedIn();
  };

  if (gapi.client.getToken() === null) {
    tokenClient.requestAccessToken({prompt: 'consent'});
  } else {
    tokenClient.requestAccessToken({prompt: ''});
  }
}

function onTokenResponse(resp) {}

function onSignedIn() {
  const overlay = document.getElementById('signin-overlay');
  if (overlay) overlay.style.display = 'none';
  if (typeof initApp === 'function') initApp();
}

// --- Sheets API Wrapper ---
var SheetsAPI = {
  readSheet: async function(sheetName) {
    const response = await gapi.client.sheets.spreadsheets.values.get({
      spreadsheetId: CONFIG.SPREADSHEET_ID,
      range: `${sheetName}!A:Z`,
    });
    return response.result.values || [];
  }
};
