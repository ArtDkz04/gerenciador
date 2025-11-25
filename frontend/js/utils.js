// frontend/js/utils.js

export function formatCurrency(v) {
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    }).format(Number(v) || 0);
}

export function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `p-4 mb-2 rounded-lg shadow-lg text-white transition-opacity duration-300`;
    toast.style.backgroundColor = type === 'success' ? 'var(--c-success)' : 'var(--c-danger)';
    toast.textContent = message;

    container.appendChild(toast);

    // Remove o toast após 5 segundos
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 5000);
}

export function openModal(id) {
    const m = document.getElementById(id);
    if (m) m.style.display = 'flex';
}

export function closeModal(id) {
    const m = document.getElementById(id);
    if (m) {
        const f = m.querySelector('form');
        if (f) f.reset();
        
        const err = m.querySelector('#importErrors');
        if (err) {
            err.innerHTML = '';
            err.classList.add('hidden');
        }
        
        m.style.display = 'none';
    }
}

// --- Lógica de Tema (Dark Mode) ---

export function initDarkMode(isUserView = false) {
    const moon = document.getElementById(isUserView ? 'moon-icon-user' : 'moon-icon');
    const sun = document.getElementById(isUserView ? 'sun-icon-user' : 'sun-icon');

    const theme = localStorage.getItem('theme');
    const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

    if (theme === 'dark' || (!theme && systemDark)) {
        document.documentElement.classList.add('dark');
        moon?.classList.add('hidden');
        sun?.classList.remove('hidden');
    } else {
        document.documentElement.classList.remove('dark');
        moon?.classList.remove('hidden');
        sun?.classList.add('hidden');
    }
}

export function toggleDarkMode(isUserView = false) {
    const isDark = document.documentElement.classList.toggle('dark');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');

    const moon = document.getElementById(isUserView ? 'moon-icon-user' : 'moon-icon');
    const sun = document.getElementById(isUserView ? 'sun-icon-user' : 'sun-icon');
    
    moon?.classList.toggle('hidden', isDark);
    sun?.classList.toggle('hidden', !isDark);

    // Dispara um evento customizado para que gráficos possam se atualizar
    window.dispatchEvent(new CustomEvent('theme-changed', { detail: { isDark } }));
}