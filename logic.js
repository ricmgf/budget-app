// ============================================================
// Budget App — Master Logic Engine (v1.25 - Enterprise Fix)
// ============================================================

const BudgetLogic = {
  async loadConfig() {
    try {
      // Forzamos la obtención de datos fresca del backend
      const rows = await SheetsAPI.readSheet(CONFIG.SHEETS.CONFIG);
      const cfg = { categorias: {}, cuentas: [], casas: [] };
      
      if (!rows || rows.length === 0) throw new Error("No se pudo leer la hoja CONFIG");

      rows.slice(1).forEach(row => {
        // Ignoramos filas borradas lógicamente
        if (row[0] && row[4] !== 'DELETED') { 
          const cat = row[0].trim();
          if (!cfg.categorias[cat]) cfg.categorias[cat] = []; 
          if (row[1] && row[1].trim() !== "" && row[1] !== 'General') {
            cfg.categorias[cat].push(row[1].trim()); 
          }
        }
        // IMPORTANTE: Captura de Cuentas y Casas (Indices 2 y 3)
        if (row[2] && row[2].trim() !== "" && !cfg.cuentas.includes(row[2].trim())) {
          cfg.cuentas.push(row[2].trim());
        }
        if (row[3] && row[3].trim() !== "" && !cfg.casas.includes(row[3].trim())) {
          cfg.casas.push(row[3].trim());
        }
      });

      AppState.config = cfg;
      return cfg;
    } catch (e) {
      console.error("Error crítico de arquitectura en loadConfig:", e);
      throw e;
    }
  },

  // --- LEGACY INTACTO (Sniffer, Hash, Dashboard Data) ---
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
      const isPaid = (p[8] === 'One-off') && actG.some(a => a[8] === p[6] && Math.abs(parseFloat(a[5]) - parseFloat(p[3])) < 10);
      if (!isPaid) { const acc = p[4] || 'Principal'; funding[acc] = (funding[acc] || 0) + parseFloat(p[3]); }
    });
    return { 
      totalGastos: actG.reduce((a,b) => a + (parseFloat(b[5])||0), 0), 
      totalIngresos: actI.reduce((a,b) => a + (parseFloat(b[5])||0), 0), 
      plannedGastos: planG.reduce((a,b) => a + (parseFloat(b[3])||0), 0), 
      fundingPlan: funding, 
      pendingCount: g.filter(r => r[12] === 'Pendiente').length 
    };
  }
};
