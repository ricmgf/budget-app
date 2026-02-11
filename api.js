// ============================================================
// Budget App — API Client & State Management
// ============================================================

const API = {
  // Replace with your deployed Apps Script Web App URL
  BASE_URL: 'https://script.google.com/macros/s/AKfycbwU2zx28aD5GWqX3olg8tv3zFtOQ4RMBMGyV0emPAEGaOLZHJYstHcKbqYa--enKisK/exec',

  async call(action, data = null) {
    const url = new URL(this.BASE_URL);
    url.searchParams.set('action', action);

    const opts = { redirect: 'follow' };

    if (data) {
      opts.method = 'POST';
      opts.headers = { 'Content-Type': 'text/plain' };
      opts.body = JSON.stringify(data);
    }

    try {
      const res = await fetch(url.toString(), opts);
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      return json;
    } catch (err) {
      console.error(`API error [${action}]:`, err);
      throw err;
    }
  },

  // CONFIG
  getConfig: () => API.call('getConfig'),
  addCategory: (cat, sub) => API.call('addCategory', { categoria: cat, subcategoria: sub }),
  deleteCategory: (cat, sub) => API.call('deleteCategory', { categoria: cat, subcategoria: sub }),
  addCuenta: (cuenta) => API.call('addCuenta', { cuenta }),
  addCasa: (casa) => API.call('addCasa', { casa }),

  // GASTOS
  getGastos: (params = {}) => {
    const url = new URL(API.BASE_URL);
    url.searchParams.set('action', 'getGastos');
    Object.entries(params).forEach(([k, v]) => { if (v) url.searchParams.set(k, v); });
    return fetch(url.toString(), { redirect: 'follow' }).then(r => r.json());
  },
  getPending: (params = {}) => {
    const url = new URL(API.BASE_URL);
    url.searchParams.set('action', 'getPendingGastos');
    Object.entries(params).forEach(([k, v]) => { if (v) url.searchParams.set(k, v); });
    return fetch(url.toString(), { redirect: 'follow' }).then(r => r.json());
  },
  addManualGasto: (data) => API.call('addManualGasto', data),
  updateGasto: (data) => API.call('updateGasto', data),
  bulkUpdateGastos: (data) => API.call('bulkUpdateGastos', data),

  // IMPORT
  importTransactions: (data) => API.call('importTransactions', data),

  // RULES
  getRules: () => API.call('getRules'),
  addRule: (data) => API.call('addRule', data),
  updateRule: (data) => API.call('updateRule', data),
  deleteRule: (data) => API.call('deleteRule', data),
  testRule: (data) => API.call('testRule', data),
  applyRuleRetroactive: (ruleId) => API.call('applyRuleRetroactive', { ruleId }),

  // INGRESOS
  getIngresos: (params = {}) => {
    const url = new URL(API.BASE_URL);
    url.searchParams.set('action', 'getIngresos');
    Object.entries(params).forEach(([k, v]) => { if (v) url.searchParams.set(k, v); });
    return fetch(url.toString(), { redirect: 'follow' }).then(r => r.json());
  },
  addIngreso: (data) => API.call('addIngreso', data),
  updateIngreso: (data) => API.call('updateIngreso', data),
  deleteIngreso: (data) => API.call('deleteIngreso', data),

  // BALANCES
  getBalances: (params = {}) => {
    const url = new URL(API.BASE_URL);
    url.searchParams.set('action', 'getBalances');
    Object.entries(params).forEach(([k, v]) => { if (v) url.searchParams.set(k, v); });
    return fetch(url.toString(), { redirect: 'follow' }).then(r => r.json());
  },
  updateBalance: (data) => API.call('updateBalance', data),
  calculateCashFlow: (data) => API.call('calculateCashFlow', data),

  // REPORTING
  getDashboard: (params = {}) => {
    const url = new URL(API.BASE_URL);
    url.searchParams.set('action', 'getDashboardData');
    Object.entries(params).forEach(([k, v]) => { if (v) url.searchParams.set(k, v); });
    return fetch(url.toString(), { redirect: 'follow' }).then(r => r.json());
  },
  getMonthlySummary: (año, mes) => {
    const url = new URL(API.BASE_URL);
    url.searchParams.set('action', 'getMonthlySummary');
    url.searchParams.set('año', año);
    url.searchParams.set('mes', mes);
    return fetch(url.toString(), { redirect: 'follow' }).then(r => r.json());
  },
  getAnnualSummary: (año) => {
    const url = new URL(API.BASE_URL);
    url.searchParams.set('action', 'getAnnualSummary');
    url.searchParams.set('año', año);
    return fetch(url.toString(), { redirect: 'follow' }).then(r => r.json());
  },
  getCasaSummary: (año, mes) => {
    const url = new URL(API.BASE_URL);
    url.searchParams.set('action', 'getCasaSummary');
    url.searchParams.set('año', año);
    if (mes) url.searchParams.set('mes', mes);
    return fetch(url.toString(), { redirect: 'follow' }).then(r => r.json());
  },
  exportGastos: (params = {}) => {
    const url = new URL(API.BASE_URL);
    url.searchParams.set('action', 'exportGastos');
    Object.entries(params).forEach(([k, v]) => { if (v) url.searchParams.set(k, v); });
    return fetch(url.toString(), { redirect: 'follow' }).then(r => r.json());
  }
};

// ============================================================
// App State
// ============================================================
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

// ============================================================
// Utility functions
// ============================================================
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
      reader.onload = () => {
        const base64 = reader.result.split(',')[1];
        resolve(base64);
      };
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
