// ============================================================
// Budget App — Master Logic Engine (v1.44 - FULL LEGACY)
// ============================================================

// --- DEFINICIÓN DE COLUMNAS (LEGACY PROTEGIDO) ---
const GASTOS_COLS = { ID: 0, YEAR: 1, MONTH: 2, DATE: 3, DESC: 4, IMPORTE: 5, CASA: 7, CATEGORIA: 8, SUBCAT: 9, ESTADO: 12, HASH: 13 };
const INGRESOS_COLS = { ID: 0, YEAR: 1, MONTH: 2, DATE: 3, DESC: 4, IMPORTE: 5, HASH: 10 };

const BudgetLogic = {
  async loadConfig() {
    try {
      if (typeof CONFIG === 'undefined') throw new Error("CONFIG_MISSING");
      const rows = await SheetsAPI.readSheet(CONFIG.SHEETS.CONFIG);
      const cfg = { categorias: {}, cuentas: [], casas: [] };
      if (!rows || rows.length <= 1) return cfg;

      rows.slice(1).forEach((row, index) => {
        const rowIdx = index + 2;
        // Dimension 1: Categorías (Col A/B)
        if (row[0] && row[4] !== 'DELETED') {
          const cat = row[0].trim();
          if (!cfg.categorias[cat]) cfg.categorias[cat] = [];
          if (row[1] && row[1].trim() !== "" && row[1].trim() !== 'General') {
            cfg.categorias[cat].push(row[1].trim());
          }
        }
        // Dimensión 2: Casas (Col D - Tabla Maestra)
        if (row[3] && row[3].trim() !== "" && row[5] !== 'DELETED') {
          cfg.casas.push({ name: row[3].trim(), row: rowIdx });
        }
        // Cuentas (Col C)
        if (row[2] && row[2].trim() !== "") cfg.cuentas.push(row[2].trim());
      });
      AppState.config = cfg;
      return cfg;
    } catch (e) { console.error("Error loadConfig:", e); throw e; }
  },

  sniffAccount(rawText, accounts) {
    if (!rawText || !accounts) return null;
    const cleanText = rawText.replace(/[\s-]/g, '');
    for (const acc of accounts) {
      const cleanID = String(acc[1] || '').replace(/[\s-]/g, '');
      if (cleanID && cleanText.includes(cleanID)) return acc;
    }
    return null;
  },

  async getDashboardData(y, m) {
    const g = await SheetsAPI.readSheet(CONFIG.SHEETS.GASTOS);
    const i = await SheetsAPI.readSheet(CONFIG.SHEETS.INGRESOS);
    const b = await SheetsAPI.readSheet(CONFIG.SHEETS.BUDGET_PLAN);
    
    const f = (arr, yr, mo) => arr.slice(1).filter(r => r[1] == yr && r[2] == mo);
    const actG = f(g, y, m), actI = f(i, y, m), planG = b.slice(1).filter(r => r[0] == y && r[1] == m);
    
    const funding = {};
    planG.forEach(p => {
      // One-off Legacy check
      const isPaid = (p[8] === 'One-off') && actG.some(a => a[GASTOS_COLS.CATEGORIA] === p[6] && Math.abs(parseFloat(a[GASTOS_COLS.IMPORTE]) - parseFloat(p[3])) < 10);
      if (!isPaid) { const acc = p[4] || 'Principal'; funding[acc] = (funding[acc] || 0) + parseFloat(p[3]); }
    });

    return { 
      totalGastos: actG.reduce((a,b) => a + (parseFloat(b[GASTOS_COLS.IMPORTE])||0), 0), 
      totalIngresos: actI.reduce((a,b) => a + (parseFloat(b[INGRESOS_COLS.IMPORTE])||0), 0), 
      plannedGastos: planG.reduce((a,b) => a + (parseFloat(b[3])||0), 0), 
      fundingPlan: funding, 
      pendingCount: g.filter(r => r[GASTOS_COLS.ESTADO] === 'Pendiente').length 
    };
  }
};
