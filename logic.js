/**
 * [ARCHIVO_PROTEGIDO_V1.55_ESTABLE]
 * ⚠️ PROHIBIDO MODIFICAR EL MOTOR DE LÓGICA Y MAPEOS DE COLUMNAS.
 */
const BudgetLogic = {
  async loadConfig() {
    try {
      const rows = await SheetsAPI.readSheet(CONFIG.SHEETS.CONFIG);
      const cfg = { categorias: {}, cuentas: [], casas: [], tarjetas: [] };
      if (!rows || rows.length <= 1) return cfg;

      rows.slice(1).forEach((row, index) => {
        const rowIdx = index + 2;
        if (row[0] && row[4] !== 'DELETED') {
          const cat = row[0].trim();
          if (!cfg.categorias[cat]) cfg.categorias[cat] = [];
          if (row[1] && row[1].trim() !== "") cfg.categorias[cat].push(row[1].trim());
        }
        // Columna D: Casas (Legacy Fix)
        if (row[3] && row[3].trim() !== "" && row[5] !== 'DELETED') {
          cfg.casas.push({ name: row[3].trim(), row: rowIdx });
        }
        // Columna E: Tarjetas
        if (row[4] && row[4].trim() !== "" && row[4].trim() !== 'DELETED' && row[6] !== 'DELETED') {
          cfg.tarjetas.push({ name: row[4].trim(), row: rowIdx });
        }
      });
      AppState.config = cfg;
      return cfg;
    } catch (e) {
      console.error("Error loadConfig:", e);
      throw e;
    }
  },

  async getDashboardData(y, m) {
    const g = await SheetsAPI.readSheet(CONFIG.SHEETS.GASTOS);
    const i = await SheetsAPI.readSheet(CONFIG.SHEETS.INGRESOS);
    
    const f = (arr, yr, mo) => arr.slice(1).filter(r => r[1] == yr && r[2] == mo);
    const actG = f(g, y, m), actI = f(i, y, m);
    
    const totalG = actG.reduce((acc, r) => acc + parseFloat(r[5] || 0), 0);
    const totalI = actI.reduce((acc, r) => acc + parseFloat(r[5] || 0), 0);

    return { 
      gastos: actG, ingresos: actI, 
      resumen: { totalGastos: totalG, totalIngresos: totalI, ahorro: totalI - totalG }
    };
  }
};
