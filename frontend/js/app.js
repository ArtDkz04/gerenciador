// frontend/js/app.js
import { API_BASE_URL, TOKEN_KEY, DEFAULT_AVATAR } from './config.js';
import { fetchAPI, fetchAPIFile, logout } from './api.js';
import { 
    formatCurrency, showToast, openModal, closeModal, 
    initDarkMode, toggleDarkMode 
} from './utils.js';
import { 
    renderInventory, renderSimpleResults, renderUsersTable, 
    renderMaintenanceHistory, renderPagination, createItemForm,
    renderAlterarResponsavelForm 
} from './components.js';
import { generateTermoPdf } from './pdf.js';

const app = {
    cache: { patrimonios: [], setores: [], users: [], maintenance: new Map() },
    state: { currentPage: 1, currentSearch: '', currentAdvancedSearch: {}, debounceTimer: null, selectedItems: [] },
    chartInstance: null,

    init() {
        initDarkMode();
        this.checkLoginState(); 
        this.setupEventListeners();
    },

    checkLoginState() {
        const token = sessionStorage.getItem(TOKEN_KEY);
        const role = sessionStorage.getItem('patrimonio-role');

        const authSection = document.getElementById('authSection');
        const appContent = document.getElementById('appContent');
        const userContent = document.getElementById('userContent');

        if (authSection) authSection.style.display = 'none';
        if (appContent) appContent.style.display = 'none';
        if (userContent) userContent.style.display = 'none';

        if (token && role) {
            if (role === 'admin') {
                if (appContent) appContent.style.display = 'block';
                document.getElementById('userNameDisplay').textContent = sessionStorage.getItem('patrimonio-user');
                
                const avatarUrl = sessionStorage.getItem('patrimonio-avatar');
                document.getElementById('userAvatarImg').src = (avatarUrl && avatarUrl !== 'null') ? avatarUrl : DEFAULT_AVATAR;

                if (!document.getElementById('view-dashboard').innerHTML) this.renderViews();
                this.mostrarView('dashboard');
            } else if (role === 'user') {
                if (userContent) userContent.style.display = 'block';
                this.initUserView();
            } else { 
                logout(); 
            }
        } else { 
            if (authSection) authSection.style.display = 'flex'; 
        }
    },
    
    initUserView() {
        initDarkMode(true);
        const select = document.getElementById('tipoPesquisaSimplificada');
        if (select) {
            select.innerHTML = `
                <option value="responsavel">Buscar por Responsável</option>
                <option value="item">Buscar por Nome do Item</option>
                <option value="patrimonio">Buscar por Nº Patrimônio</option>
            `;
        }
    },

    renderViews() {
        // --- DASHBOARD ---
        const dashboardView = document.getElementById('view-dashboard');
        dashboardView.innerHTML = `<div class="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-8"><div class="p-6 flex items-center card rounded-lg"><div class="p-3 rounded-full" style="background-color: color-mix(in srgb, var(--c-primary) 15%, transparent);"><svg class="icon icon-tabler icon-tabler-archive" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="var(--c-primary)" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M3 4m0 2a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v2a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2z" /><path d="M5 10v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-10" /><path d="M10 14h4" /></svg></div><div class="ml-4"><p class="text-sm font-medium" style="color: var(--c-text-secondary);">Total de Ativos</p><p id="totalItems" class="text-2xl font-bold">0</p></div></div><div class="p-6 flex items-center card rounded-lg"><div class="p-3 rounded-full" style="background-color: color-mix(in srgb, var(--c-success) 15%, transparent);"><svg class="icon icon-tabler icon-tabler-receipt-2" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="var(--c-success)" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M5 21v-16a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v16l-3 -2l-2 2l-2 -2l-2 2l-3 2" /><path d="M14 8h-2.5a1.5 1.5 0 0 0 0 3h1.5a1.5 1.5 0 0 1 0 3h-2.5" /><path d="M12 14v1" /></svg></div><div class="ml-4"><p class="text-sm font-medium" style="color: var(--c-text-secondary);">Valor do Inventário</p><p id="totalValor" class="text-2xl font-bold">R$ 0,00</p></div></div></div><div class="p-6 card rounded-lg"><div class="flex justify-between items-center mb-4"><h3 class="text-xl font-semibold">Distribuição de Ativos</h3><select id="chartGroupBySelect" class="p-2"></select></div><div class="h-80 w-full flex items-center justify-center"><canvas id="pieChartCanvas"></canvas></div></div>`;
        
        const chartSelect = document.getElementById('chartGroupBySelect');
        if (chartSelect) {
            chartSelect.innerHTML = `
                <option value="setor">Agrupar por Setor</option>
                <option value="nome">Agrupar por Tipo de Item</option>
                <option value="valor_por_nome">Agrupar por Valor (por Tipo)</option>
            `;
        }

        // --- PATRIMÔNIOS ---
        const bulkActionsHtml = `
            <div id="bulkActionsContainer" class="hidden flex items-center gap-x-2">
                <div class="dropdown">
                    <button class="btn btn-secondary">
                        <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-tabler icon-tabler-dots" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M5 12m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" /><path d="M12 12m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" /><path d="M19 12m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" /></svg>
                        Ações em Lote
                    </button>
                    <div class="dropdown-content">
                        <button id="btnBulkChangeSector"><svg xmlns="http://www.w3.org/2000/svg" class="icon icon-tabler icon-tabler-folder-move" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M12 19h-7a2 2 0 0 1 -2 -2v-11a2 2 0 0 1 2 -2h4l3 3h7a2 2 0 0 1 2 2v3.5" /><path d="M17 18h6" /><path d="M20 15l3 3l-3 3" /></svg>Mover para Setor...</button>
                        <button id="btnBulkChangeStatus"><svg xmlns="http://www.w3.org/2000/svg" class="icon icon-tabler icon-tabler-tag" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M7.5 7.5m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" /><path d="M3 6v5.172a2 2 0 0 0 .586 1.414l7.71 7.71a2.41 2.41 0 0 0 3.408 0l5.592 -5.592a2.41 2.41 0 0 0 0 -3.408l-7.71 -7.71a2 2 0 0 0 -1.414 -.586h-5.172a3 3 0 0 0 -3 3z" /></svg>Alterar Status...</button>
                        <button id="btnBulkAssignResponsible"><svg xmlns="http://www.w3.org/2000/svg" class="icon icon-tabler icon-tabler-user-edit" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M8 7a4 4 0 1 0 8 0a4 4 0 0 0 -8 0" /><path d="M6 21v-2a4 4 0 0 1 4 -4h3.5" /><path d="M18.42 15.61a2.1 2.1 0 0 1 2.97 2.97l-3.39 3.42h-3v-3l3.42 -3.39z" /></svg>Atribuir Responsável...</button>
                    </div>
                </div>
                <button id="btnExcluirSelecionados" class="btn btn-danger btn-disabled" disabled><svg xmlns="http://www.w3.org/2000/svg" class="icon icon-tabler icon-tabler-trash" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M4 7l16 0" /><path d="M10 11l0 6" /><path d="M14 11l0 6" /><path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12" /><path d="M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3" /></svg>Excluir</button>
            </div>
        `;

        document.getElementById('view-patrimonios').innerHTML = `<div class="space-y-6"><section class="p-6 card rounded-lg"><h2 class="text-xl font-semibold mb-4">Pesquisa Avançada</h2><form id="formPesquisaAvancada" class="flex flex-col sm:flex-row gap-4"><select id="tipoPesquisa" class="p-3"></select><input type="text" id="termoPesquisa" placeholder="Digite o termo para a busca" class="flex-grow p-3"><button type="submit" class="btn btn-primary"><svg xmlns="http://www.w3.org/2000/svg" class="icon icon-tabler icon-tabler-search" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M10 10m-7 0a7 7 0 1 0 14 0a7 7 0 1 0 -14 0" /><path d="M21 21l-6 -6" /></svg>Pesquisar</button><button type="reset" class="btn btn-secondary"><svg xmlns="http://www.w3.org/2000/svg" class="icon icon-tabler icon-tabler-eraser" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M19 20h-10.5l-4.21 -4.3a1 1 0 0 1 0 -1.41l10 -10a1 1 0 0 1 1.41 0l5 5a1 1 0 0 1 0 1.41l-9.2 9.3" /><path d="M18 13.3l-6.3 -6.3" /></svg>Limpar</button></form></section><section class="p-6 card rounded-lg"><div class="flex justify-between items-center mb-4"><h2 class="text-xl font-semibold">Todos os Itens</h2><div class="w-1/3"><input type="text" id="liveSearchInput" placeholder="Filtrar na lista..." class="w-full p-2"></div></div><div class="flex justify-between items-center mb-6"><div><button id="btnExportarCSV" class="btn btn-secondary"><svg xmlns="http://www.w3.org/2000/svg" class="icon icon-tabler icon-tabler-download" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-2" /><path d="M7 11l5 5l5 -5" /><path d="M12 4l0 12" /></svg>Exportar</button><button id="btnImportar" class="btn btn-secondary ml-2"><svg xmlns="http://www.w3.org/2000/svg" class="icon icon-tabler icon-tabler-upload" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-2" /><path d="M7 9l5 -5l5 5" /><path d="M12 4l0 12" /></svg>Importar</button>${bulkActionsHtml}</div><div id="pagination-info" class="text-sm"></div></div><div id="loadingIndicator" class="hidden w-5 h-5 border-2 rounded-full animate-spin mx-auto my-4" style="border-color: var(--c-border); border-top-color: var(--c-primary);"></div><div class="overflow-x-auto"><table class="min-w-full divide-y"><thead><tr><th class="p-3 w-10"><input type="checkbox" id="selectAllCheckbox" class="rounded"></th><th class="p-3 text-left text-xs font-medium uppercase tracking-wider">Item</th><th class="p-3 text-left text-xs font-medium uppercase tracking-wider">Patrimônio</th><th class="p-3 text-left text-xs font-medium uppercase tracking-wider">Setor</th><th class="p-3 text-left text-xs font-medium uppercase tracking-wider">Responsável</th><th class="p-3 text-left text-xs font-medium uppercase tracking-wider">Status</th><th class="p-3 text-left text-xs font-medium uppercase tracking-wider">Valor</th><th class="p-3 text-left text-xs font-medium uppercase tracking-wider w-48">Ações</th></tr></thead><tbody id="tabelaItensCorpo" class="divide-y"></tbody></table></div><div id="pagination-controls" class="flex justify-center items-center mt-4 space-x-2"></div></section></div>`;
        document.getElementById('view-termos').innerHTML = `<section class="p-6 card rounded-lg"><h2 class="text-xl font-semibold mb-4">Gerar Termo de Responsabilidade</h2><div class="flex flex-col sm:flex-row gap-4"><input type="text" id="termoResponsavelInput" placeholder="Digite o nome ou e-mail do responsável" class="flex-grow p-3"><button id="btnGerarTermo" class="btn btn-primary"><svg xmlns="http://www.w3.org/2000/svg" class="icon icon-tabler icon-tabler-printer" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M17 17h2a2 2 0 0 0 2 -2v-4a2 2 0 0 0 -2 -2h-14a2 2 0 0 0 -2 2v4a2 2 0 0 0 2 2h2" /><path d="M17 9v-4a2 2 0 0 0 -2 -2h-6a2 2 0 0 0 -2 2v4" /><path d="M7 13m0 2a2 2 0 0 1 2 -2h6a2 2 0 0 1 2 2v4a2 2 0 0 1 -2 2h-6a2 2 0 0 1 -2 -2z" /></svg>Gerar Termo</button></div></section>`;
        document.getElementById('view-users').innerHTML = `<section class="p-6 card rounded-lg"><div class="flex justify-between items-center mb-4"><h2 class="text-xl font-semibold">Gerenciamento de Usuários</h2><button id="btnNovoUsuario" class="btn btn-primary"><svg xmlns="http://www.w3.org/2000/svg" class="icon icon-tabler icon-tabler-user-plus" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M8 7a4 4 0 1 0 8 0a4 4 0 0 0 -8 0" /><path d="M16 19h6" /><path d="M19 16v6" /><path d="M6 21v-2a4 4 0 0 1 4 -4h4" /></svg>Adicionar Usuário</button></div><div class="overflow-x-auto"><table class="min-w-full divide-y"><thead><tr><th class="p-3 text-left text-xs font-medium uppercase tracking-wider">Usuário</th><th class="p-3 text-left text-xs font-medium uppercase tracking-wider">Permissão</th><th class="p-3 text-left text-xs font-medium uppercase tracking-wider">Ações</th></tr></thead><tbody id="tabelaUsuariosCorpo" class="divide-y"></tbody></table></div></section>`;
        
        // --- BACKUPS ---
        const backupsView = document.getElementById('view-backups');
        if (backupsView) {
            backupsView.innerHTML = `
                <section class="p-6 card rounded-lg">
                    <div class="flex justify-between items-center mb-6">
                        <div>
                            <h2 class="text-xl font-semibold">Backups e Restauração</h2>
                            <p class="text-sm" style="color: var(--c-text-secondary);">Gerencie ou restaure cópias de segurança do sistema.</p>
                        </div>
                        <div class="flex gap-2">
                            <button id="btnImportarBackup" class="btn btn-secondary">
                                <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-tabler icon-tabler-upload" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-2" /><path d="M7 9l5 -5l5 5" /><path d="M12 4l0 12" /></svg>
                                Importar
                            </button>
                            <button id="btnGerarBackup" class="btn btn-primary">
                                <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-tabler icon-tabler-database-export" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M4 6c0 1.657 3.582 3 8 3s8 -1.343 8 -3s-3.582 -3 -8 -3s-8 1.343 -8 3" /><path d="M4 6v6c0 1.657 3.582 3 8 3c.85 0 1.68 -.05 2.476 -.145" /><path d="M20 12v-6" /><path d="M4 12v6c0 1.657 3.582 3 8 3c.176 0 .35 -.003 .521 -.008" /><path d="M16 19h6" /><path d="M19 16l3 3l-3 3" /></svg>
                                Gerar Novo
                            </button>
                        </div>
                    </div>
                    <div class="overflow-x-auto">
                        <table class="min-w-full divide-y">
                            <thead>
                                <tr>
                                    <th class="p-3 text-left text-xs font-medium uppercase tracking-wider">Arquivo</th>
                                    <th class="p-3 text-left text-xs font-medium uppercase tracking-wider">Data de Criação</th>
                                    <th class="p-3 text-left text-xs font-medium uppercase tracking-wider">Tamanho</th>
                                    <th class="p-3 text-left text-xs font-medium uppercase tracking-wider">Ações</th>
                                </tr>
                            </thead>
                            <tbody id="tabelaBackupsCorpo" class="divide-y">
                                <tr><td colspan="4" class="p-4 text-center">Carregando...</td></tr>
                            </tbody>
                        </table>
                    </div>
                    <input type="file" id="inputImportarBackup" class="hidden" accept=".bz2,.sql">
                </section>
            `;
        }
    },

    mostrarView(viewName) {
        document.querySelectorAll('.view-container').forEach(v => v.classList.remove('active'));
        const view = document.getElementById(`view-${viewName}`);
        if (view) view.classList.add('active');
        
        document.querySelectorAll('#main-nav a').forEach(nav => { 
            nav.classList.toggle('active-nav-link', nav.dataset.view === viewName);
        });

        const titles = { 
            dashboard: 'Dashboard', 
            patrimonios: 'Patrimônios', 
            termos: 'Termo de Responsabilidade', 
            users: 'Gerenciamento de Usuários',
            backups: 'Backups'
        };
        document.getElementById('pageTitle').textContent = titles[viewName] || '';
        
        document.getElementById('header-buttons').style.display = (viewName === 'patrimonios' && sessionStorage.getItem('patrimonio-role') === 'admin') ? 'flex' : 'none';

        if (viewName === 'dashboard') this.fetchDashboardData().then(() => this.fetchChartData());
        if (viewName === 'patrimonios') this.carregarSetores().then(() => this.carregarDadosIniciais());
        if (viewName === 'users') this.loadUsers();
        if (viewName === 'backups') this.loadBackups();
    },

    setupEventListeners() {
        // Forms estáticos
        document.getElementById('formLogin')?.addEventListener('submit', (e) => { e.preventDefault(); this.handleLogin(); });
        document.getElementById('formPesquisaAvancada')?.addEventListener('submit', (e) => {
            e.preventDefault();
            const form = e.target;
            this.carregarDadosIniciais(1, '', { tipo: form.tipoPesquisa.value, termo: form.termoPesquisa.value });
        });
        document.getElementById('formPesquisaSimplificada')?.addEventListener('submit', (e) => { e.preventDefault(); this.handleSimpleSearch(); });
        document.getElementById('formAdicionarUser')?.addEventListener('submit', (e) => { e.preventDefault(); this.handleUserFormSubmit(); });
        document.getElementById('formEditarUser')?.addEventListener('submit', (e) => { e.preventDefault(); this.handleUserEditFormSubmit(); });
        document.getElementById('formImportar')?.addEventListener('submit', (e) => { e.preventDefault(); this.handleImport(); });
        document.getElementById('avatarUploadInput')?.addEventListener('change', (e) => this.handleAvatarUpload(e));

        document.getElementById('formBulkChangeSector').onsubmit = (e) => {
            e.preventDefault();
            const newValue = e.target.sector.value;
            if(newValue) this.handleBulkUpdate('change_sector', newValue, 'bulkChangeSectorModal');
        };
        document.getElementById('formBulkChangeStatus').onsubmit = (e) => {
            e.preventDefault();
            const newValue = e.target.status.value;
            if(newValue) this.handleBulkUpdate('change_status', newValue, 'bulkChangeStatusModal');
        };
            document.getElementById('formBulkAssignResponsible').onsubmit = (e) => {
            e.preventDefault();
            const newValue = { name: e.target.name.value, email: e.target.email.value };
            this.handleBulkUpdate('assign_responsible', newValue, 'bulkAssignResponsibleModal');
        };

        // Delegated Listeners (clicks globais)
        document.body.addEventListener('click', (e) => {
            const target = e.target;
            const button = target.closest('button');
            const link = target.closest('a');

            if (link && link.matches('#main-nav a[data-view]')) { e.preventDefault(); this.mostrarView(link.dataset.view); return; }
            if (link && (link.id === 'btnLogout' || link.id === 'btnLogoutUser')) { e.preventDefault(); logout(); return; }

            if (button) {
                // Ação de Gerar Backup
                if (button.id === 'btnGerarBackup' || button.closest('#btnGerarBackup')) {
                    this.generateBackup();
                    return;
                }
                
                // Ação de Importar Backup
                if (button.id === 'btnImportarBackup' || button.closest('#btnImportarBackup')) {
                    document.getElementById('inputImportarBackup').click();
                    return;
                }

                if(button.id === 'btnRemoverAnexo') {
                    const form = button.closest('form');
                    if (form) {
                        const display = form.querySelector('#notaFiscalUpload-display');
                        const fileInput = form.querySelector('#notaFiscalUpload');
                        const removeInput = form.querySelector('#remover_nota_fiscal');
                        const container = form.querySelector('#nota-fiscal-container');
                        const icon = container.querySelector('svg');
                        
                        if(display) display.textContent = 'Anexar Nota Fiscal (PDF)';
                        if(fileInput) fileInput.value = '';
                        if(removeInput) removeInput.value = 'true';

                        button.classList.add('hidden');
                        container.classList.remove('has-file');
                        if (icon) {
                            icon.outerHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="icon icon-tabler icon-tabler-paperclip" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M15 7l-6.5 6.5a1.5 1.5 0 0 0 3 3l6.5 -6.5a3 3 0 0 0 -6 -6l-6.5 6.5a4.5 4.5 0 0 0 9 9l6.5 -6.5" /></svg>`;
                        }
                    }
                    return;
                }

                if (button.id === 'btnVerHistorico') {
                    this.showHistoryModal(button.dataset.id);
                    return;
                }

                const actionMap = {
                    'userAvatarBtn': () => document.getElementById('avatarUploadInput').click(),
                    'darkModeToggle': () => toggleDarkMode(),
                    'darkModeToggleUser': () => toggleDarkMode(true),
                    'btnNovoItem': () => this.openAddItemModal(),
                    'btnNovoUsuario': () => this.openAddUserModal(),
                    'btnAlterarResponsavel': () => this.openAlterarResponsavelModal(),
                    'btnExportarCSV': () => this.handleExportCSV(),
                    'btnImportar': () => openModal('importModal'),
                    'btnExcluirSelecionados': () => this.handleDeleteSelected(),
                    'btnGerarTermo': () => this.handleGerarTermo(),
                    'btnBulkChangeSector': () => this.openBulkChangeSectorModal(),
                    'btnBulkChangeStatus': () => this.openBulkChangeStatusModal(),
                    'btnBulkAssignResponsible': () => this.openBulkAssignResponsibleModal(),
                };

                if (actionMap[button.id]) { actionMap[button.id](); return; }
                
                const action = button.dataset.action;
                if (action) {
                    const id = button.dataset.id || button.closest('tr')?.dataset.id;
                    switch (action) {
                        case 'edit': this.openEditItemModal(parseInt(id, 10)); break;
                        case 'edit-user': this.openEditUserModal(id); break;
                        case 'delete-user': this.handleDeleteUser(id, button.dataset.username); break;
                        case 'add-maintenance': this.openAddMaintenanceModal(id); break;
                        case 'edit-maintenance': 
                            const record = this.cache.maintenance.get(parseInt(id, 10));
                            if(record) this.openEditMaintenanceModal(record);
                            break;
                        case 'view-maintenance':
                            const recordToView = this.cache.maintenance.get(parseInt(id, 10));
                            if(recordToView) this.openViewMaintenanceModal(recordToView);
                            break;
                    }
                    return;
                }
                
                if (button.dataset.page) { this.carregarDadosIniciais(parseInt(button.dataset.page, 10), this.state.currentSearch, this.state.currentAdvancedSearch); return; }
                
                if (button.closest('form')?.id === 'formPesquisaAvancada' && button.type === 'reset') { e.preventDefault(); button.closest('form').reset(); this.carregarDadosIniciais(1); }
            }
            
            if (target.classList.contains('modal') || target.classList.contains('close-modal')) { closeModal(target.closest('.modal')?.id); }
        });

        // Listeners do App Content
        const appContent = document.getElementById('appContent');
        if (appContent) {
            appContent.addEventListener('input', (e) => {
                if (e.target.id === 'liveSearchInput') {
                    clearTimeout(this.state.debounceTimer);
                    this.state.debounceTimer = setTimeout(() => {
                        document.getElementById('formPesquisaAvancada')?.reset();
                        this.carregarDadosIniciais(1, e.target.value);
                    }, 300);
                } else if (e.target.matches('.item-checkbox, #selectAllCheckbox')) {
                    this.handleCheckboxChange(e.target);
                }
            });
            
            appContent.addEventListener('change', (e) => {
                if (e.target.id === 'chartGroupBySelect') this.fetchChartData(e.target.value);

                // Listener para o input de backup
                if (e.target.id === 'inputImportarBackup') {
                    this.handleBackupImport(e);
                }

                if (e.target.id === 'notaFiscalUpload') {
                    const form = e.target.closest('form');
                    if (form) {
                        const display = form.querySelector('#notaFiscalUpload-display');
                        const removeBtn = form.querySelector('#btnRemoverAnexo');
                        const container = form.querySelector('#nota-fiscal-container');
                        const icon = container.querySelector('svg');
                        
                        if (e.target.files.length > 0) {
                            if(display) display.textContent = e.target.files[0].name;
                            if(removeBtn) removeBtn.classList.remove('hidden');
                            if(container) container.classList.add('has-file');
                            form.querySelector('#remover_nota_fiscal').value = 'false';
                            if (icon) {
                                icon.outerHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="icon icon-tabler icon-tabler-file-text" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M14 3v4a1 1 0 0 0 1 1h4" /><path d="M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2z" /><path d="M9 9h1" /><path d="M9 13h6" /><path d="M9 17h6" /></svg>`;
                            }
                        }
                    }
                }
            });
        }

        // Listener para mudança de tema
        window.addEventListener('theme-changed', () => {
             if (this.chartInstance && document.getElementById('view-dashboard').classList.contains('active')) {
                this.fetchChartData(document.getElementById('chartGroupBySelect').value);
            }
        });
    },

    // --- FUNÇÕES DE BACKUP ---
    async loadBackups() {
        const tbody = document.getElementById('tabelaBackupsCorpo');
        if (!tbody) return;
        
        try {
            const { files } = await fetchAPI('/backups');
            if (!files || files.length === 0) {
                tbody.innerHTML = `<tr><td colspan="4" class="p-4 text-center text-sm" style="color: var(--c-text-secondary);">Nenhum backup encontrado.</td></tr>`;
                return;
            }
            tbody.innerHTML = files.map(file => `
                <tr>
                    <td class="p-3 text-sm font-medium">${file.name}</td>
                    <td class="p-3 text-sm" style="color: var(--c-text-secondary);">${new Date(file.created_at).toLocaleString('pt-BR')}</td>
                    <td class="p-3 text-sm" style="color: var(--c-text-secondary);">${(file.size / 1024 / 1024).toFixed(2)} MB</td>
                    <td class="p-3 text-sm space-x-2">
                        <button class="btn btn-primary text-xs py-1" onclick="app.restoreBackup('${file.name}')" title="Restaurar este backup">Restaurar</button>
                        <button class="btn btn-success text-xs py-1" onclick="app.downloadBackup('${file.name}')">Baixar</button>
                        <button class="btn btn-danger text-xs py-1" onclick="app.deleteBackup('${file.name}')">Excluir</button>
                    </td>
                </tr>
            `).join('');
        } catch (error) {
            tbody.innerHTML = `<tr><td colspan="4" class="p-4 text-center text-red-500">Erro ao carregar backups.</td></tr>`;
        }
    },

    async generateBackup() {
        const btn = document.getElementById('btnGerarBackup');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = `<svg class="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Gerando...`;
        }

        try {
            await fetchAPI('/backups', { method: 'POST' });
            showToast('Backup gerado com sucesso!', 'success');
            this.loadBackups();
        } catch (e) {
            showToast('Erro ao gerar backup.', 'error');
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="icon icon-tabler icon-tabler-database-export" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M4 6c0 1.657 3.582 3 8 3s8 -1.343 8 -3s-3.582 -3 -8 -3s-8 1.343 -8 3" /><path d="M4 6v6c0 1.657 3.582 3 8 3c.85 0 1.68 -.05 2.476 -.145" /><path d="M20 12v-6" /><path d="M4 12v6c0 1.657 3.582 3 8 3c.176 0 .35 -.003 .521 -.008" /><path d="M16 19h6" /><path d="M19 16l3 3l-3 3" /></svg> Gerar Novo`;
            }
        }
    },

    async handleBackupImport(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        const formData = new FormData();
        formData.append('backup', file);
        
        try {
            showToast('Importando backup...', 'info'); 
            await fetchAPIFile('/backups/import', { method: 'POST', body: formData });
            showToast('Backup importado com sucesso!', 'success');
            this.loadBackups();
        } catch (error) {
            showToast(error.message || 'Erro ao importar backup.', 'error');
        } finally {
            event.target.value = ''; // Reseta o input para permitir selecionar o mesmo arquivo novamente se falhar
        }
    },

    async restoreBackup(filename) {
        if (!confirm(`ATENÇÃO CRÍTICA:\n\nVocê está prestes a restaurar o backup "${filename}".\n\nISSO APAGARÁ TODOS OS DADOS ATUAIS do sistema e os substituirá pelos dados deste backup.\n\nTem certeza absoluta que deseja continuar?`)) return;
        
        // Segunda confirmação para evitar acidentes
        const check = prompt(`Para confirmar, digite "RESTAURAR" na caixa abaixo:`);
        if (check !== 'RESTAURAR') { return showToast('Restauração cancelada.', 'info'); }

        try {
            showToast('Restaurando sistema... Isso pode levar alguns segundos.', 'info');
            const res = await fetchAPI(`/backups/${filename}/restore`, { method: 'POST' });
            alert(res.message);
            logout(); // Desloga para evitar inconsistências de cache e forçar login
        } catch (error) {
            showToast(error.message || 'Falha crítica na restauração.', 'error');
        }
    },

    async downloadBackup(filename) {
        // Precisamos baixar como Blob para passar o header de Autenticação
        try {
            const token = sessionStorage.getItem(TOKEN_KEY);
            const response = await fetch(`${window.location.origin}${API_BASE_URL}/backups/${filename}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) throw new Error('Erro no download');
            
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        } catch (error) {
            showToast('Não foi possível baixar o arquivo.', 'error');
        }
    },

    async deleteBackup(filename) {
        if(!confirm(`Tem certeza que deseja excluir o backup ${filename}?`)) return;
        try {
            await fetchAPI(`/backups/${filename}`, { method: 'DELETE' });
            showToast('Backup excluído.', 'success');
            this.loadBackups();
        } catch (e) {
            showToast('Erro ao excluir backup.', 'error');
        }
    },
    // ----------------------------

    async handleSimpleSearch() {
        const tipo = document.getElementById('tipoPesquisaSimplificada').value;
        const termo = document.getElementById('termoPesquisaSimplificada').value;
        const resultsDiv = document.getElementById('resultadosPesquisaSimplificada');
        
        if (!termo) { showToast('Por favor, digite um termo para pesquisar.', 'error'); return; }
        
        resultsDiv.innerHTML = '';
        try {
            const data = await fetchAPI(`/simple-search?tipo=${tipo}&termo=${termo}`);
            renderSimpleResults(data.items);
        } catch (error) { resultsDiv.innerHTML = `<p style="color: var(--c-danger)">Falha ao realizar a busca.</p>`; }
    },

    handleLogin() {
        const user = document.getElementById('loginUser').value;
        const password = document.getElementById('loginSenha').value;
        fetchAPI('/login', { method: 'POST', body: { user, password } }).then(result => {
            if (result.token) {
                sessionStorage.setItem(TOKEN_KEY, result.token);
                sessionStorage.setItem('patrimonio-user', result.user);
                sessionStorage.setItem('patrimonio-role', result.role);
                sessionStorage.setItem('patrimonio-avatar', result.avatar || '');
                this.checkLoginState();
            }
        }).catch(() => {});
    },

    async handleAvatarUpload(event) {
        const file = event.target.files[0];
        if (!file) return;
        const formData = new FormData();
        formData.append('avatar', file);
        try {
            const result = await fetchAPIFile('/user/avatar', { method: 'POST', body: formData });
            showToast(result.message, 'success');
            document.getElementById('userAvatarImg').src = result.avatarUrl;
            sessionStorage.setItem('patrimonio-avatar', result.avatarUrl);
        } catch (error) { showToast(error.message, 'error'); } 
        finally { event.target.value = ''; }
    },

    handleCheckboxChange(checkbox) {
        if (checkbox.id === 'selectAllCheckbox') {
            const isChecked = checkbox.checked;
            document.querySelectorAll('.item-checkbox').forEach(cb => { cb.checked = isChecked; });
            this.state.selectedItems = isChecked ? this.cache.patrimonios.map(p => p.id) : [];
        } else {
            const id = parseInt(checkbox.dataset.id, 10);
            if (checkbox.checked) {
                this.state.selectedItems.push(id);
            } else {
                this.state.selectedItems = this.state.selectedItems.filter(itemId => itemId !== id);
            }
            const allCheckboxes = document.querySelectorAll('.item-checkbox');
            document.getElementById('selectAllCheckbox').checked = allCheckboxes.length > 0 && allCheckboxes.length === this.state.selectedItems.length;
        }
        this.updateActionButtonsState();
    },

    updateActionButtonsState() {
        const count = this.state.selectedItems.length;
        const hasSelection = count > 0;
        
        const btnExcluir = document.getElementById('btnExcluirSelecionados');
        const bulkActions = document.getElementById('bulkActionsContainer');
        
        if (btnExcluir) {
            btnExcluir.disabled = !hasSelection;
            btnExcluir.classList.toggle('btn-disabled', !hasSelection);
        }
        if (bulkActions) {
            bulkActions.classList.toggle('hidden', !hasSelection);
            bulkActions.classList.toggle('flex', hasSelection);
        }
    },

    async fetchChartData(groupBy = 'setor') {
        try {
            const { data } = await fetchAPI(`/dashboard/group-by?field=${groupBy}`);
            this.renderPieChart(data, groupBy);
        } catch (error) { console.error('Erro ao buscar dados para o gráfico:', error); }
    },

    renderPieChart(data, groupBy) {
        const canvas = document.getElementById('pieChartCanvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (this.chartInstance) this.chartInstance.destroy();
        const legendLabels = { 'setor': 'Por Setor', 'nome': 'Por Tipo', 'valor_por_nome': 'Valor por Tipo' };
        
        const textColor = getComputedStyle(document.documentElement).getPropertyValue('--c-text-secondary').trim();
        const primaryColor = getComputedStyle(document.documentElement).getPropertyValue('--c-primary').trim();
        const colors = [primaryColor, '#34d399', '#facc15', '#fb923c', '#a78bfa', '#22d3ee'];
        
        // Assume que Chart.js está carregado globalmente
        if (window.Chart) {
             window.Chart.defaults.color = textColor;
             this.chartInstance = new window.Chart(ctx, { type: 'pie', data: { labels: data.map(item => item.label), datasets: [{ label: legendLabels[groupBy] || 'Distribuição', data: data.map(item => item.value), backgroundColor: colors, hoverOffset: 4, borderWidth: 0 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'top', labels: { color: textColor } }, tooltip: { callbacks: { label: context => `${context.label || ''}: ${groupBy === 'valor_por_nome' ? formatCurrency(context.parsed) : context.parsed}` } } } } });
        }
    },

    async carregarDadosIniciais(page = 1, search = '', advancedSearch = {}) {
        this.state.currentPage = page;
        this.state.currentSearch = search;
        this.state.currentAdvancedSearch = advancedSearch;
        this.state.selectedItems = [];
        const selectAll = document.getElementById('selectAllCheckbox');
        if(selectAll) selectAll.checked = false;

        const params = new URLSearchParams({ page, search, ...advancedSearch });
        try {
            const data = await fetchAPI(`/patrimonios?${params.toString()}`);
            this.cache.patrimonios = data.items;
            document.querySelector('#tabelaItensCorpo').innerHTML = renderInventory(data.items);
            document.querySelector('#pagination-controls').innerHTML = renderPagination(data.pagination);
            document.querySelector('#pagination-info').textContent = `Página ${data.pagination.currentPage} de ${data.pagination.totalPages} (${data.pagination.totalItems} itens)`;
            this.updateActionButtonsState();
        } catch (e) { document.querySelector('#tabelaItensCorpo').innerHTML = `<tr><td colspan="8" class="p-4 text-center" style="color: var(--c-danger)">Falha ao carregar dados.</td></tr>`; }
    },

    async carregarSetores() {
        try {
            const { setores } = await fetchAPI('/setores');
            this.cache.setores = setores;
            const tipoPesquisa = document.getElementById('tipoPesquisa');
            if (tipoPesquisa) tipoPesquisa.innerHTML = `<option value="">Buscar por...</option><option value="patrimonio">Nº Patrimônio</option><option value="tipo_item">Nome do Item</option><option value="responsavel">Responsável</option><option value="setor">Setor</option>`;
        } catch(e) {}
    },

    async fetchDashboardData() {
        try {
            const { totalItems, totalValor } = await fetchAPI('/dashboard');
            document.getElementById('totalItems').textContent = totalItems;
            document.getElementById('totalValor').textContent = formatCurrency(totalValor);
        } catch(e) {}
    },

    handleExportCSV() {
        const items = this.cache.patrimonios;
        if (items.length === 0) { showToast('Não há itens para exportar na visualização atual.', 'error'); return; }
        const headers = ['ID', 'Item', 'Patrimônio', 'Setor', 'Responsável', 'Email do Responsável', 'Valor Unitário', 'Nota Fiscal', 'Data de Cadastro', 'Marca', 'Modelo', 'Nº de Série', 'Data de Aquisição', 'Fornecedor', 'Garantia', 'Status', 'Observação'];
        const rows = items.map(item => [item.id, item.nome, item.patrimonio, item.setor, item.responsavel_nome, item.responsavel_email, item.valor_unitario, item.nota_fiscal, item.cadastrado_em ? new Date(item.cadastrado_em).toLocaleString('pt-BR') : '', item.marca, item.modelo, item.numero_serie, item.data_aquisicao, item.fornecedor, item.garantia, item.status, item.observacao].map(field => `"${String(field === null || field === undefined ? '' : field).replace(/"/g, '""')}"`).join(','));
        let csvContent = "data:text/csv;charset=utf-8,\uFEFF";
        csvContent += [headers.join(','), ...rows].join('\n');
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `patrimonios_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        showToast('Exportação para CSV iniciada.', 'success');
    },

    async handleImport() {
        const formElement = document.getElementById('formImportar');
        const formData = new FormData(formElement);
        if (!formElement.querySelector('#csvFileInput').files[0]) {
            showToast('Por favor, selecione um arquivo CSV.', 'error');
            return;
        }
        try {
            const result = await fetchAPIFile('/patrimonios/import', { method: 'POST', body: formData });
            showToast(result.message, 'success');
            closeModal('importModal');
            await this.carregarDadosIniciais(1);
            await this.fetchDashboardData();
        } catch (error) {
            const errorDiv = document.getElementById('importErrors');
            if (errorDiv) {
                errorDiv.innerHTML = `<strong>Falha na importação:</strong><br>${error.message.replace(/\n/g, '<br>')}`;
                errorDiv.classList.remove('hidden');
            }
            showToast('A importação falhou. Verifique os erros.', 'error');
        }
    },

    openAlterarResponsavelModal() {
        const contentDiv = document.getElementById('alterarResponsavelContent');
        contentDiv.innerHTML = `<form id="formBuscaPatrimonio"><label for="buscaPatrimonioInput" class="block mb-2">Digite o Nº do Patrimônio:</label><input type="text" id="buscaPatrimonioInput" required class="w-full"><div class="flex justify-end gap-4 mt-6"><button type="submit" class="btn btn-primary">Buscar</button></div></form>`;
        document.getElementById('formBuscaPatrimonio').onsubmit = (e) => { 
            e.preventDefault(); 
            const tag = document.getElementById('buscaPatrimonioInput').value; 
            if (tag) fetchAPI(`/patrimonio/tag/${encodeURIComponent(tag)}`).then(data => {
                 const html = renderAlterarResponsavelForm(data.item, this.cache.setores);
                 document.getElementById('alterarResponsavelContent').innerHTML = html;
                 this.setupAlterarResponsavelSubmit(data.item);
            }).catch(err => {}); 
        };
        openModal('alterarResponsavelModal');
    },

    setupAlterarResponsavelSubmit(item) {
        document.getElementById('formConfirmaAlteracao').onsubmit = async (e) => { 
            e.preventDefault(); 
            const payload = { 
                responsavel_nome: document.getElementById('novoResponsavelNome').value, 
                responsavel_email: document.getElementById('novoResponsavelEmail').value, 
                setor_id: parseInt(document.getElementById('novoSetor').value, 10) 
            }; 
            try { 
                await fetchAPI(`/patrimonios/${item.id}`, { method: 'PATCH', body: payload }); 
                closeModal('alterarResponsavelModal'); 
                showToast('Detalhes alterados com sucesso!', 'success'); 
                this.carregarDadosIniciais(this.state.currentPage, this.state.currentSearch, this.state.currentAdvancedSearch); 
            } catch(err) { console.error("Falha ao alterar detalhes:", err); } 
        };
    },

    handleDeleteSelected(ids = this.state.selectedItems) {
        if (ids.length === 0) return;
        const modal = document.getElementById('messageModal');
        modal.innerHTML = `<div class="modal-content"><h2 class="text-xl font-semibold mb-4">Confirmar Exclusão</h2><p>Tem certeza que deseja excluir <strong>${ids.length}</strong> item(ns)?</p><div class="flex justify-end gap-4 mt-6"><button type="button" class="btn btn-secondary close-modal">Cancelar</button><button id="confirmDelete" class="btn btn-danger">Excluir</button></div></div>`;
        openModal('messageModal');
        document.getElementById('confirmDelete').onclick = async () => { try { await fetchAPI('/patrimonios/delete-lote', { method: 'POST', body: { ids } }); closeModal('messageModal'); showToast(`${ids.length} item(ns) excluído(s)!`, 'success'); this.carregarDadosIniciais(1, ''); this.fetchDashboardData(); } catch(err) { console.error("Falha ao excluir itens:", err); } };
    },
    
    async handleGerarTermo() {
        const nomeOuEmail = document.getElementById('termoResponsavelInput').value.trim();
        if (!nomeOuEmail) {
            return showToast('Por favor, digite o nome ou e-mail do responsável.', 'error');
        }
        
        try {
            const data = await fetchAPI(`/termo/responsavel/${encodeURIComponent(nomeOuEmail)}`);
            this.openTermoDataModal(data.equipamentos, data.responsavel);
        } catch (error) {
            showToast(error.message || 'Erro ao buscar equipamentos do responsável.', 'error');
        }
    },

    openTermoDataModal(equipamentos, responsavel) {
        const formContainer = document.getElementById('formTermoData');
        if (!formContainer) return;

        let formHtml = '';
        equipamentos.forEach((item) => {
            formHtml += `
                <fieldset class="border-0 border-t pt-4 mt-4 first:mt-0 first:pt-0 first:border-0" style="border-color: var(--c-border);">
                    <legend class="text-base font-semibold px-2 -ml-2 mb-4" style="color: var(--c-primary);">${item.nome} (Patrimônio: ${item.patrimonio})</legend>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                        <div><label class="block text-sm font-medium mb-1">Processador:</label><input type="text" name="processador_${item.id}" class="w-full" placeholder="Ex: Core i5 8th Gen"></div>
                        <div><label class="block text-sm font-medium mb-1">Memória RAM:</label><input type="text" name="memoria_${item.id}" class="w-full" placeholder="Ex: 8GB DDR4"></div>
                        <div><label class="block text-sm font-medium mb-1">Disco (Tamanho/Tipo):</label><input type="text" name="disco_${item.id}" class="w-full" placeholder="Ex: 256GB SSD"></div>
                        <div><label class="block text-sm font-medium mb-1">Sistema Operacional:</label><input type="text" name="so_${item.id}" class="w-full" placeholder="Ex: Windows 11 Pro"></div>
                        <div class="md:col-span-2">
                            <label class="block text-sm font-medium mb-2">Estado do Equipamento:</label>
                            <div class="flex items-center gap-x-6">
                                <label class="flex items-center gap-2"><input type="radio" name="estado_${item.id}" value="Novo" checked> Novo</label>
                                <label class="flex items-center gap-2"><input type="radio" name="estado_${item.id}" value="Usado"> Usado</label>
                            </div>
                        </div>
                        <div class="md:col-span-2">
                            <label class="block text-sm font-medium mb-2">Acessórios Inclusos:</label>
                            <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                <label class="flex items-center gap-2 text-sm"><input type="checkbox" name="acessorios_${item.id}" value="Fonte de alimentação"> Fonte</label>
                                <label class="flex items-center gap-2 text-sm"><input type="checkbox" name="acessorios_${item.id}" value="Headset"> Headset</label>
                                <label class="flex items-center gap-2 text-sm"><input type="checkbox" name="acessorios_${item.id}" value="Mouse"> Mouse</label>
                                <label class="flex items-center gap-2 text-sm"><input type="checkbox" name="acessorios_${item.id}" value="Teclado"> Teclado</label>
                                <label class="flex items-center gap-2 text-sm"><input type="checkbox" name="acessorios_${item.id}" value="Monitor"> Monitor</label>
                                <label class="flex items-center gap-2 text-sm"><input type="checkbox" name="acessorios_${item.id}" value="Cabo HDMI/VGA"> Cabo Vídeo</label>
                                <label class="flex items-center gap-2 text-sm"><input type="checkbox" name="acessorios_${item.id}" value="Webcam"> Webcam</label>
                            </div>
                        </div>
                    </div>
                </fieldset>
            `;
        });

        formHtml += `<div class="flex justify-end gap-4 mt-8"><button type="button" class="btn btn-secondary close-modal">Cancelar</button><button type="submit" class="btn btn-primary">Gerar PDF do Termo</button></div>`;
        formContainer.innerHTML = formHtml;
        
        formContainer.onsubmit = (e) => {
            e.preventDefault();
            generateTermoPdf(e.target, equipamentos, responsavel);
        };

        openModal('termoDataModal');
    },
    
    async handleItemFormSubmit(form, modalId) {
        const formData = new FormData(form);
        const id = formData.get('id');
        const endpoint = id ? `/patrimonios/${id}` : '/patrimonios';
        
        try {
            await fetchAPIFile(endpoint, { method: 'POST', body: formData });
            showToast(`Item ${id ? 'atualizado' : 'adicionado'} com sucesso!`, 'success');
            closeModal(modalId);
            
            if(id) {
                 await this.carregarDadosIniciais(this.state.currentPage, this.state.currentSearch, this.state.currentAdvancedSearch);
            } else {
                 document.getElementById('liveSearchInput').value = '';
                const advancedSearchForm = document.getElementById('formPesquisaAvancada');
                if (advancedSearchForm) advancedSearchForm.reset();
                await this.carregarDadosIniciais(1, '', {});
            }
            await this.fetchDashboardData();

        } catch (error) { console.error(`Falha ao ${id ? 'editar' : 'adicionar'} item:`, error); }
    },
    
    async openAddItemModal() {
        const formContainer = document.getElementById('formAdicionarItem');
        formContainer.innerHTML = createItemForm({}, this.cache.setores) + `<div class="flex justify-end gap-4 mt-6"><button type="button" class="btn btn-secondary close-modal">Cancelar</button><button type="submit" class="btn btn-success">Adicionar</button></div>`;
        
        formContainer.onsubmit = (e) => {
            e.preventDefault();
            this.handleItemFormSubmit(formContainer, 'addItemModal');
        };

        openModal('addItemModal');
        
        const valorInput = document.querySelector('#addItemModal #itemValor');
        // Assume IMask carregado globalmente
        if (valorInput && window.IMask) { window.IMask(valorInput, { mask: 'R$ num', blocks: { num: { mask: Number, scale: 2, thousandsSeparator: '.', padFractionalZeros: true, normalizeZeros: true, radix: ',' } } }); }
        
        try {
            const data = await fetchAPI('/patrimonios/next-tag');
            const patrimonioInput = formContainer.querySelector('input[name="patrimonio"]');
            if (patrimonioInput && data.nextTag) {
                patrimonioInput.value = data.nextTag;
            }
        } catch (error) {
            console.error('Falha ao buscar o próximo patrimônio:', error);
            showToast('Não foi possível sugerir o próximo patrimônio.', 'error');
        }
    },

    async openEditItemModal(itemId) {
        const item = this.cache.patrimonios.find(p => p.id === itemId);
        if (!item) return showToast('Item não encontrado.', 'error');
        
        const formContainer = document.getElementById('formEditarItem');
        
        formContainer.innerHTML = createItemForm(item, this.cache.setores) + `
            <div class="flex justify-between items-center gap-4 mt-6">
                <button type="button" id="btnVerHistorico" data-id="${item.id}" class="btn btn-secondary">
                    <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-tabler icon-tabler-history" width="20" height="20" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M12 8l0 4l2 2" /><path d="M3.05 11a9 9 0 1 1 .5 4m- .5 5v-5h5" /></svg>
                    Ver Histórico
                </button>
                <div>
                    <button type="button" class="btn btn-secondary close-modal">Cancelar</button>
                    <button type="submit" class="btn btn-success ml-2">Salvar Alterações</button>
                </div>
            </div>`;
        
        formContainer.onsubmit = (e) => {
            e.preventDefault();
            this.handleItemFormSubmit(formContainer, 'editItemModal');
        };

        const valorInput = formContainer.querySelector('#itemValor');
        if(valorInput && window.IMask) {
            const valorMask = window.IMask(valorInput, { mask: 'R$ num', blocks: { num: { mask: Number, scale: 2, thousandsSeparator: '.', padFractionalZeros: true, normalizeZeros: true, radix: ',' } } });
            valorMask.value = (item.valor_unitario || '0').toString().replace('.',',');
        }
        openModal('editItemModal');

        this.loadMaintenanceHistory(itemId);
    },

    async showHistoryModal(itemId) {
        const contentDiv = document.getElementById('viewHistoryContent');
        contentDiv.innerHTML = '<p class="text-center">Carregando histórico...</p>';
        openModal('viewHistoryModal');

        try {
            const history = await fetchAPI(`/patrimonios/${itemId}/historico`);
            if (!history || history.length === 0) {
                contentDiv.innerHTML = '<p class="text-center text-sm" style="color: var(--c-text-secondary);">Nenhum registro de histórico encontrado para este item.</p>';
                return;
            }

            let historyHtml = `<div class="divide-y" style="border-color: var(--c-border);">`;
            history.forEach(record => {
                const date = new Date(record.timestamp).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
                const details = record.detalhes.split('; ').map(d => `- ${d}`).join('<br>');

                historyHtml += `
                    <div class="py-3">
                        <div class="flex justify-between items-center mb-1">
                            <p class="font-semibold">${record.acao}</p>
                            <p class="text-xs" style="color: var(--c-text-secondary);">${date}</p>
                        </div>
                        <p class="text-sm" style="color: var(--c-text-secondary);"><strong>Usuário:</strong> ${record.utilizador}</p>
                        <div class="text-sm mt-2 p-2 rounded-md" style="background-color: var(--c-bg-page); color: var(--c-text-secondary); white-space: pre-wrap; word-break: break-word;">${details}</div>
                    </div>
                `;
            });
            historyHtml += '</div>';
            contentDiv.innerHTML = historyHtml;

        } catch (error) {
            contentDiv.innerHTML = `<p class="text-center" style="color: var(--c-danger);">Falha ao carregar o histórico.</p>`;
        }
    },

    async loadMaintenanceHistory(patrimonioId) {
        const container = document.getElementById('maintenance-history-list');
        if (!container) return;
        container.innerHTML = `<p class="text-center p-4">Carregando histórico...</p>`;
        try {
            const records = await fetchAPI(`/patrimonios/${patrimonioId}/manutencoes`);
            this.cache.maintenance.clear();
            records.forEach(r => this.cache.maintenance.set(r.id, r));
            renderMaintenanceHistory(records, patrimonioId);
        } catch (error) {
            container.innerHTML = `<p class="text-center p-4" style="color: var(--c-danger)">Falha ao carregar histórico.</p>`;
        }
    },

    openAddMaintenanceModal(patrimonioId) {
        const form = document.getElementById('formAddMaintenance');
        form.innerHTML = `
            <input type="hidden" name="patrimonio_id" value="${patrimonioId}">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label for="data_envio" class="block mb-1 required-label">Data de Envio:</label>
                    <input type="date" id="data_envio" name="data_envio" required class="w-full">
                </div>
                <div>
                    <label for="fornecedor_servico" class="block mb-1">Fornecedor:</label>
                    <input type="text" id="fornecedor_servico" name="fornecedor_servico" class="w-full">
                </div>
            </div>
            <div class="mt-4">
                <label for="status_manutencao" class="block mb-1 required-label">Status:</label>
                <select id="status_manutencao" name="status_manutencao" required class="w-full">
                    <option value="Enviado">Enviado para Reparo</option>
                    <option value="Em Reparo">Em Reparo</option>
                </select>
            </div>
            <div class="mt-4">
                <label for="problema_relatado" class="block mb-1 required-label">Problema Relatado:</label>
                <textarea id="problema_relatado" name="problema_relatado" required rows="3" class="w-full"></textarea>
            </div>
                <div class="mt-4">
                <label for="observacoes" class="block mb-1">Observações Adicionais:</label>
                <textarea id="observacoes" name="observacoes" rows="3" class="w-full"></textarea>
            </div>
            <div class="flex justify-end gap-4 mt-6">
                <button type="button" class="btn btn-secondary close-modal">Cancelar</button>
                <button type="submit" class="btn btn-success">Registrar</button>
            </div>
        `;
        form.onsubmit = (e) => {
            e.preventDefault();
            this.handleMaintenanceFormSubmit(form, 'addMaintenanceModal');
        }
        openModal('addMaintenanceModal');
        form.querySelector('#data_envio').valueAsDate = new Date();
    },

    openEditMaintenanceModal(record) {
        const form = document.getElementById('formEditMaintenance');
        form.innerHTML = `
            <input type="hidden" name="manutencao_id" value="${record.id}">
            <input type="hidden" name="patrimonio_id" value="${record.patrimonio_id}">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                    <label class="block mb-1">Data de Envio:</label>
                    <input type="date" value="${record.data_envio ? new Date(record.data_envio).toISOString().split('T')[0] : ''}" class="w-full" disabled>
                </div>
                <div>
                    <label for="edit_data_retorno" class="block mb-1">Data de Retorno:</label>
                    <input type="date" id="edit_data_retorno" name="data_retorno" value="${record.data_retorno ? new Date(record.data_retorno).toISOString().split('T')[0] : ''}" class="w-full">
                </div>
                    <div>
                    <label for="edit_fornecedor_servico" class="block mb-1">Fornecedor:</label>
                    <input type="text" id="edit_fornecedor_servico" name="fornecedor_servico" value="${record.fornecedor_servico || ''}" class="w-full">
                </div>
                <div>
                    <label for="edit_custo" class="block mb-1">Custo:</label>
                    <input type="text" id="edit_custo" name="custo" value="${record.custo || ''}" class="w-full">
                </div>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                <div>
                    <label for="edit_status_manutencao" class="block mb-1 required-label">Status da Manutenção:</label>
                    <select id="edit_status_manutencao" name="status_manutencao" required class="w-full">
                        <option value="Enviado" ${record.status_manutencao === 'Enviado' ? 'selected' : ''}>Enviado</option>
                        <option value="Em Reparo" ${record.status_manutencao === 'Em Reparo' ? 'selected' : ''}>Em Reparo</option>
                        <option value="Concluído" ${record.status_manutencao === 'Concluído' ? 'selected' : ''}>Concluído</option>
                        <option value="Não Reparado" ${record.status_manutencao === 'Não Reparado' ? 'selected' : ''}>Não Reparado</option>
                    </select>
                </div>
                <div>
                    <label for="novo_status_patrimonio" class="block mb-1 required-label">Novo Status do Item:</label>
                    <select id="novo_status_patrimonio" name="novo_status_patrimonio" required class="w-full">
                        <option value="Em Manutenção">Manter 'Em Manutenção'</option>
                        <option value="Em Estoque">Devolver para 'Em Estoque'</option>
                        <option value="Em Uso">Devolver para 'Em Uso'</option>
                        <option value="Danificado">Marcar como 'Danificado'</option>
                    </select>
                </div>
            </div>
                <div class="mt-4">
                <label for="edit_observacoes" class="block mb-1">Observações da Conclusão:</label>
                <textarea id="edit_observacoes" name="observacoes" rows="3" class="w-full">${record.observacoes || ''}</textarea>
            </div>
            <div class="flex justify-end gap-4 mt-6">
                <button type="button" class="btn btn-secondary close-modal">Cancelar</button>
                <button type="submit" class="btn btn-success">Salvar Alterações</button>
            </div>
        `;
        form.onsubmit = (e) => {
            e.preventDefault();
            this.handleMaintenanceFormSubmit(form, 'editMaintenanceModal');
        }
        if (document.querySelector('#edit_custo') && window.IMask) { 
            const mask = window.IMask(document.querySelector('#edit_custo'), { mask: 'R$ num', blocks: { num: { mask: Number, scale: 2, thousandsSeparator: '.', padFractionalZeros: true, normalizeZeros: true, radix: ',' } } });
            if(record.custo) mask.value = record.custo.toString().replace('.',',');
        }
        openModal('editMaintenanceModal');
    },

    openViewMaintenanceModal(record) {
        const contentDiv = document.getElementById('viewMaintenanceContent');
        if (!contentDiv) return;

        const renderField = (label, value) => `
            <div class="grid grid-cols-1 md:grid-cols-3 gap-x-4 border-b pb-2" style="border-color: var(--c-border);">
                <strong class="md:col-span-1">${label}:</strong>
                <p class="md:col-span-2 break-words" style="color: var(--c-text-secondary);">${value || 'Não informado'}</p>
            </div>
        `;
        
        contentDiv.innerHTML = `
            ${renderField('Data de Envio', new Date(record.data_envio).toLocaleDateString('pt-BR'))}
            ${renderField('Data de Retorno', record.data_retorno ? new Date(record.data_retorno).toLocaleDateString('pt-BR') : 'Pendente')}
            ${renderField('Status da Manutenção', record.status_manutencao)}
            ${renderField('Fornecedor do Serviço', record.fornecedor_servico)}
            ${renderField('Custo', formatCurrency(record.custo))}
            ${renderField('Problema Relatado', record.problema_relatado)}
            ${renderField('Observações da Conclusão', record.observacoes)}
        `;

        openModal('viewMaintenanceModal');
    },

    async handleMaintenanceFormSubmit(form, modalId) {
        const isEdit = modalId === 'editMaintenanceModal';
        const id = isEdit ? form.manutencao_id.value : form.patrimonio_id.value;
        const endpoint = isEdit ? `/manutencoes/${id}` : `/patrimonios/${id}/manutencoes`;
        const method = isEdit ? 'PUT' : 'POST';

        const body = Object.fromEntries(new FormData(form).entries());
        
        try {
            const result = await fetchAPI(endpoint, { method, body });
            showToast(result.message, 'success');
            closeModal(modalId);
            
            await this.loadMaintenanceHistory(body.patrimonio_id);
            await this.carregarDadosIniciais(this.state.currentPage, this.state.currentSearch, this.state.currentAdvancedSearch);
            
            const editItemForm = document.getElementById('formEditarItem');
            if (editItemForm && editItemForm.id.value == body.patrimonio_id) {
                    editItemForm.querySelector('select[name="status"]').value = body.novo_status_patrimonio || 'Em Manutenção';
            }

        } catch (error) {
            console.error('Falha ao submeter formulário de manutenção:', error);
        }
    },

    // Ações em Lote
    openBulkChangeSectorModal() {
        const count = this.state.selectedItems.length;
        document.getElementById('bulkSectorCount').textContent = count;
        const select = document.querySelector('#formBulkChangeSector select');
        select.innerHTML = '<option value="">Selecione um setor...</option>' + this.cache.setores.map(s => `<option value="${s.id}">${s.nome}</option>`).join('');
        openModal('bulkChangeSectorModal');
    },
    
    openBulkChangeStatusModal() {
        const count = this.state.selectedItems.length;
        document.getElementById('bulkStatusCount').textContent = count;
        const select = document.querySelector('#formBulkChangeStatus select');
        const statusOptions = ['Em Uso', 'Em Estoque', 'Danificado', 'Descartado', 'Em Manutenção'];
        select.innerHTML = '<option value="">Selecione um status...</option>' + statusOptions.map(s => `<option value="${s}">${s}</option>`).join('');
        openModal('bulkChangeStatusModal');
    },

    openBulkAssignResponsibleModal() {
            const count = this.state.selectedItems.length;
        document.getElementById('bulkResponsibleCount').textContent = count;
        openModal('bulkAssignResponsibleModal');
    },

    async handleBulkUpdate(action, value, modalId) {
        if(this.state.selectedItems.length === 0) return showToast('Nenhum item selecionado.', 'error');
        
        const payload = {
            ids: this.state.selectedItems,
            action: action,
            value: value
        };
        
        try {
            const result = await fetchAPI('/patrimonios/bulk-update', { method: 'POST', body: payload });
            showToast(result.message, 'success');
            closeModal(modalId);
            await this.carregarDadosIniciais(1);
        } catch(e) {}
    },

    // Usuários
    async loadUsers() {
        try {
            this.cache.users = await fetchAPI('/users');
            renderUsersTable(this.cache.users);
        } catch (error) { document.getElementById('tabelaUsuariosCorpo').innerHTML = `<tr><td colspan="3" class="p-4 text-center" style="color: var(--c-danger)">Falha ao carregar usuários.</td></tr>`; }
    },
    openAddUserModal() { openModal('addUserModal'); },
    async handleUserFormSubmit() {
        const form = document.getElementById('formAdicionarUser');
        try {
            await fetchAPI('/users', { method: 'POST', body: { username: form.username.value, password: form.password.value, role: form.role.value } });
            showToast('Usuário criado com sucesso!', 'success');
            closeModal('addUserModal'); this.loadUsers();
        } catch (error) {}
    },
    openEditUserModal(userId) {
        const user = this.cache.users.find(u => u.id == userId);
        if (!user) { showToast('Usuário não encontrado.', 'error'); return; }
        const form = document.getElementById('formEditarUser');
        form.id.value = user.id;
        document.getElementById('editingUsername').textContent = user.username;
        form.role.value = user.role; form.password.value = '';
        openModal('editUserModal');
    },
    async handleUserEditFormSubmit() {
        const form = document.getElementById('formEditarUser');
        const body = { role: form.role.value };
        if (form.password.value) { body.password = form.password.value; }
        try {
            await fetchAPI(`/users/${form.id.value}`, { method: 'PUT', body });
            showToast('Usuário atualizado com sucesso!', 'success');
            closeModal('editUserModal'); this.loadUsers();
        } catch (error) {}
    },
    handleDeleteUser(userId, username) {
        const modal = document.getElementById('messageModal');
        modal.innerHTML = `<div class="modal-content"><h2 class="text-xl font-semibold mb-4">Confirmar Exclusão</h2><p>Tem certeza que deseja excluir o usuário <strong>${username}</strong>?</p><div class="flex justify-end gap-4 mt-6"><button type="button" class="btn btn-secondary close-modal">Cancelar</button><button id="confirmUserDelete" class="btn btn-danger">Excluir</button></div></div>`;
        openModal('messageModal');
        document.getElementById('confirmUserDelete').onclick = () => {
            fetchAPI(`/users/${userId}`, { method: 'DELETE' })
            .then(() => { showToast('Usuário excluído!', 'success'); this.loadUsers(); closeModal('messageModal'); })
            .catch(error => {});
        };
    }
};

// Expor app para o escopo global (para suportar onlicks legados ou debug)
window.app = app;

document.addEventListener('DOMContentLoaded', () => app.init());