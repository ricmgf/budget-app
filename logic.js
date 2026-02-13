/**
 * [BLOQUE_ACTUALIZADO_V1.6] - MOTOR DE LÓGICA
 */
const BudgetLogic = {
  async loadConfig() {
    try {
      const rows = await SheetsAPI.readSheet(CONFIG.SHEETS.CONFIG);
      const cfg = { categorias: {}, cuentas: [], casas: [] };
      if (!rows || rows.length <= 1) return cfg;

      rows.slice(1).forEach((row, index) => {
        const rowIdx = index + 2;
        // Filtro de borrado lógico
        if (row[4] === 'DELETED') return;

        if (row[0]) {
          const cat = row[0].trim();
          if (!cfg.categorias[cat]) cfg.categorias[cat] = [];
          if (row[1] && row[1].trim() !== "") cfg.categorias[cat].push(row[1].trim());
        }
        // Columna D (Índice 3): Casas - REGLA DE ORO MANTENIDA
        if (row[3] && row[3].trim() !== "") {
          cfg.casas.push({ name: row[3].trim(), row: rowIdx });
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
    
    // Filtro avanzado: Solo año/mes Y que no estén DELETED
    const filterData = (arr, yr, mo, deleteCol) => 
      arr.slice(1).filter(r => r[1] == yr && r[2] == mo && r[deleteCol] !== 'DELETED');

    const actG = filterData(g, y, m, 10);
    const actI = filterData(i, y, m, 7);
    
    // Los cálculos de totales se hacen aquí en JS, no en Sheets
    const totalG = actG.reduce((acc, r) => acc + parseFloat(r[5] || 0), 0);
    const totalI = actI.reduce((acc, r) => acc + parseFloat(r[5] || 0), 0);

    return { 
      gastos: actG, 
      ingresos: actI, 
      resumen: { totalGastos: totalG, totalIngresos: totalI, ahorro: totalI - totalG }
    };
  }
};
