// ============================================================
// Budget App — Master Logic Engine (v1.22 - Enterprise Fix)
// ============================================================

const BudgetLogic = {
  async loadConfig() {
    try {
      const rows = await SheetsAPI.readSheet(CONFIG.SHEETS.CONFIG);
      const cfg = { categorias: {}, cuentas: [], casas: [] };
      
      if (rows && rows.length > 0) {
        rows.slice(1).forEach(row => {
          // Filtrado de borrados y limpieza de texto
          const catName = row[0] ? row[0].trim() : null;
          const subName = row[1] ? row[1].trim() : null;
          const isDeleted = row[4] === 'DELETED';

          if (catName && !isDeleted) {
            if (!cfg.categorias[catName]) cfg.categorias[catName] = [];
            if (subName && subName !== "" && subName !== 'General') {
              cfg.categorias[catName].push(subName);
            }
          }
          if (row[2] && row[2].trim() !== "" && !cfg.cuentas.includes(row[2].trim())) {
            cfg.cuentas.push(row[2].trim());
          }
          if (row[3] && row[3].trim() !== "" && !cfg.casas.includes(row[3].trim())) {
            cfg.casas.push(row[3].trim());
          }
        });
      }
      AppState.config = cfg;
      return cfg;
    } catch (e) {
      console.error("Error cargando CONFIG:", e);
      return { categorias: {}, cuentas: [], casas: [] };
    }
  },
  // Mantenemos intacto el resto del Legacy: sniffAccount, excelToDate, processImport, getDashboardData...
  generateHash(d, a, c, acc) {
    const s = `${d}|${Math.abs(a).toFixed(2)}|${(c||'').toLowerCase().replace(/[^a-z0-9]/g,'')}|${acc}`;
    let h = 0; for (let i = 0; i < s.length; i++) { h = ((h << 5) - h) + s.charCodeAt(i); h |= 0; }
    return 'h' + Math.abs(h);
  }
};
