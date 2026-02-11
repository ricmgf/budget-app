// ============================================================
// Budget App — Auth (HTML data-attribute callback) + API Client
// ============================================================

// --- GLOBAL CALLBACK for Google Sign-In (referenced by data-callback in HTML) ---
function handleCredentialResponse(response) {
  if (!response.credential) {
    const el = document.getElementById('signin-error');
    if (el) { el.textContent = 'Sign-in failed. No credential received.'; el.style.display = 'block'; }
    return;
  }

  // Save JWT to sessionStorage (survives page navigation, cleared on tab close)
  sessionStorage.setItem('budget_id_token', response.credential);

  // Decode user info from JWT
  try {
    const payload = JSON.parse(atob(response.credential.split('.')[1]));
    GoogleAuth.idToken = response.credential;
    GoogleAuth.userEmail = payload.email || '';
    GoogleAuth.userName = payload.name || '';
    GoogleAuth._onSignedIn();
  } catch (e) {
    console.error('JWT decode error:', e);
    // Token is valid even if we can't decode it client-side
    GoogleAuth.idToken = response.credential;
    GoogleAuth._onSignedIn();
  }
}

// --- AUTH MODULE ---
const GoogleAuth = {
  idToken: null,
  userEmail: null,
  userName: null,

  init() {
    // Check if we have a saved token from a previous sign-in (same session)
    const saved = sessionStorage.getItem('budget_id_token');
    if (saved) {
      this.idToken = saved;
      try {
        const payload = JSON.parse(atob(saved.split('.')[1]));
        this.userEmail = payload.email || '';
        this.userName = payload.name || '';
        // Check if token is expired
        const exp = payload.exp * 1000; // Convert to ms
        if (Date.now() < exp) {
          this._onSignedIn();
          return; // Already authenticated
        } else {
          // Token expired, clear it
          sessionStorage.removeItem('budget_id_token');
          this.idToken = null;
        }
      } catch (e) {
        sessionStorage.removeItem('budget_id_token');
        this.idToken = null;
      }
    }
    // If not authenticated, the Google button in the HTML will handle sign-in
    // via the data-callback="handleCredentialResponse" attribute
  },

  _onSignedIn() {
    // Hide sign-in overlay
    const overlay = document.getElementById('signin-overlay');
    if (overlay) overlay.style.display = 'none';

    // Show user info
    const userInfo = document.getElementById('user-info');
    if (userInfo) userInfo.textContent = this.userEmail || this.userName || 'Signed in';

    // Boot the app
    initApp();
  },

  signOut() {
    sessionStorage.removeItem('budget_id_token');
    this.idToken = null;
    this.userEmail = null;
    // Disable auto-select so the button shows again
    if (typeof google !== 'undefined' && google.accounts && google.accounts.id) {
      google.accounts.id.disableAutoSelect();
    }
    // Show sign-in overlay
    const overlay = document.getElementById('signin-overlay');
    if (overlay) overlay.style.display = 'flex';
  },

  getToken() {
    return this.idToken;
  }
};


// --- API CLIENT ---
const API = {
  BASE_URL: 'https://script.google.com/macros/s/AKfycbwU2zx28aD5GWqX3olg8tv3zFtOQ4RMBMGyV0emPAEGaOLZHJYstHcKbqYa--enKisK/exec',

  async call(action, data = null) {
    const token = GoogleAuth.getToken();
    if (!token) throw new Error('Not authenticated. Please sign in.');

    const url = new URL(this.BASE_URL);
    url.searchParams.set('action', action);
    url.searchParams.set('id_token', token);

    const opts = {
      method: data ? 'POST' : 'GET',
      redirect: 'follow'
    };

    if (data) {
      opts.headers = { 'Content-Type': 'text/plain' };
      opts.body = JSON.stringify(data);
    }

    try {
      const res = await fetch(url.toString(), opts);
      const text = await res.text();

      // Apps Script returns HTML on auth redirects
      if (text.startsWith('<!DOCTYPE') || text.startsWith('<html') || text.startsWith('<HTML')) {
        throw new Error('Auth redirect from Google. Sign out and sign in again.');
      }

      const json = JSON.parse(text);
      if (json.error) throw new Error(json.error);
      return json;
    } catch (err) {
      if (err.message.includes('Failed to fetch')) {
        throw new Error('Network error. Check your connection.');
      }
      throw err;
    }
  },

  async get(action, params = {}) {
    const token = GoogleAuth.getToken();
    if (!token) throw new Error('Not authenticated.');

    const url = new URL(this.BASE_URL);
    url.searchParams.set('action', action);
    url.searchParams.set('id_token', token);
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
    });

    const res = await fetch(url.toString(), { redirect: 'follow' });
    const text = await res.text();

    if (text.startsWith('<!DOCTYPE') || text.startsWith('<html') || text.startsWith('<HTML')) {
      throw new Error('Auth redirect. Sign out and sign in again.');
    }

    const json = JSON.parse(text);
    if (json.error) throw new Error(json.error);
    return json;
  },

  // CONFIG
  getConfig: () => API.get('getConfig'),
  addCategory: (cat, sub) => API.call('addCategory', { categoria: cat, subcategoria: sub }),
  deleteCategory: (cat, sub) => API.call('deleteCategory', { categoria: cat, subcategoria: sub }),
  addCuenta: (cuenta) => API.call('addCuenta', { cuenta }),
  addCasa: (casa) => API.call('addCasa', { casa }),

  // GASTOS
  getGastos: (params = {}) => API.get('getGastos', params),
  getPending: (params = {}) => API.get('getPendingGastos', params),
  addManualGasto: (data) => API.call('addManualGasto', data),
  updateGasto: (data) => API.call('updateGasto', data),
  bulkUpdateGastos: (data) => API.call('bulkUpdateGastos', data),

  // IMPORT
  importTransactions: (data) => API.call('importTransactions', data),

  // RULES
  getRules: () => API.get('getRules'),
  addRule: (data) => API.call('addRule', data),
  updateRule: (data) => API.call('updateRule', data),
  deleteRule: (data) => API.call('deleteRule', data),
  testRule: (data) => API.call('testRule', data),
  applyRuleRetroactive: (ruleId) => API.call('applyRuleRetroactive', { ruleId }),

  // INGRESOS
  getIngresos: (params = {}) => API.get('getIngresos', params),
  addIngreso: (data) => API.call('addIngreso', data),
  updateIngreso: (data) => API.call('updateIngreso', data),
  deleteIngreso: (data) => API.call('deleteIngreso', data),

  // BALANCES
  getBalances: (params = {}) => API.get('getBalances', params),
  updateBalance: (data) => API.call('updateBalance', data),
  calculateCashFlow: (data) => API.call('calculateCashFlow', data),

  // REPORTING
  getDashboard: (params = {}) => API.get('getDashboardData', params),
  getMonthlySummary: (año, mes) => API.get('getMonthlySummary', { año, mes }),
  getAnnualSummary: (año) => API.get('getAnnualSummary', { año }),
  getCasaSummary: (año, mes) => API.get('getCasaSummary', { año, mes }),
  exportGastos: (params = {}) => API.get('exportGastos', params)
};


// --- APP STATE ---
const AppState = {
  config: null,
  currentPage: 'dashboard',
  currentYear: new Date().getFullYear(),
  currentMonth: new Date().getMonth() + 1,
  pendingCount: 0,
  theme: localStorage.getItem('budget-theme') || 'light',

  init() { document.documentElement.setAttribute('data-theme', this.theme); },

  toggleTheme() {
    this.theme = this.theme === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', this.theme);
    localStorage.setItem('budget-theme', this.theme);
  },

  async loadConfig() { this.config = await API.getConfig(); return this.config; },

  getMonthName(mes) {
    return ['','Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'][mes] || '';
  },

  prevMonth() { this.currentMonth--; if (this.currentMonth < 1) { this.currentMonth = 12; this.currentYear--; } },
  nextMonth() { this.currentMonth++; if (this.currentMonth > 12) { this.currentMonth = 1; this.currentYear++; } }
};


// --- UTILITIES ---
const Utils = {
  formatCurrency(amount) {
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount || 0);
  },
  formatDate(dateStr) {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
  },
  formatDateShort(dateStr) {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' });
  },
  escapeHtml(str) {
    if (!str) return '';
    const d = document.createElement('div'); d.textContent = str; return d.innerHTML;
  },
  async fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result.split(',')[1]);
      r.onerror = reject;
      r.readAsDataURL(file);
    });
  },
  showAlert(message, type = 'info') {
    const c = document.getElementById('alert-container');
    const a = document.createElement('div');
    a.className = `alert alert-${type}`;
    a.innerHTML = `<span>${message}</span>`;
    c.appendChild(a);
    setTimeout(() => a.remove(), 5000);
  },
  downloadCSV(csv, filename) {
    const b = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const l = document.createElement('a');
    l.href = URL.createObjectURL(b); l.download = filename; l.click();
  },
  buildCategorySelect(config, selectedCat, selectedSub) {
    if (!config) return { catOptions: '', subOptions: '' };
    const cats = [...new Set(config.categorias.map(c => c.categoria))];
    let catOptions = '<option value="">— Seleccionar —</option>';
    cats.forEach(c => { catOptions += `<option value="${c}" ${c === selectedCat ? 'selected' : ''}>${c}</option>`; });
    let subOptions = '<option value="">— Seleccionar —</option>';
    if (selectedCat && config.categoriasGrouped[selectedCat]) {
      config.categoriasGrouped[selectedCat].forEach(s => { subOptions += `<option value="${s}" ${s === selectedSub ? 'selected' : ''}>${s}</option>`; });
    }
    return { catOptions, subOptions };
  },
  buildCuentaSelect(config, selected) {
    if (!config) return '';
    let o = '<option value="">— Seleccionar —</option>';
    config.cuentas.forEach(c => { o += `<option value="${c}" ${c === selected ? 'selected' : ''}>${c}</option>`; });
    return o;
  },
  buildCasaSelect(config, selected) {
    if (!config) return '';
    let o = '<option value="">— Seleccionar —</option>';
    config.casas.forEach(c => { o += `<option value="${c}" ${c === selected ? 'selected' : ''}>${c}</option>`; });
    return o;
  }
};


// --- BOOTSTRAP ---
document.addEventListener('DOMContentLoaded', () => {
  AppState.init();
  GoogleAuth.init();
});
