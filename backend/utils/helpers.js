// backend/utils/helpers.js

function parseCurrency(currencyString) {
    if (!currencyString || typeof currencyString !== 'string') return 0;
    let cleanString = currencyString.replace('R$', '').trim();
    if (cleanString.includes(',') && cleanString.lastIndexOf(',') > cleanString.lastIndexOf('.')) {
        cleanString = cleanString.replace(/\./g, '').replace(',', '.');
    } else {
        cleanString = cleanString.replace(/,/g, '');
    }
    const numericValue = parseFloat(cleanString);
    return isNaN(numericValue) ? 0 : numericValue;
}

const buildWhereClause = (queryParams) => {
    const { search, tipo, termo } = queryParams;
    let whereClauses = [], queryValues = [], valueIndex = 1;

    if (tipo && termo) {
        const fieldMap = { patrimonio: 'p.patrimonio', tipo_item: 'p.nome', responsavel: 'p.responsavel_nome', setor: 's.nome' };
        if (fieldMap[tipo]) {
            whereClauses.push(`${fieldMap[tipo]} ILIKE $${valueIndex++}`);
            queryValues.push(`%${termo}%`);
        }
    } else if (search) {
        whereClauses.push(`(p.nome ILIKE $1 OR p.patrimonio ILIKE $1 OR s.nome ILIKE $1 OR p.responsavel_nome ILIKE $1)`);
        queryValues.push(`%${search}%`);
    }
    return { whereClause: whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '', queryValues, valueIndex: queryValues.length + 1 };
};

const generateChangeDetails = (oldData, newData, setorMap) => {
    const changes = [];
    const fieldLabels = {
        nome: 'Item', patrimonio: 'Patrimônio', setor_id: 'Setor', responsavel_nome: 'Responsável',
        responsavel_email: 'E-mail do Responsável', valor_unitario: 'Valor', marca: 'Marca', modelo: 'Modelo',
        numero_serie: 'N° de Série', data_aquisicao: 'Data de Aquisição', fornecedor: 'Fornecedor',
        garantia: 'Garantia', status: 'Status', observacao: 'Observação'
    };

    for (const key in fieldLabels) {
        const oldValue = oldData[key] || '';
        const newValue = newData[key] || '';

        if (String(oldValue).trim() !== String(newValue).trim()) {
            let from = oldValue;
            let to = newValue;

            if (key === 'setor_id') {
                from = setorMap[oldValue] || `ID ${oldValue}`;
                to = setorMap[newValue] || `ID ${newValue}`;
            } else if (key === 'valor_unitario') {
                from = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(oldValue || 0);
                to = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(newValue || 0);
            }
            
            changes.push(`${fieldLabels[key]}: de "${from}" para "${to}"`);
        }
    }
    return changes.length > 0 ? changes.join('; ') : 'Nenhuma alteração de dados detectada.';
};

module.exports = { parseCurrency, buildWhereClause, generateChangeDetails };