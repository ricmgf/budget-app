:root {
    --bg-main: #f4f7f9;
    --accent: #2563eb;
    --accent-subtle: #eff6ff;
    --text-primary: #1e293b;
    --text-secondary: #64748b;
    --border-light: #f1f5f9;
    --sidebar-width: 200px;
    --sidebar-collapsed: 64px;
    --positive: #10b981;
    --negative: #ef4444;
}

body { font-family: 'Inter', sans-serif; margin: 0; background: var(--bg-main); overflow: hidden; }
.app-container { display: flex; height: 100vh; }

/* Sidebar */
.app-sidebar {
    width: var(--sidebar-width); background: #1e293b; color: white;
    display: flex; flex-direction: column; transition: width 0.3s ease; position: relative;
}
.app-sidebar.collapsed { width: var(--sidebar-collapsed); }
.sidebar-toggle {
    position: absolute; top: 18px; right: -12px; width: 24px; height: 24px;
    background: var(--accent); color: white; border: none; border-radius: 50%;
    cursor: pointer; display: flex; align-items: center; justify-content: center; z-index: 1000;
}
.app-sidebar.collapsed .nav-label, .app-sidebar.collapsed h1 { display: none; }
.nav-item { padding: 12px 24px; display: flex; align-items: center; gap: 12px; cursor: pointer; color: #94a3b8; }
.nav-item.active { background: rgba(255,255,255,0.05); color: white; }
.app-sidebar.collapsed .nav-item { justify-content: center; padding: 16px 0; }

/* Content */
.main-content { flex: 1; display: flex; flex-direction: column; overflow-y: auto; }
.main-header { padding: 16px 40px; background: white; border-bottom: 1px solid var(--border-light); display: flex; align-items: center; }
.header-left { display: flex; align-items: center; gap: 20px; }
.btn-icon { background: none; border: 1px solid var(--border-light); border-radius: 4px; padding: 4px 8px; cursor: pointer; }

.view-wrapper { 
    padding: 32px 32px 32px 40px; /* Pactado: Izq 40, Der 32 */
    max-width: 1600px; width: 100%; margin: 0 auto; box-sizing: border-box; 
}

.card { background: white; border-radius: 12px; padding: 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); margin-bottom: 24px; }
.metric-value { font-size: 28px; font-weight: 700; }
.page { display: none; }
.page.active { display: block; }
.btn-primary { background: var(--accent); color: white; border: none; padding: 10px 20px; border-radius: 8px; cursor: pointer; }
