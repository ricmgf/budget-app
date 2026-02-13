// ============================================================
// Budget App — Master Logic Engine (v1.35 - FULL LEGACY)
// ============================================================

const BudgetLogic = {
  async loadConfig() {
    try {
      const rows = await SheetsAPI.readSheet(CONFIG.SHEETS.CONFIG);
      const cfg = { categorias: {}, cuentas: [], casas: [] };
      if (!rows || rows.length <= 1) return cfg;

      rows.slice(1).forEach((row, index) => {
        const rowIdx = index + 2;
        // Col A: Categorías
        if (row[0] && row[4] !== 'DELETED') {
          const cat = row[0].trim();
          if (!cfg.categorias[cat]) cfg.categorias[cat] = [];
          if (row[1] && row[1].trim() !== "") cfg.categorias[cat].push(row[1].trim());
        }
        // Col D: Tabla Maestra de CASAS (Tu "Otros" entrará aquí)
        if (row[3] && row[3].trim() !== "" && row[5] !== 'DELETED') {
          cfg.casas.push({ name: row[3].trim(), row: rowIdx });
        }
      });
      AppState.config = cfg;
      return cfg;
    } catch (e) { console.error("Error loadConfig:", e); throw e; }
  },

  // LEGACY: Sniffer por IBAN/ID
  sniffAccount(rawText, accounts) {
    if (!rawText || !accounts) return null;
    const cleanText = rawText.replace(/[\s-]/g, '');
    for (const acc of accounts) {
      const cleanID = String(acc[1] || '').replace(/[\s-]/g, '');
      if (cleanID && cleanText.includes(cleanID)) return acc;
    }
    return null;
  },

  // LEGACY: Hash de seguridad (Deduplicación)
  generateHash(d, a, c, acc) {
    const s = `${d}|${Math.abs(a).toFixed(2)}|${(c||'').toLowerCase().replace(/[^a-z0-9]/g,'')}|${acc}`;
    let h = 0; for (let i = 0; i < s.length; i++) { h = ((h << 5) - h) + s.charCodeAt(i); h |= 0; }
    return 'h' + Math.abs(h);
  },

  // LEGACY: Dashboard con 14 columnas y One-offs
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
