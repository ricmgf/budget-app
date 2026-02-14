/**
 * [MASTER_LOGIC_V2.3.5_RESTAURADO]
 * REGLA DE ORO: AUTH GOOGLE PRESERVADA.
 */

const BudgetLogic = {
  config: null,
  loadConfig: async function() {
    try {
      const config = await SheetsAPI.runScript('getFullConfig');
      this.config = {
        categorias: config.categorias || {},
        casas: config.casas || [],
        tarjetas: config.tarjetas || []
      };
      AppState.config = this.config;
      return this.config;
    } catch (e) {
      console.error("Error loadConfig:", e);
      throw e;
    }
  },
  getDashboardData: async function(year, month) {
    try {
      const results = await Promise.all([
        SheetsAPI.readSheet(`${month}_${year}`),
        SheetsAPI.readSheet(CONFIG.SHEETS.BUDGET)
      ]);
      const transactions = results[0] || [];
      let totalGastos = 0, totalIngresos = 0, pendingCount = 0;
      transactions.slice(1).forEach(t => {
        if (t[0] === 'DELETED') return;
        const amount = parseFloat(t[2]) || 0;
        if (amount < 0) totalGastos += Math.abs(amount);
        else totalIngresos += amount;
        if (!t[3] || !t[4]) pendingCount++;
      });
      return { resumen: { totalGastos, totalIngresos }, pendingCount: pendingCount };
    } catch (e) { return { resumen: { totalGastos: 0, totalIngresos: 0 }, pendingCount: 0 }; }
  }
};

// --- NO TOCAR: SISTEMA DE LOGIN GOOGLE ---
let tokenClient;
let gapiInited = false;
let gsiInited = false;

function initGoogleAuth() {
  gapi.load('client', async () => {
    await gapi.client.init({
      apiKey: CONFIG.GOOGLE.API_KEY,
      discoveryDocs: [CONFIG.GOOGLE.DISCOVERY_DOC],
    });
    gapiInited = true;
    checkAuthReady();
  });
}

function initGIS() {
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CONFIG.GOOGLE.CLIENT_ID,
    scope: CONFIG.GOOGLE.SCOPES,
    callback: '',
  });
  gsiInited = true;
  checkAuthReady();
}

function checkAuthReady() {
  if (gapiInited && gsiInited) {
    const btn = document.getElementById('signin-btn');
    if (btn) btn.style.display = 'block';
  }
}

async function handleAuthClick() {
  tokenClient.callback = async (resp) => {
    if (resp.error !== undefined) throw (resp);
    document.getElementById('signin-overlay').style.display = 'none';
    initApp();
  };
  if (gapi.client.getToken() === null) {
    tokenClient.requestAccessToken({prompt: 'consent'});
  } else {
    tokenClient.requestAccessToken({prompt: ''});
  }
}
