/**
 * ============================================================
 * BUDGET APP — MASTER LOGIC ENGINE (v1.52 - RECONCILIATION)
 * ============================================================
 * [SEGURIDAD]: NO tocar las constantes GASTOS_COLS. 
 * El motor lee de 'config.js' para evitar SyntaxError.
 */

const BudgetLogic = {
  // Carga de configuración con Tabla Maestra de Casas (Col D)
  async loadConfig() {
    try {
      // Verificación de seguridad antes de llamar a Sheets
      if (typeof SheetsAPI === 'undefined') throw new Error("API_NOT_FOUND");
      
      const rows = await SheetsAPI.readSheet(CONFIG.SHEETS.CONFIG);
      const cfg = { categorias: {}, cuentas: [], casas: [] };
      if (!rows || rows.length <= 1) return cfg;

      rows.slice(1).forEach((row, index) => {
        const rowIdx = index + 2;
        // Categorías y Subcategorías (Col A/B)
        if (row[0] && row[4] !== 'DELETED') {
          const cat = row[0].trim();
          if (!cfg.categorias[cat]) cfg.categorias[cat] = [];
          if (row[1] && row[1].trim() !== "") cfg.categorias[cat].push(row[1].trim());
        }
        // Tabla Maestra de Casas (Col D / Index 3)
        if (row[3] && row[3].trim() !== "" && row[5] !== 'DELETED') {
          cfg.casas.push({ name: row[3].trim(), row: rowIdx });
        }
      });
      AppState.config = cfg;
      return cfg;
    } catch (e) {
      console.error("Error en BudgetLogic.loadConfig:", e);
      throw e;
    }
  },

  // Sniffer de bancos por ID (Legacy 1.34)
  sniffAccount(rawText, accounts) {
    if (!rawText || !accounts) return null;
    const cleanText = rawText.replace(/[\s-]/g, '');
    for (const acc of accounts) {
      const cleanID = String(acc[1] || '').replace(/[\s-]/g, '');
      if (cleanID && cleanText.includes(cleanID)) return acc;
    }
    return null;
  },

  // Cálculo del Dashboard (Legacy: Importe Col 5, Cat Col 8)
  async getDashboardData(y, m) {
    const g = await SheetsAPI.readSheet(CONFIG.SHEETS.GASTOS);
    const i = await SheetsAPI.readSheet(CONFIG.SHEETS.INGRESOS);
    const b = await SheetsAPI.readSheet(CONFIG.SHEETS.BUDGET_PLAN);
    
    const f = (arr, yr, mo) => arr.slice(1).filter(r => r[1] == yr && r[2] == mo);
    const actG = f(g, y, m);
    const actI = f(i, y, m);
    const planG = b.slice(1).filter(r => r[0] == y && r[1] == m);
    
    const funding = {};
    planG.forEach(p => {
      // Regla de One-offs: No suma si ya existe un gasto similar categorizado
      const isPaid = (p[8] === 'One-off') && actG.some(a => a[8] === p[6] && Math.abs(parseFloat(a[5]) - parseFloat(p[3])) < 10);
      if (!isPaid) { 
        const acc = p[4] || 'Principal'; 
        funding[acc] = (funding[acc] || 0) + parseFloat(p[3]); 
      }
    });

    return { 
      totalGastos: actG.reduce((sum, r) => sum + (parseFloat(r[5])||0), 0), 
      totalIngresos: actI.reduce((sum, r) => sum + (parseFloat(r[5])||0), 0), 
      plannedGastos: planG.reduce((sum, r) => sum + (parseFloat(r[3])||0), 0), 
      fundingPlan: funding, 
      pendingCount: g.filter(r => r[12] === 'Pendiente').length 
    };
  }
};
