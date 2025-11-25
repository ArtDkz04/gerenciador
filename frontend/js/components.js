// frontend/js/components.js
import { formatCurrency } from './utils.js';
import { HEADER_MAP } from './config.js';

// --- Tabelas e Listas ---

export function renderInventory(items) {
    const isAdmin = sessionStorage.getItem('patrimonio-role') === 'admin';
    
    if (!items || items.length === 0) {
        return `<tr><td colspan="8" class="p-4 text-center" style="color: var(--c-text-secondary)">Nenhum item encontrado.</td></tr>`;
    }

    return items.map(item => `
        <tr data-id="${item.id}">
            <td class="p-3 text-center">
                <input type="checkbox" class="item-checkbox rounded" data-id="${item.id}">
            </td>
            <td class="p-3 text-sm font-medium">${item.nome || ''}</td>
            <td class="p-3 text-sm" style="color: var(--c-text-secondary)">${item.patrimonio || ''}</td>
            <td class="p-3 text-sm" style="color: var(--c-text-secondary)">${item.setor || ''}</td>
            <td class="p-3 text-sm" style="color: var(--c-text-secondary)">${item.responsavel_nome || 'Sem responsável'}</td>
            <td class="p-3 text-sm" style="color: var(--c-text-secondary)">${item.status || ''}</td>
            <td class="p-3 text-sm" style="color: var(--c-text-secondary)">${formatCurrency(item.valor_unitario)}</td>
            <td class="p-3 text-sm font-medium space-x-4">
                ${isAdmin ? `<button data-action="edit" data-id="${item.id}" class="font-semibold">Detalhes</button>` : 'Sem permissão'}
            </td>
        </tr>
    `).join('');
}

export function renderSimpleResults(items) {
    const resultsDiv = document.getElementById('resultadosPesquisaSimplificada');
    
    if (!items || items.length === 0) {
        resultsDiv.innerHTML = '<p style="color: var(--c-text-secondary)">Nenhum resultado encontrado.</p>';
        return;
    }
    
    resultsDiv.innerHTML = `
        <div class="overflow-x-auto mt-4">
            <table class="min-w-full divide-y">
                <thead>
                    <tr>
                        <th class="p-3 text-left text-xs font-medium uppercase tracking-wider">Item</th>
                        <th class="p-3 text-left text-xs font-medium uppercase tracking-wider">Responsável</th>
                        <th class="p-3 text-left text-xs font-medium uppercase tracking-wider">Setor</th>
                    </tr>
                </thead>
                <tbody class="divide-y">
                    ${items.map(item => `
                        <tr>
                            <td class="p-3 text-sm font-medium">${item.item || ''}</td>
                            <td class="p-3 text-sm" style="color: var(--c-text-secondary)">${item.responsavel || 'N/A'}</td>
                            <td class="p-3 text-sm" style="color: var(--c-text-secondary)">${item.setor || 'N/A'}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
}

export function renderUsersTable(users) {
    const tbody = document.getElementById('tabelaUsuariosCorpo');
    if (!tbody) return;
    
    tbody.innerHTML = users.map(user => `
        <tr>
            <td class="p-3 text-sm font-medium">${user.username}</td>
            <td class="p-3 text-sm" style="color: var(--c-text-secondary)">${user.role}</td>
            <td class="p-3 text-sm font-medium space-x-4">
                <button data-action="edit-user" data-id="${user.id}" class="font-semibold">Editar</button>
                <button data-action="delete-user" data-id="${user.id}" data-username="${user.username}" class="font-semibold" style="color: var(--c-danger)">Excluir</button>
            </td>
        </tr>
    `).join('');
}

export function renderMaintenanceHistory(records) {
    const container = document.getElementById('maintenance-history-list');
    
    if (!records || records.length === 0) {
        container.innerHTML = `<p class="text-center text-sm p-4" style="color: var(--c-text-secondary)">Nenhum registro de manutenção encontrado.</p>`;
        return;
    }
    
    container.innerHTML = `
        <table class="min-w-full divide-y">
            <thead>
                <tr>
                    <th class="p-2 text-left text-xs font-medium uppercase tracking-wider">Data Envio</th>
                    <th class="p-2 text-left text-xs font-medium uppercase tracking-wider">Data Retorno</th>
                    <th class="p-2 text-left text-xs font-medium uppercase tracking-wider">Status</th>
                    <th class="p-2 text-left text-xs font-medium uppercase tracking-wider">Custo</th>
                    <th class="p-2 text-left text-xs font-medium uppercase tracking-wider">Ações</th>
                </tr>
            </thead>
            <tbody class="divide-y">
                ${records.map(r => `
                    <tr data-id="${r.id}">
                        <td class="p-2 text-sm">${new Date(r.data_envio).toLocaleDateString('pt-BR')}</td>
                        <td class="p-2 text-sm">${r.data_retorno ? new Date(r.data_retorno).toLocaleDateString('pt-BR') : 'Pendente'}</td>
                        <td class="p-2 text-sm">${r.status_manutencao}</td>
                        <td class="p-2 text-sm">${formatCurrency(r.custo)}</td>
                        <td class="p-2 text-sm">
                            <button data-action="view-maintenance" data-id="${r.id}" class="font-semibold">Detalhes</button>
                            <button data-action="edit-maintenance" data-id="${r.id}" class="font-semibold ml-4">Atualizar</button>
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

export function renderPagination({ currentPage, totalPages }) {
    if (totalPages <= 1) return '';
    
    let html = '';
    const createButton = (text, page, disabled, isCurrent = false) => 
        `<button data-page="${page}" class="px-3 py-1 border rounded-md ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${isCurrent ? 'btn-primary' : 'btn-secondary'}" ${disabled ? 'disabled' : ''}>${text}</button>`;
    
    html += createButton('Anterior', currentPage - 1, currentPage === 1);
    
    for (let i = 1; i <= totalPages; i++) { 
        if (i === currentPage || i === 1 || i === totalPages || (i >= currentPage - 1 && i <= currentPage + 1)) { 
            html += createButton(i, i, false, i === currentPage); 
        } else if (i === currentPage - 2 || i === currentPage + 2) { 
            html += `<span class="px-2 py-1">...</span>`; 
        } 
    }
    
    html += createButton('Próxima', currentPage + 1, currentPage === totalPages);
    return html;
}

// --- Formulários ---

export function createItemForm(item = {}, setores = []) {
    const setorOptions = setores.map(s => 
        `<option value="${s.id}" ${s.id == item.setor_id ? 'selected' : ''}>${s.nome || ''}</option>`
    ).join('');
    
    const statusOptions = ['Em Uso', 'Em Estoque', 'Danificado', 'Descartado', 'Em Manutenção'].map(opt => 
        `<option value="${opt}" ${opt === item.status ? 'selected' : ''}>${opt}</option>`
    ).join('');

    const hasFile = !!item.nota_fiscal_url;
    const fileName = hasFile ? item.nota_fiscal_url.split('/').pop().substring(0, 30) + '...' : 'Anexar Nota Fiscal (PDF)';
    
    const fileIcon = hasFile 
        ? `<svg xmlns="http://www.w3.org/2000/svg" class="icon icon-tabler icon-tabler-file-text" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M14 3v4a1 1 0 0 0 1 1h4" /><path d="M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2z" /><path d="M9 9h1" /><path d="M9 13h6" /><path d="M9 17h6" /></svg>`
        : `<svg xmlns="http://www.w3.org/2000/svg" class="icon icon-tabler icon-tabler-paperclip" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M15 7l-6.5 6.5a1.5 1.5 0 0 0 3 3l6.5 -6.5a3 3 0 0 0 -6 -6l-6.5 6.5a4.5 4.5 0 0 0 9 9l6.5 -6.5" /></svg>`;

    const anexoHtml = `
        <div class="flex items-center gap-2">
            ${hasFile ? `<a href="${item.nota_fiscal_url}" target="_blank" class="btn btn-secondary">Ver Nota Fiscal</a>` : ''}
            <div id="nota-fiscal-container" class="flex items-center gap-2 flex-grow ${hasFile ? 'has-file' : ''}">
                <label for="notaFiscalUpload" class="btn btn-secondary flex-grow justify-start truncate cursor-pointer">
                    ${fileIcon}
                    <span id="notaFiscalUpload-display" class="truncate">${fileName}</span>
                </label>
                <input type="file" id="notaFiscalUpload" name="nota_fiscal_pdf" class="hidden" accept=".pdf">
                <input type="hidden" id="remover_nota_fiscal" name="remover_nota_fiscal" value="false">
                <button type="button" id="btnRemoverAnexo" class="btn btn-danger !p-2 ${hasFile ? '' : 'hidden'}" title="Remover Anexo">
                    <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-tabler icon-tabler-trash" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M4 7l16 0" /><path d="M10 11l0 6" /><path d="M14 11l0 6" /><path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12" /><path d="M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3" /></svg>
                </button>
            </div>
        </div>
    `;
    
    const maintenanceSection = item.id ? `
        <fieldset class="border-0 border-t pt-4 mt-4" style="border-color: var(--c-border);">
            <legend class="text-base font-semibold px-2 -ml-2 mb-2" style="color: var(--c-primary);">Histórico de Manutenção</legend>
            <div class="flex justify-end mb-4">
                <button type="button" data-action="add-maintenance" data-id="${item.id}" class="btn btn-secondary">
                    <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-tabler icon-tabler-tool" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M7 10h3v-3l-3.5 -3.5a6 6 0 0 1 8 8l-3.5 -3.5v-3h-3" /></svg>
                    Registrar Manutenção
                </button>
            </div>
            <div id="maintenance-history-list" class="overflow-x-auto"></div>
        </fieldset>
    ` : '';

    const formStructure = [
        { legend: 'Informações Principais', grid: 'md:grid-cols-2', fields: [
            { name: 'nome', label: 'Item', required: true, span: 'md:col-span-2' }, 
            { name: 'patrimonio', label: 'Patrimônio', required: true }, 
            { name: 'setor_id', label: 'Setor', type: 'select', options: setorOptions, required: true }, 
            { name: 'marca' }, { name: 'modelo' }, { name: 'numero_serie', label: 'N° de Série' }
        ]},
        { legend: 'Informações de Compra', grid: 'md:grid-cols-2', fields: [
            { name: 'valor_unitario', label: 'Valor' }, 
            { name: 'fornecedor' },
            { name: 'data_aquisicao', label: 'Data de Aquisição' }, 
            { name: 'garantia' },
            { name: 'nota_fiscal_pdf', label: 'Anexo da Nota Fiscal', type: 'component', html: anexoHtml, span: 'md:col-span-2' }
        ]},
        { legend: 'Outras Informações', grid: 'md:grid-cols-2', fields: [
            { name: 'status', type: 'select', options: statusOptions }, 
            { name: 'responsavel_nome', label: 'Responsável' }, 
            { name: 'responsavel_email', label: 'E-mail do Responsável', type: 'email'}, 
            { name: 'observacao', label: 'Observação', type: 'textarea', span: 'md:col-span-2' }
        ]}
    ];

    let formHtml = `<input type="hidden" name="id" value="${item.id || ''}">`;
    
    formStructure.forEach(fieldset => {
        formHtml += `<fieldset class="border-0 border-t pt-4 mt-4 first:mt-0 first:pt-0 first:border-0" style="border-color: var(--c-border);"><legend class="text-base font-semibold px-2 -ml-2 mb-2" style="color: var(--c-primary);">${fieldset.legend}</legend><div class="grid grid-cols-1 ${fieldset.grid} gap-x-4 gap-y-3 pt-2 text-left">`;
        fieldset.fields.forEach(field => {
            const labelText = field.label || HEADER_MAP[field.name] || field.name.charAt(0).toUpperCase() + field.name.slice(1);
            const requiredClass = field.required ? 'required-label' : '';
            const value = item[field.name] || '';
            
            formHtml += `<div class="${field.span || ''}">`;
            if (field.type !== 'component') {
                 formHtml += `<label for="${field.name}" class="block text-sm font-medium mb-1 ${requiredClass}">${labelText}:</label>`;
            }

            if (field.type === 'select') {
                formHtml += `<select id="${field.name}" name="${field.name}" ${field.required ? 'required' : ''} class="w-full"><option value="">Selecione...</option>${field.options}</select>`;
            } else if (field.type === 'textarea') {
                formHtml += `<textarea id="${field.name}" name="${field.name}" rows="3" class="w-full">${value}</textarea>`;
            } else if (field.type === 'component') {
                 formHtml += `<label class="block text-sm font-medium mb-1">${labelText}:</label>${field.html}`;
            }
            else {
                const fieldType = field.name === 'valor_unitario' ? 'text' : (field.type || 'text');
                const fieldId = field.name === 'valor_unitario' ? 'itemValor' : field.name;
                formHtml += `<input type="${fieldType}" id="${fieldId}" name="${field.name}" ${field.required ? 'required' : ''} value="${value}" class="w-full">`;
            }
            formHtml += `</div>`;
        });
        formHtml += `</div></fieldset>`;
    });
    
    formHtml += maintenanceSection;
    return formHtml;
}

export function renderAlterarResponsavelForm(item, setores) {
    const setorOptions = setores.map(s => 
        `<option value="${s.id}" ${s.id === item.setor_id ? 'selected' : ''}>${s.nome}</option>`
    ).join('');
    
    return `
        <div class="mb-4 p-3 rounded-md border" style="background-color: var(--c-bg-page); border-color: var(--c-border);">
            <p><strong>Item:</strong> ${item.nome} (${item.patrimonio})</p> 
            <p><strong>Responsável Atual:</strong> ${item.responsavel_nome || 'Nenhum'} (${item.responsavel_email || 'sem e-mail'})</p> 
        </div> 
        <form id="formConfirmaAlteracao"> 
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4"> 
                <div>
                    <label class="block mb-1">Novo Responsável:</label>
                    <input type="text" id="novoResponsavelNome" class="w-full" value="${item.responsavel_nome || ''}">
                </div> 
                <div>
                    <label class="block mb-1">Novo E-mail do Responsável:</label>
                    <input type="email" id="novoResponsavelEmail" class="w-full" value="${item.responsavel_email || ''}">
                </div> 
            </div> 
            <div class="mt-4">
                <label class="block mb-1">Novo Setor:</label>
                <select id="novoSetor" class="w-full">${setorOptions}</select>
            </div> 
            <div class="flex justify-end gap-4 mt-6"> 
                <button type="button" class="btn btn-secondary" onclick="window.app.openAlterarResponsavelModal()">Voltar</button> 
                <button type="submit" class="btn btn-primary">Confirmar</button> 
            </div> 
        </form>
    `;
}