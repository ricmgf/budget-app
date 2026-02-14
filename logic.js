const BudgetLogic = {
  async loadConfig() {
    try {
      const rows = await SheetsAPI.readSheet(CONFIG.SHEETS.CONFIG);
      const cfg = { categorias: {}, cuentas: [], casas: [], tarjetas: [] };
      if (!rows || rows.length <= 1) return cfg;

      rows.slice(1).forEach((row, index) => {
        const rowIdx = index + 2;
        // Col A: Categoría Principal | Col B: Subcategoría
        if (row[0] && row[0].trim() !== "" && row[0] !== 'DELETED') {
          const cat = row[0].trim();
          if (!cfg.categorias[cat]) cfg.categorias[cat] = [];
          if (row[1] && row[1].trim() !== "") {
            cfg.categorias[cat].push(row[1].trim());
          }
        }
        // Col D: Casas | Col F: Flag Borrado Casas
        if (row[3] && row[3].trim() !== "" && row[5] !== 'DELETED') {
          cfg.casas.push({ name: row[3].trim(), row: rowIdx });
        }
        // Col E: Tarjetas | Col G: Flag Borrado Tarjetas
        if (row[4] && row[4].trim() !== "" && row[6] !== 'DELETED') {
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
    try {
      const g = await SheetsAPI.readSheet(CONFIG.SHEETS.GASTOS);
      const i = await SheetsAPI.readSheet(CONFIG.SHEETS.INGRESOS);
      
      const filterFn = (arr, yr, mo) => arr.slice(1).filter(r => 
        r[1] == yr && r[2] == mo && r[0] !== 'DELETED'
      );

      const actG = filterFn(g, y, m);
      const actI = filterFn(i, y, m);

      return { 
        resumen: { 
          totalGastos: actG.reduce((acc, r) => acc + parseFloat(r[5] || 0), 0), 
          totalIngresos: actI.reduce((acc, r) => acc + parseFloat(r[5] || 0), 0) 
        }, 
        pendingCount: actG.filter(r => !r[3] || !r[4]).length 
      };
    } catch (e) {
      console.error("Error getDashboardData:", e);
      return { resumen: { totalGastos: 0, totalIngresos: 0 }, pendingCount: 0 };
    }
  }
};
