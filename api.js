// ============================================================
// Budget App v2 — Direct Google Sheets API (no Apps Script middleman)
// Auth: gapi + GIS token client (same as On Track)
// ============================================================

var tokenClient = null;
var gapiInited = false;
var gisInited = false;
var currentUser = null;

// --- Called by gapi.js onload in index.html ---
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

// --- Called when GIS library loads ---
function initGIS() {
  var check = function() {
    if (typeof google !== 'undefined' && google.accounts && google.accounts.oauth2) {
      tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CONFIG.CLIENT_ID,
        scope: CONFIG.SCOPES,
        callback: onTokenResponse
      });
      gisInited = true;
      console.log('[Auth] GIS token client initialized');
      maybeEnableSignIn();
    } else {
      setTimeout(check, 100);
    }
  };
  check();
}

function maybeEnableSignIn() {
  if (gapiInited && gisInited) {
    var btn = document.getElementById('signInBtn');
    if (btn) {
      btn.disabled = false;
      btn.querySelector('#signInBtnText').textContent = 'Sign in with Google';
    }
    // Try to restore session
    var savedToken = localStorage.getItem('budget_gapi_token');
    if (savedToken) {
      try {
        var tokenData = JSON.parse(savedToken);
        // Check if token is still valid (has > 5 min left)
        if (tokenData.expiry && Date.now() < tokenData.expiry - 300000) {
          gapi.client.setToken({ access_token: tokenData.access_token });
          currentUser = tokenData.email || 'user';
          console.log('[Auth] Restored session for:', currentUser);
          onSignedIn();
          return;
        }
      } catch (e) {}
      localStorage.removeItem('budget_gapi_token');
    }
    // Show auth overlay
    document.getElementById('signin-overlay').style.display = 'flex';
    document.getElementById('loading-overlay').style.display = 'none';
  }
}

function signIn() {
  if (!tokenClient) {
    console.error('[Auth] Token client not ready');
    return;
  }
  tokenClient.requestAccessToken();
}

function onTokenResponse(resp) {
  if (resp.error) {
    console.error('[Auth] Token error:', resp);
    return;
  }
  console.log('[Auth] Token received');

  // Save token with expiry
  var expiresIn = parseInt(resp.expires_in || 3600) * 1000;
  var tokenData = {
    access_token: resp.access_token,
    expiry: Date.now() + expiresIn,
    email: ''
  };

  // Get user email
  fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: 'Bearer ' + resp.access_token }
  })
  .then(function(r) { return r.json(); })
  .then(function(info) {
    tokenData.email = info.email || '';
    currentUser = info.email || 'user';
    localStorage.setItem('budget_gapi_token', JSON.stringify(tokenData));
    onSignedIn();
  })
  .catch(function() {
    currentUser = 'user';
    localStorage.setItem('budget_gapi_token', JSON.stringify(tokenData));
    onSignedIn();
  });
}

function onSignedIn() {
  document.getElementById('signin-overlay').style.display = 'none';
  document.getElementById('loading-overlay').style.display = 'none';
  var info = document.getElementById('user-info');
  if (info) info.textContent = currentUser || '';
  initApp();
}

function signOut() {
  var token = gapi.client.getToken();
  if (token) {
    google.accounts.oauth2.revoke(token.access_token);
    gapi.client.setToken(null);
  }
  localStorage.removeItem('budget_gapi_token');
  currentUser = null;
  document.getElementById('signin-overlay').style.display = 'flex';
}


// ============================================================
// SHEETS API — Direct Read/Write
// ============================================================

var SheetsAPI = {
  // Read all rows from a sheet (returns array of arrays, excluding header)
  readSheet: function(sheetName) {
    return gapi.client.sheets.spreadsheets.values.get({
      spreadsheetId: CONFIG.SPREADSHEET_ID,
      range: sheetName
    }).then(function(resp) {
      var rows = resp.result.values || [];
      // Skip header row
      return rows.length > 1 ? rows.slice(1) : [];
    });
  },

  // Read a specific range
  readRange: function(range) {
    return gapi.client.sheets.spreadsheets.values.get({
      spreadsheetId: CONFIG.SPREADSHEET_ID,
      range: range
    }).then(function(resp) {
      return resp.result.values || [];
    });
  },

  // Append rows to a sheet
  appendRows: function(sheetName, rows) {
    return gapi.client.sheets.spreadsheets.values.append({
      spreadsheetId: CONFIG.SPREADSHEET_ID,
      range: sheetName,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      resource: { values: rows }
    });
  },

  // Update a specific cell range
  updateRange: function(range, values) {
    return gapi.client.sheets.spreadsheets.values.update({
      spreadsheetId: CONFIG.SPREADSHEET_ID,
      range: range,
      valueInputOption: 'USER_ENTERED',
      resource: { values: values }
    });
  },

  // Batch update multiple ranges
  batchUpdate: function(data) {
    return gapi.client.sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: CONFIG.SPREADSHEET_ID,
      resource: {
        valueInputOption: 'USER_ENTERED',
        data: data
      }
    });
  },

  // Clear a range
  clearRange: function(range) {
    return gapi.client.sheets.spreadsheets.values.clear({
      spreadsheetId: CONFIG.SPREADSHEET_ID,
      range: range,
      resource: {}
    });
  },

  // Delete a specific row (1-based row number)
  deleteRow: function(sheetName, rowIndex) {
    // First get the sheet ID
    return gapi.client.sheets.spreadsheets.get({
      spreadsheetId: CONFIG.SPREADSHEET_ID
    }).then(function(resp) {
      var sheetId = null;
      resp.result.sheets.forEach(function(s) {
        if (s.properties.title === sheetName) sheetId = s.properties.sheetId;
      });
      if (sheetId === null) throw new Error('Sheet not found: ' + sheetName);

      return gapi.client.sheets.spreadsheets.batchUpdate({
        spreadsheetId: CONFIG.SPREADSHEET_ID,
        resource: {
          requests: [{
            deleteDimension: {
              range: {
                sheetId: sheetId,
                dimension: 'ROWS',
                startIndex: rowIndex - 1, // 0-based
                endIndex: rowIndex
              }
            }
          }]
        }
      });
    });
  }
};


// ============================================================
// DATA CACHE — Avoid re-reading sheets on every page load
// ============================================================

var DataCache = {
  _cache: {},
  _timestamps: {},
  TTL: 60000, // 1 minute cache

  get: function(key) {
    if (this._cache[key] && (Date.now() - this._timestamps[key]) < this.TTL) {
      console.log('[Cache] Hit:', key);
      return Promise.resolve(this._cache[key]);
    }
    return null;
  },

  set: function(key, data) {
    this._cache[key] = data;
    this._timestamps[key] = Date.now();
  },

  invalidate: function(key) {
    if (key) {
      delete this._cache[key];
    } else {
      this._cache = {};
      this._timestamps = {};
    }
  }
};
