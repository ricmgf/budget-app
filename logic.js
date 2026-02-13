// ============================================================
// Budget App — Master Logic Engine (v1.27 - Robust)
// ============================================================

const BudgetLogic = {
  async loadConfig() {
    try {
      const rows = await SheetsAPI.readSheet(CONFIG.SHEETS.CONFIG);
      if (!rows || rows.length === 0) throw new Error("ERROR_CONEXION_BACKEND");

      const cfg = { categorias: {}, cuentas: [], casas: [] };
      
      rows.slice(1).forEach(row => {
        // Filtrado de borrado lógico y limpieza
        if (row[0] && row[4] !== 'DELETED') { 
          const cat = row[0].trim();
          if (!cfg.categorias[cat]) cfg.categorias[cat] = []; 
          if (row[1] && row[1].trim() !== "" && row[1] !== 'General') {
            cfg.categorias[cat].push(row[1].trim()); 
          }
        }
        // Captura de datos para los desplegables de Ajustes (Col 3 y 4)
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
      console.error("Fallo de arquitectura en loadConfig:", e);
      throw e;
    }
  },

  // --- LEGACY INTACTO: Sniffer, Hash, Dashboard Data ---
  sniffAccount(rawText, accounts) {
    if (!rawText || !accounts) return null;
    const cleanText = rawText.replace(/[\s-]/g, '');
    for (const acc of accounts) {
      const cleanID = String(acc[1] || '').replace(/[\s-]/g, '');
      if (cleanID && cleanText.includes(cleanID)) return acc;
    }
    return null;
  }
};
