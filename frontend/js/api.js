// frontend/js/api.js
import { API_BASE_URL, TOKEN_KEY } from './config.js';
import { showToast } from './utils.js';

export function logout() {
    sessionStorage.clear();
    window.location.reload();
}

/**
 * Função genérica para chamadas JSON
 */
export async function fetchAPI(endpoint, options = {}) {
    const loadingIndicator = document.getElementById('loadingIndicator') || document.getElementById('loadingIndicatorUser');
    if (loadingIndicator) loadingIndicator.style.display = 'block';

    try {
        const token = sessionStorage.getItem(TOKEN_KEY);
        // Permite login sem token, mas exige token para outras rotas
        if (!token && endpoint !== '/login') {
            // Pequena verificação para não bloquear o login
             if(!endpoint.includes('/login')) throw new Error("Token de autenticação não encontrado.");
        }

        const headers = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const config = {
            ...options,
            headers,
            body: options.body ? JSON.stringify(options.body) : null
        };

        // Ajuste para usar a URL base correta
        const url = `${window.location.origin}${API_BASE_URL}${endpoint}`;
        
        const response = await fetch(url, config);

        let data = {};
        try {
            const text = await response.text();
            data = text ? JSON.parse(text) : {};
        } catch (e) {
            throw new Error(`O servidor respondeu de forma inesperada.`);
        }

        if (!response.ok) {
            const errorMessage = data.message || `Erro: ${response.status}`;
            if ([401, 403].includes(response.status)) {
                logout();
            }
            throw new Error(errorMessage);
        }
        return data;
    } catch (error) {
        showToast(error.message, 'error');
        throw error;
    } finally {
        if (loadingIndicator) loadingIndicator.style.display = 'none';
    }
}

/**
 * Função específica para Upload de Arquivos (FormData)
 * Não define Content-Type header manualmente para deixar o browser definir o boundary
 */
export async function fetchAPIFile(endpoint, options = {}) {
    const loadingIndicator = document.getElementById('loadingIndicator') || document.getElementById('loadingIndicatorUser');
    if (loadingIndicator) loadingIndicator.style.display = 'block';

    try {
        const token = sessionStorage.getItem(TOKEN_KEY);
        if (!token) throw new Error("Token de autenticação não encontrado.");

        const headers = { 'Authorization': `Bearer ${token}` };

        const url = `${window.location.origin}${API_BASE_URL}${endpoint}`;

        const response = await fetch(url, { ...options, headers });
        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            const errorMessage = data.message || `Erro: ${response.status}`;
            if ([401, 403].includes(response.status)) logout();
            throw new Error(errorMessage);
        }
        return data;
    } catch (error) {
        showToast(error.message, 'error');
        throw error;
    } finally {
        if (loadingIndicator) loadingIndicator.style.display = 'none';
    }
}