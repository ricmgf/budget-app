/**
 * [BLOQUE_PROTEGIDO]: MOTOR DE LÓGICA v1.50 (LEGACY TOTAL)
 * ⚠️ NO DECLARAR 'GASTOS_COLS' O 'INGRESOS_COLS' (Vienen de config.js).
 */

const BudgetLogic = {
  // Carga de configuración incluyendo Casas (Col D), Cuentas (Col C) y Categorías (Col A/B)
  async loadConfig() {
    try {
      if (!window.gapi || !gapi.client || !gapi.client.sheets) throw new Error("API_NOT_READY");
      const rows = await SheetsAPI.readSheet(CONFIG.SHEETS.CONFIG);
      const cfg = { categorias: {}, cuentas: [], casas: [] };
      if (!rows || rows.length <= 1) return cfg;

      rows.slice(1).forEach((row, index) => {
        const rowIdx = index + 2;
        // Categorías y Subcategorías
        if (row[0] && row[4] !== 'DELETED') {
          const cat = row[0].trim();
          if (!cfg.categorias[cat]) cfg.categorias[cat] = [];
          if (row[1] && row[1].trim() !== "") cfg.categorias[cat].push(row[1].trim());
        }
        // Tabla Maestra de Casas (Col D / Index 3)
        if (row[3] && row[3].trim() !== "" && row[5] !== 'DELETED') {
          cfg.casas.push({ name: row[3].trim(), row: rowIdx });
        }
        // Cuentas Bancarias (Col C / Index 2)
        if (row[2] && row[2].trim() !== "") cfg.cuentas.push(row[2].trim());
      });
      AppState.config = cfg;
      return cfg;
    } catch (e) { console.error("Error loadConfig:", e); throw e; }
  },

  // Sniffer de cuentas: Identifica banco por los últimos dígitos (Legacy v1.38)
  sniffAccount(rawText, accounts) {
    if (!rawText || !accounts) return null;
    const cleanText = rawText.replace(/[\s-]/g, '');
    for (const acc of accounts) {
      const cleanID = String(acc[1] || '').replace(/[\s-]/g, '');
      if (cleanID && cleanText.includes(cleanID)) return acc;
    }
    return null;
  },

  // Lógica de Dashboard (Legacy: Mapeo exacto de columnas para sumatorios)
  async getDashboardData(y, m) {
    const g = await SheetsAPI.readSheet(CONFIG.SHEETS.GASTOS);
    const i = await SheetsAPI.readSheet(CONFIG.SHEETS.INGRESOS);
    const b = await SheetsAPI.readSheet(CONFIG.SHEETS.BUDGET_PLAN);
    
    const f = (arr, yr, mo) => arr.slice(1).filter(r => r[1] == yr && r[2] == mo);
    const actG = f(g, y, m), actI = f(i, y, m), planG = b.slice(1).filter(r => r[0] == y && r[1] == m);
    
    const funding = {};
    planG.forEach(p => {
      // Regla Legacy: Si es 'One-off' y el gasto real coincide con el planificado, no se suma al funding pendiente
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
