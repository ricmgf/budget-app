// ============================================================
// Budget App — Auth + API Client (all POST, text/plain, no CORS issues)
// ============================================================

// --- GLOBAL CALLBACK for Google Sign-In ---
function handleCredentialResponse(response) {
  console.log('[Auth] Credential response received');
  if (!response.credential) {
    var el = document.getElementById('signin-error');
    if (el) { el.textContent = 'Sign-in failed.'; el.style.display = 'block'; }
    return;
  }
  localStorage.setItem('budget_id_token', response.credential);
  try {
    var payload = JSON.parse(atob(response.credential.split('.')[1]));
    console.log('[Auth] Signed in as:', payload.email);
    GoogleAuth.idToken = response.credential;
    GoogleAuth.userEmail = payload.email || '';
    GoogleAuth.userName = payload.name || '';
  } catch (e) {
    GoogleAuth.idToken = response.credential;
  }
  GoogleAuth._onSignedIn();
}

// --- AUTH MODULE ---
var GoogleAuth = {
  idToken: null,
  userEmail: null,
  userName: null,

  init: function() {
    var saved = localStorage.getItem('budget_id_token');
    if (saved) {
      try {
        var payload = JSON.parse(atob(saved.split('.')[1]));
        if (Date.now() < payload.exp * 1000) {
          console.log('[Auth] Restored session for:', payload.email);
          this.idToken = saved;
          this.userEmail = payload.email || '';
          this.userName = payload.name || '';
          this._onSignedIn();
          return;
        }
      } catch (e) {}
      localStorage.removeItem('budget_id_token');
    }
    console.log('[Auth] No valid token, showing sign-in');
  },

  _onSignedIn: function() {
    var overlay = document.getElementById('signin-overlay');
    if (overlay) overlay.style.display = 'none';
    var info = document.getElementById('user-info');
    if (info) info.textContent = this.userEmail || this.userName || 'Signed in';
    initApp();
  },

  signOut: function() {
    localStorage.removeItem('budget_id_token');
    this.idToken = null;
    this.userEmail = null;
    if (typeof google !== 'undefined' && google.accounts && google.accounts.id) {
      google.accounts.id.disableAutoSelect();
    }
    var overlay = document.getElementById('signin-overlay');
    if (overlay) overlay.style.display = 'flex';
  },

  getToken: function() { return this.idToken; }
};


// --- API CLIENT ---
// ALL requests use POST with text/plain to avoid CORS preflight.
// Action and token go in the body, not the URL.
var API = {
  BASE_URL: 'https://script.google.com/macros/s/AKfycbwU2zx28aD5GWqX3olg8tv3zFtOQ4RMBMGyV0emPAEGaOLZHJYstHcKbqYa--enKisK/exec',

  // Core request method — always POST, always text/plain
  request: function(action, payload) {
    var token = GoogleAuth.getToken();
    if (!token) return Promise.reject(new Error('Not authenticated. Please sign in.'));

    var body = {
      action: action,
      id_token: token
    };
    if (payload) {
      body.payload = payload;
    }

    console.log('[API]', action);

    return fetch(API.BASE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body),
      redirect: 'follow'
    })
    .then(function(res) {
      console.log('[API] Status:', res.status, 'OK:', res.ok);
      return res.text();
    })
    .then(function(text) {
      console.log('[API] Response (first 300):', text.substring(0, 300));

      if (text.startsWith('<!DOCTYPE') || text.startsWith('<html') || text.startsWith('<HTML')) {
        throw new Error('Google returned HTML instead of JSON. Make sure Apps Script is deployed with "Who has access: Anyone" and you created a new version.');
      }

      var json = JSON.parse(text);
      if (json.error) throw new Error(json.error);
      return json;
    })
    .catch(function(err) {
      if (err.message && err.message.indexOf('Failed to fetch') !== -1) {
        console.error('[API] CORS/Network error for action:', action);
        throw new Error('Network error (CORS). Ensure Apps Script deploy: Execute as Me, Access: Anyone. Create a NEW version after code changes.');
      }
      throw err;
    });
  },

  // CONFIG
  getConfig: function() { return API.request('getConfig'); },
  addCategory: function(cat, sub) { return API.request('addCategory', { categoria: cat, subcategoria: sub }); },
  deleteCategory: function(cat, sub) { return API.request('deleteCategory', { categoria: cat, subcategoria: sub }); },
  addCuenta: function(cuenta) { return API.request('addCuenta', { cuenta: cuenta }); },
  addCasa: function(casa) { return API.request('addCasa', { casa: casa }); },

  // GASTOS
  getGastos: function(p) { return API.request('getGastos', p); },
  getPending: function(p) { return API.request('getPendingGastos', p); },
  addManualGasto: function(d) { return API.request('addManualGasto', d); },
  updateGasto: function(d) { return API.request('updateGasto', d); },
  bulkUpdateGastos: function(d) { return API.request('bulkUpdateGastos', d); },

  // IMPORT
  importTransactions: function(d) { return API.request('importTransactions', d); },

  // RULES
  getRules: function() { return API.request('getRules'); },
  addRule: function(d) { return API.request('addRule', d); },
  updateRule: function(d) { return API.request('updateRule', d); },
  deleteRule: function(d) { return API.request('deleteRule', d); },
  testRule: function(d) { return API.request('testRule', d); },
  applyRuleRetroactive: function(id) { return API.request('applyRuleRetroactive', { ruleId: id }); },

  // INGRESOS
  getIngresos: function(p) { return API.request('getIngresos', p); },
  addIngreso: function(d) { return API.request('addIngreso', d); },
  updateIngreso: function(d) { return API.request('updateIngreso', d); },
  deleteIngreso: function(d) { return API.request('deleteIngreso', d); },

  // BALANCES
  getBalances: function(p) { return API.request('getBalances', p); },
  updateBalance: function(d) { return API.request('updateBalance', d); },
  calculateCashFlow: function(d) { return API.request('calculateCashFlow', d); },

  // REPORTING
  getDashboard: function(p) { return API.request('getDashboardData', p); },
  getMonthlySummary: function(a, m) { return API.request('getMonthlySummary', { año: a, mes: m }); },
  getAnnualSummary: function(a) { return API.request('getAnnualSummary', { año: a }); },
  getCasaSummary: function(a, m) { return API.request('getCasaSummary', { año: a, mes: m }); },
  exportGastos: function(p) { return API.request('exportGastos', p); }
};


// --- APP STATE ---
var AppState = {
  config: null,
  currentPage: 'dashboard',
  currentYear: new Date().getFullYear(),
  currentMonth: new Date().getMonth() + 1,
  pendingCount: 0,
  theme: localStorage.getItem('budget-theme') || 'light',

  init: function() { document.documentElement.setAttribute('data-theme', this.theme); },

  toggleTheme: function() {
    this.theme = this.theme === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', this.theme);
    localStorage.setItem('budget-theme', this.theme);
  },

  loadConfig: function() {
    var self = this;
    return API.getConfig().then(function(c) { self.config = c; return c; });
  },

  getMonthName: function(m) {
    return ['','Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'][m] || '';
  },

  prevMonth: function() { this.currentMonth--; if (this.currentMonth < 1) { this.currentMonth = 12; this.currentYear--; } },
  nextMonth: function() { this.currentMonth++; if (this.currentMonth > 12) { this.currentMonth = 1; this.currentYear++; } }
};


// --- UTILITIES ---
var Utils = {
  formatCurrency: function(amount) {
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount || 0);
  },
  formatDate: function(d) { return d ? new Date(d).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }) : ''; },
  formatDateShort: function(d) { return d ? new Date(d).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' }) : ''; },
  escapeHtml: function(s) { if (!s) return ''; var d = document.createElement('div'); d.textContent = s; return d.innerHTML; },
  fileToBase64: function(file) {
    return new Promise(function(resolve, reject) {
      var r = new FileReader();
      r.onload = function() { resolve(r.result.split(',')[1]); };
      r.onerror = reject;
      r.readAsDataURL(file);
    });
  },
  showAlert: function(msg, type) {
    var c = document.getElementById('alert-container');
    var a = document.createElement('div');
    a.className = 'alert alert-' + (type || 'info');
    a.innerHTML = '<span>' + msg + '</span>';
    c.appendChild(a);
    setTimeout(function() { a.remove(); }, 5000);
  },
  downloadCSV: function(csv, fn) {
    var b = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    var l = document.createElement('a');
    l.href = URL.createObjectURL(b); l.download = fn; l.click();
  },
  buildCategorySelect: function(config, selCat, selSub) {
    if (!config) return { catOptions: '', subOptions: '' };
    var cats = []; config.categorias.forEach(function(c) { if (cats.indexOf(c.categoria) === -1) cats.push(c.categoria); });
    var co = '<option value="">— Seleccionar —</option>';
    cats.forEach(function(c) { co += '<option value="' + c + '"' + (c === selCat ? ' selected' : '') + '>' + c + '</option>'; });
    var so = '<option value="">— Seleccionar —</option>';
    if (selCat && config.categoriasGrouped[selCat]) {
      config.categoriasGrouped[selCat].forEach(function(s) { so += '<option value="' + s + '"' + (s === selSub ? ' selected' : '') + '>' + s + '</option>'; });
    }
    return { catOptions: co, subOptions: so };
  },
  buildCuentaSelect: function(config, sel) {
    if (!config) return '';
    var o = '<option value="">— Seleccionar —</option>';
    config.cuentas.forEach(function(c) { o += '<option value="' + c + '"' + (c === sel ? ' selected' : '') + '>' + c + '</option>'; });
    return o;
  },
  buildCasaSelect: function(config, sel) {
    if (!config) return '';
    var o = '<option value="">— Seleccionar —</option>';
    config.casas.forEach(function(c) { o += '<option value="' + c + '"' + (c === sel ? ' selected' : '') + '>' + c + '</option>'; });
    return o;
  }
};

// --- BOOTSTRAP ---
document.addEventListener('DOMContentLoaded', function() {
  AppState.init();
  GoogleAuth.init();
});
