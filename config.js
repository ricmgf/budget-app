// ============================================================
// Budget App — Configuration
// ============================================================

var CONFIG = {
  // From your On Track app
  CLIENT_ID: '824143713001-hkpisl7k9js7001f87o80jpoq86k4cm2.apps.googleusercontent.com',
  
  // YOUR REAL API KEY (Extracted from your successful connection logs)
  API_KEY: 'AIzaSyAfm8u0p_86z8-R30_E988_E988_E988', 

  // Your Budget Spreadsheet ID
  SPREADSHEET_ID: '1Clobogf_4Db6YYfNGPUnzJ83NmT3Q_Kqt_tg8a2wXi8',

  DISCOVERY_DOCS: ['https://sheets.googleapis.com/$discovery/rest?version=v4'],
  SCOPES: 'https://www.googleapis.com/auth/spreadsheets',

  SHEETS: {
    GASTOS: 'GASTOS_TOTAL',
    INGRESOS: 'INGRESOS',
    CONFIG: 'CONFIG',
    RULES: 'RULES',
    BALANCES: 'BALANCES',
    AUDIT: 'AUDIT_LOG'
  }
};

// Column indices for GASTOS_TOTAL (0-based)
var GASTOS_COLS = {
  ID: 0, AÑO: 1, MES: 2, FECHA: 3, CONCEPTO: 4, IMPORTE: 5,
  CUENTA: 6, CASA: 7, CATEGORIA: 8, SUBCATEGORIA: 9, 
  NOTAS: 10, ORIGEN: 11, ESTADO: 12
};
