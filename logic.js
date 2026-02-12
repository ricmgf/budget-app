// ============================================================
// Budget App — Master Logic Engine (Full Phase 1 & 2)
// ============================================================

const BudgetLogic = {
  async loadConfig() {
    const cached = await DataCache.get('config');
    if (cached) return cached;
    const rows = await SheetsAPI.readSheet(CONFIG.SHEETS.CONFIG);
    const config = { categorias: {}, cuentas: [], casas: [] };
    rows.slice(1).forEach(row => {
      if (row[0]) {
        if (!config.categorias[row[0]]) config.categorias[row[0]] = [];
        if (row[1]) config.categorias[row[0]].push(row[1]);
      }
      if (row[2] && !config.cuentas.includes(row[2])) config.cuentas.push(row[2]);
      if (row[3] && !config.casas.includes(row[3])) config.casas.push(row[3]);
    });
    DataCache.set('config', config);
    return config;
  },

  generateHash(date, amount, desc, account) {
    const clean = (desc || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const str = `${date}|${Math.abs(parseFloat(amount)).toFixed(2)}|${clean}|${account}`;
    let hash = 0;
    for (let i = 0; i < str.length; i++) { hash = ((hash << 5) - hash) + str.charCodeAt(i); hash |= 0; }
    return 'h' + Math.abs(hash);
  },

  async processImport(parsedRows, accountName, fileName) {
    const gastos = await SheetsAPI.readSheet(CONFIG.SHEETS.GASTOS);
    const ingresos = await SheetsAPI.readSheet(CONFIG.SHEETS.INGRESOS);
    const rules = await SheetsAPI.readSheet(CONFIG.SHEETS.RULES);
    const existingHashes = new Set([...gastos.map(r => r[GASTOS_COLS.HASH]), ...ingresos.map(r => r[INGRESOS_COLS.HASH])]);
    let stats = { importedGastos: 0, importedIngresos: 0, skipped: 0 };

    for (const row of parsedRows) {
      const amount = parseFloat(row.amount);
      const isIncome = amount > 0;
      const hash = this.generateHash(row.date, amount, row.desc, accountName);
      if (existingHashes.has(hash)) { stats.skipped++; continue; }

      let match = this.findRuleMatch(row.desc, rules);
      if (!match.category) match = this.findHistoricalMatch(row.desc, isIncome ? ingresos : gastos, isIncome);

      const d = new Date(row.date);
      const finalRow = [];
      finalRow[GASTOS_COLS.AÑO] = d.getFullYear();
      finalRow[GASTOS_COLS.MES] = d.getMonth() + 1;
      finalRow[GASTOS_COLS.FECHA] = row.date;
      finalRow[GASTOS_COLS.CONCEPTO] = row.desc;
      finalRow[GASTOS_COLS.IMPORTE] = Math.abs(amount);
      finalRow[GASTOS_COLS.CUENTA] = accountName;
      finalRow[GASTOS_COLS.CASA] = match.casa || '';
      finalRow[GASTOS_COLS.CATEGORIA] = match.category || '';
      finalRow[GASTOS_COLS.ORIGEN] = fileName;
      finalRow[GASTOS_COLS.HASH] = hash;

      if (isIncome) {
        finalRow[INGRESOS_COLS.CATEGORIA] = match.category || 'Otros Ingresos';
        await SheetsAPI.appendRow(CONFIG.SHEETS.INGRESOS, finalRow);
        stats.importedIngresos++;
      } else {
        finalRow[GASTOS_COLS.SUBCATEGORIA] = match.subcategory || '';
        finalRow[GASTOS_COLS.ESTADO] = match.category ? 'Auto' : 'Pendiente';
        await SheetsAPI.appendRow(CONFIG.SHEETS.GASTOS, finalRow);
        stats.importedGastos++;
      }
    }
    return stats;
  },

  findRuleMatch(desc, rules) {
    const d = (desc || '').toLowerCase();
    for (const r of rules.slice(1)) {
      if (r[2] && d.includes(r[2].toLowerCase())) return { category: r[3], subcategory: r[4], casa: r[5] };
    }
    return { category: null };
  },

  findHistoricalMatch(desc, history, isIncome) {
    const d = (desc || '').toLowerCase();
    for (const r of history.slice(-500)) {
      if (r[GASTOS_COLS.CONCEPTO]?.toLowerCase() === d) {
        return { 
          category: r[isIncome ? INGRESOS_COLS.CATEGORIA : GASTOS_COLS.CATEGORIA],
          subcategory: isIncome ? null : r[GASTOS_COLS.SUBCATEGORIA],
          casa: r[GASTOS_COLS.CASA]
        };
      }
    }
    return { category: null };
  },

  async getDashboardData(y, m) {
    const g = await SheetsAPI.readSheet(CONFIG.SHEETS.GASTOS);
    const i = await SheetsAPI.readSheet(CONFIG.SHEETS.INGRESOS);
    const b = await SheetsAPI.readSheet(CONFIG.SHEETS.BUDGET_PLAN);
    const filter = (arr, yr, mo) => arr.slice(1).filter(r => parseInt(r[1]) == yr && parseInt(r[2]) == mo);
    const actG = filter(g, y, m);
    const actI = filter(i, y, m);
    const planG = b.slice(1).filter(r => parseInt(r[0]) == y && parseInt(r[1]) == m);
    const sum = (arr, col) => arr.reduce((a, b) => a + (parseFloat(b[col]) || 0), 0);
    
    return { 
      totalGastos: sum(actG, 5), 
      totalIngresos: sum(actI, 5), 
      plannedGastos: sum(planG, 3),
      cashFlow: sum(actI, 5) - sum(actG, 5),
      fundingPlan: this.calculateFundingPlan(actG, actI, planG)
    };
  },

  calculateFundingPlan(actualGastos, actualIngresos, plannedGastos) {
    // Logic to determine inter-bank transfers
    // Group planned vs actual by Account to see which accounts need funding
    const funding = {};
    plannedGastos.forEach(p => {
      const acc = p[4] || 'Principal';
      funding[acc] = (funding[acc] || 0) + parseFloat(p[3]);
    });
    return funding;
  }
};
