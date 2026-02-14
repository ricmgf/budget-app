/**
 * [MASTER_LOGIC_V2.2.1]
 * REGLA DE ORO: ARCHIVO COMPLETO.
 * SISTEMA: Puente de datos Excel -> AppState (Categorías, Casas, Tarjetas).
 */

const BudgetLogic = {
  config: null,

  loadConfig: async function() {
    try {
      const config = await SheetsAPI.runScript('getFullConfig');
      // Clonación absoluta: si casas funciona, tarjetas ahora también.
      this.config = {
        categorias: config.categorias || {},
        casas: config.casas || [],
        tarjetas: config.tarjetas || []
      };
      AppState.config = this.config;
      return this.config;
    } catch (e) {
      console.error("Error crítico en loadConfig (logic.js):", e);
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
      const budgetData = results[1] || [];
      
      let totalGastos = 0;
      let totalIngresos = 0;
      let pendingCount = 0;

      transactions.slice(1).forEach(t => {
        if (t[0] === 'DELETED') return;
        const amount = parseFloat(t[2]) || 0;
        if (amount < 0) totalGastos += Math.abs(amount);
        else totalIngresos += amount;
        if (!t[3] || !t[4]) pendingCount++;
      });

      return {
        resumen: { totalGastos, totalIngresos },
        pendingCount: pendingCount,
        plannedGastos: 0 // Se implementará en el módulo Budget
      };
    } catch (e) {
      console.error("Error getDashboardData:", e);
      return { resumen: { totalGastos: 0, totalIngresos: 0 }, pendingCount: 0 };
    }
  }
};
