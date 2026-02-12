// ============================================================
// Budget App — Master Configuration (Phase 1-4 Complete)
// ============================================================

var CONFIG = {
  CLIENT_ID: '824143713001-hkpisl7k9js7001f87o80jpoq86k4cm2.apps.googleusercontent.com',
  API_KEY: 'AIzaSyCwrt8rREK0fWIFwGpbsft6Ad8FatQY4Ec',
  SPREADSHEET_ID: '1Clobogf_4Db6YYfNGPUnzJ83NmT3Q_Kqt_tg8a2wXi8',
  DISCOVERY_DOCS: ['https://sheets.googleapis.com/$discovery/rest?version=v4'],
  SCOPES: 'https://www.googleapis.com/auth/spreadsheets',

  SHEETS: {
    GASTOS: 'GASTOS_TOTAL',
    INGRESOS: 'INGRESOS',
    CONFIG: 'CONFIG',
    RULES: 'RULES',
    BALANCES: 'BALANCES',
    BUDGET_PLAN: 'BUDGET_PLAN',
    INCOME_PLAN: 'INCOME_PLAN',
    ACCOUNTS: 'ACCOUNTS', // Nueva para el Sniffer
    AUDIT: 'AUDIT_LOG'
  }
};

// GASTOS_TOTAL indices (N=13) - RESPETADO AL 100%
var GASTOS_COLS = {
  ID: 0, AÑO: 1, MES: 2, FECHA: 3, CONCEPTO: 4, IMPORTE: 5,
  CUENTA: 6, CASA: 7, CATEGORIA: 8, SUBCATEGORIA: 9, 
  NOTAS: 10, ORIGEN: 11, ESTADO: 12, HASH: 13 
};

// INGRESOS indices (K=10) - RESPETADO AL 100%
var INGRESOS_COLS = {
  ID: 0, AÑO: 1, MES: 2, FECHA: 3, CONCEPTO: 4, IMPORTE: 5,
  CUENTA: 6, CASA: 7, CATEGORIA: 8, ORIGEN: 9, HASH: 10
};

// BUDGET_PLAN indices (TIPO=8) - RESPETADO AL 100%
var BUDGET_COLS = {
  AÑO: 0, MES: 1, CONCEPTO: 2, IMPORTE: 3, CUENTA: 4, 
  CASA: 5, CATEGORIA: 6, SUBCATEGORIA: 7, TIPO: 8, NOTAS: 9
};

var ACCOUNT_COLS = {
  ALIAS: 0, IDENTIFIER: 1, CASA: 2, TIPO: 3
};
