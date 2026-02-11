// ============================================================
// Budget App — Google Auth + API Client + State
// ============================================================

// --- GOOGLE AUTH MODULE ---
const GoogleAuth = {
  clientId: '824143713001-hkpisl7k9js7001f87o80jpoq86k4cm2.apps.googleusercontent.com',
  accessToken: null,
  userEmail: null,
  userName: null,
  tokenClient: null,

  init() {
    return new Promise((resolve) => {
      // Wait for GIS library to load
      const check = () => {
        if (typeof google !== 'undefined' && google.accounts) {
          this._initGIS(resolve);
        } else {
          setTimeout(check, 100);
        }
      };
      check();
    });
  },

  _initGIS(resolve) {
    // Initialize the token client for OAuth 2.0
    this.tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: this.clientId,
      scope: 'email profile',
      callback: (response) => {
        if (response.access_token) {
          this.accessToken = response.access_token;
          this._fetchUserInfo().then(() => {
            this._onSignedIn();
            resolve(true);
          });
        } else {
          console.error('Token error:', response);
          this._showError('Sign-in failed. Please try again.');
          resolve(false);
        }
      },
      error_callback: (err) => {
        console.error('GIS error:', err);
        // User closed the popup — not a fatal error
        resolve(false);
      }
    });

    // Render the Google Sign-In button
    google.accounts.id.initialize({
      client_id: this.clientId,
      callback: (response) => this._handleCredentialResponse(response, resolve),
      auto_select: true, // Auto sign-in if previously authenticated
    });

    google.accounts.id.renderButton(
      document.getElementById('google-signin-btn'),
      {
        theme: 'outline',
        size: 'large',
        text: 'signin_with',
        shape: 'rectangular',
        width: 280
      }
    );

    // Also prompt One Tap
    google.accounts.id.prompt((notification) => {
      if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
        // One Tap not available, user will use the button
      }
    });
  },

  _handleCredentialResponse(response, resolve) {
    if (response.credential) {
      // Decode the JWT to get user info
      const payload = JSON.parse(atob(response.credential.split('.')[1]));
      this.userEmail = payload.email;
      this.userName = payload.name;

      // Now get an access token for API calls
      this.tokenClient.requestAccessToken({ hint: payload.email });
    }
  },

  async _fetchUserInfo() {
    if (!this.accessToken) return;
    try {
      const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { 'Authorization': `Bearer ${this.accessToken}` }
      });
      const info = await res.json();
      this.userEmail = info.email;
      this.userName = info.name;
    } catch (e) {
      console.warn('Could not fetch user info:', e);
    }
  },

  _onSignedIn() {
    // Hide sign-in overlay
    const overlay = document.getElementById('signin-overlay');
    if (overlay) overlay.style.display = 'none';

    // Show user info in sidebar
    const userInfo = document.getElementById('user-info');
    if (userInfo) userInfo.textContent = this.userEmail || this.userName || '';

    // Initialize the app
    initApp();
  },

  _showError(msg) {
    const el = document.getElementById('signin-error');
    if (el) { el.textContent = msg; el.style.display = 'block'; }
  },

  signOut() {
    this.accessToken = null;
    this.userEmail = null;
    google.accounts.id.disableAutoSelect();
    // Show sign-in overlay again
    const overlay = document.getElementById('signin-overlay');
    if (overlay) overlay.style.display = 'flex';
  },

  getToken() {
    return this.accessToken;
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

    // Include token as parameter for Apps Script (since it can't read Auth headers easily)
    url.searchParams.set('token', token);

    const opts = { 
      method: data ? 'POST' : 'GET',
      redirect: 'follow'
    };

    if (data) {
      opts.headers = { 'Content-Type': 'text/plain' };
      opts.body = JSON.stringify({ ...data, _token: token });
    }

    try {
      const res = await fetch(url.toString(), opts);
      const text = await res.text();
      
      // Apps Script sometimes returns HTML on auth errors
      if (text.startsWith('<!DOCTYPE') || text.startsWith('<html')) {
        throw new Error('Authentication error. Please sign out and sign in again.');
      }
      
      const json = JSON.parse(text);
      if (json.error) throw new Error(json.error);
      return json;
    } catch (err) {
      if (err.message.includes('Failed to fetch')) {
        throw new Error('Network error. Check your connection and try again.');
      }
      throw err;
    }
  },

  // Convenience method for GET requests with query params
  async get(action, params = {}) {
    const token = GoogleAuth.getToken();
    if (!token) throw new Error('Not authenticated.');

    const url = new URL(this.BASE_URL);
    url.searchParams.set('action', action);
    url.searchParams.set('token', token);
    Object.entries(params).forEach(([k, v]) => { if (v) url.searchParams.set(k, v); });

    const res = await fetch(url.toString(), { redirect: 'follow' });
    const text = await res.text();
    if (text.startsWith('<!DOCTYPE') || text.startsWith('<html')) {
      throw new Error('Authentication error.');
    }
    const json = JSON.parse(text);
    if (json.error) throw new Error(json.error);
    return json;
  },

  // --- CONFIG ---
  getConfig: () => API.get('getConfig'),
  addCategory: (cat, sub) => API.call('addCategory', { categoria: cat, subcategoria: sub }),
  deleteCategory: (cat, sub) => API.call('deleteCategory', { categoria: cat, subcategoria: sub }),
  addCuenta: (cuenta) => API.call('addCuenta', { cuenta }),
  addCasa: (casa) => API.call('addCasa', { casa }),

  // --- GASTOS ---
  getGastos: (params = {}) => API.get('getGastos', params),
  getPending: (params = {}) => API.get('getPendingGastos', params),
  addManualGasto: (data) => API.call('addManualGasto', data),
  updateGasto: (data) => API.call('updateGasto', data),
  bulkUpdateGastos: (data) => API.call('bulkUpdateGastos', data),

  // --- IMPORT ---
  importTransactions: (data) => API.call('importTransactions', data),

  // --- RULES ---
  getRules: () => API.get('getRules'),
  addRule: (data) => API.call('addRule', data),
  updateRule: (data) => API.call('updateRule', data),
  deleteRule: (data) => API.call('deleteRule', data),
  testRule: (data) => API.call('testRule', data),
  applyRuleRetroactive: (ruleId) => API.call('applyRuleRetroactive', { ruleId }),

  // --- INGRESOS ---
  getIngresos: (params = {}) => API.get('getIngresos', params),
  addIngreso: (data) => API.call('addIngreso', data),
  updateIngreso: (data) => API.call('updateIngreso', data),
  deleteIngreso: (data) => API.call('deleteIngreso', data),

  // --- BALANCES ---
  getBalances: (params = {}) => API.get('getBalances', params),
  updateBalance: (data) => API.call('updateBalance', data),
  calculateCashFlow: (data) => API.call('calculateCashFlow', data),

  // --- REPORTING ---
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

  init() {
    document.documentElement.setAttribute('data-theme', this.theme);
  },

  toggleTheme() {
    this.theme = this.theme === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', this.theme);
    localStorage.setItem('budget-theme', this.theme);
  },

  async loadConfig() {
    this.config = await API.getConfig();
    return this.config;
  },

  getMonthName(mes) {
    const names = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    return names[mes] || '';
  },

  prevMonth() {
    this.currentMonth--;
    if (this.currentMonth < 1) { this.currentMonth = 12; this.currentYear--; }
  },

  nextMonth() {
    this.currentMonth++;
    if (this.currentMonth > 12) { this.currentMonth = 1; this.currentYear++; }
  }
};


// --- UTILITIES ---
const Utils = {
  formatCurrency(amount) {
    return new Intl.NumberFormat('es-ES', {
      style: 'currency', currency: 'EUR',
      minimumFractionDigits: 2, maximumFractionDigits: 2
    }).format(amount || 0);
  },

  formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
  },

  formatDateShort(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' });
  },

  escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  },

  async fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  },

  showAlert(message, type = 'info') {
    const container = document.getElementById('alert-container');
    const alert = document.createElement('div');
    alert.className = `alert alert-${type}`;
    alert.innerHTML = `<span>${message}</span>`;
    container.appendChild(alert);
    setTimeout(() => alert.remove(), 5000);
  },

  downloadCSV(csvContent, filename) {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
  },

  buildCategorySelect(config, selectedCat, selectedSub) {
    if (!config) return { catOptions: '', subOptions: '' };
    const cats = [...new Set(config.categorias.map(c => c.categoria))];
    let catOptions = '<option value="">— Seleccionar —</option>';
    cats.forEach(c => {
      catOptions += `<option value="${c}" ${c === selectedCat ? 'selected' : ''}>${c}</option>`;
    });
    let subOptions = '<option value="">— Seleccionar —</option>';
    if (selectedCat && config.categoriasGrouped[selectedCat]) {
      config.categoriasGrouped[selectedCat].forEach(s => {
        subOptions += `<option value="${s}" ${s === selectedSub ? 'selected' : ''}>${s}</option>`;
      });
    }
    return { catOptions, subOptions };
  },

  buildCuentaSelect(config, selected) {
    if (!config) return '';
    let opts = '<option value="">— Seleccionar —</option>';
    config.cuentas.forEach(c => {
      opts += `<option value="${c}" ${c === selected ? 'selected' : ''}>${c}</option>`;
    });
    return opts;
  },

  buildCasaSelect(config, selected) {
    if (!config) return '';
    let opts = '<option value="">— Seleccionar —</option>';
    config.casas.forEach(c => {
      opts += `<option value="${c}" ${c === selected ? 'selected' : ''}>${c}</option>`;
    });
    return opts;
  }
};


// --- BOOTSTRAP: Wait for GIS then authenticate ---
document.addEventListener('DOMContentLoaded', () => {
  AppState.init();
  GoogleAuth.init();
});
