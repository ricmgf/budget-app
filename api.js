// ============================================================
// Budget App — Auth + API Client + State + Utils
// ============================================================

// --- GLOBAL CALLBACK for Google Sign-In (data-callback in HTML) ---
function handleCredentialResponse(response) {
  console.log('[Auth] Credential response received');
  if (!response.credential) {
    console.error('[Auth] No credential in response');
    const el = document.getElementById('signin-error');
    if (el) { el.textContent = 'Sign-in failed. No credential received.'; el.style.display = 'block'; }
    return;
  }

  // Save JWT to localStorage (persists across browser restarts)
  localStorage.setItem('budget_id_token', response.credential);

  // Decode user info from JWT
  try {
    const payload = JSON.parse(atob(response.credential.split('.')[1]));
    console.log('[Auth] Signed in as:', payload.email);
    GoogleAuth.idToken = response.credential;
    GoogleAuth.userEmail = payload.email || '';
    GoogleAuth.userName = payload.name || '';
    GoogleAuth._onSignedIn();
  } catch (e) {
    console.error('[Auth] JWT decode error:', e);
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
    // Check for saved token
    const saved = localStorage.getItem('budget_id_token');
    if (saved) {
      try {
        const payload = JSON.parse(atob(saved.split('.')[1]));
        const exp = payload.exp * 1000;
        if (Date.now() < exp) {
          console.log('[Auth] Restored session for:', payload.email);
          this.idToken = saved;
          this.userEmail = payload.email || '';
          this.userName = payload.name || '';
          this._onSignedIn();
          return;
        } else {
          console.log('[Auth] Saved token expired, clearing');
          localStorage.removeItem('budget_id_token');
        }
      } catch (e) {
        console.warn('[Auth] Bad saved token, clearing');
        localStorage.removeItem('budget_id_token');
      }
    }
    console.log('[Auth] No valid token, showing sign-in screen');
    // Google button in HTML handles sign-in via data-callback
  },

  _onSignedIn() {
    const overlay = document.getElementById('signin-overlay');
    if (overlay) overlay.style.display = 'none';

    const userInfo = document.getElementById('user-info');
    if (userInfo) userInfo.textContent = this.userEmail || this.userName || 'Signed in';

    initApp();
  },

  signOut() {
    localStorage.removeItem('budget_id_token');
    this.idToken = null;
    this.userEmail = null;
    if (typeof google !== 'undefined' && google.accounts && google.accounts.id) {
      google.accounts.id.disableAutoSelect();
    }
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

    // Build URL with action and token
    const url = this.BASE_URL + '?action=' + encodeURIComponent(action) + '&id_token=' + encodeURIComponent(token);

    console.log('[API] Calling:', action);

    const opts = {
      method: data ? 'POST' : 'GET',
    };

    if (data) {
      opts.headers = { 'Content-Type': 'text/plain' };
      opts.body = JSON.stringify(data);
    }

    try {
      const res = await fetch(url, opts);
      console.log('[API] Response status:', res.status, 'redirected:', res.redirected, 'url:', res.url);

      const text = await res.text();
      console.log('[API] Response body (first 200 chars):', text.substring(0, 200));

      // Apps Script returns HTML when there's an auth redirect
      if (text.startsWith('<!DOCTYPE') || text.startsWith('<html') || text.startsWith('<HTML')) {
        console.error('[API] Got HTML response instead of JSON — likely auth redirect');
        throw new Error('Google returned an auth page instead of data. Your Apps Script deployment may need "Who has access: Anyone". See console for details.');
      }

      const json = JSON.parse(text);
      if (json.error) {
        console.error('[API] Server error:', json.error);
        throw new Error(json.error);
      }
      return json;
    } catch (err) {
      if (err.message.includes('Failed to fetch')) {
        console.error('[API] Network error — CORS or connectivity issue');
        throw new Error('Failed to fetch. This usually means CORS is blocking the request. Make sure Apps Script is deployed with "Who has access: Anyone" and you created a NEW version after code changes.');
      }
      throw err;
    }
  },

  async get(action, params = {}) {
    const token = GoogleAuth.getToken();
    if (!token) throw new Error('Not authenticated.');

    let url = this.BASE_URL + '?action=' + encodeURIComponent(action) + '&id_token=' + encodeURIComponent(token);
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') {
        url += '&' + encodeURIComponent(k) + '=' + encodeURIComponent(v);
      }
    });

    console.log('[API] GET:', action);

    const res = await fetch(url);
    console.log('[API] Response status:', res.status, 'redirected:', res.redirected);

    const text = await res.text();
    console.log('[API] Response (first 200 chars):', text.substring(0, 200));

    if (text.startsWith('<!DOCTYPE') || text.startsWith('<html') || text.startsWith('<HTML')) {
      console.error('[API] Got HTML instead of JSON');
      throw new Error('Google returned an auth page. Deploy Apps Script with "Who has access: Anyone".');
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
