// theme.js

// Función para aplicar el tema
function setTheme(themeName) {
    // Establecer el atributo data-theme en el elemento raíz (html)
    document.documentElement.setAttribute('data-theme', themeName);
    // Guardar la preferencia del usuario en localStorage
    localStorage.setItem('theme', themeName);
    
    // Actualizar el ícono del botón
    const themeToggle = document.getElementById('theme-toggle');
    if (themeToggle) {
        themeToggle.textContent = themeName === 'dark' ? '☀️' : '🌙';
        themeToggle.title = themeName === 'dark' ? 'Cambiar a Modo Claro' : 'Cambiar a Modo Oscuro';
    }
}

// Función para alternar entre temas
function toggleTheme() {
    // Verificar el tema actual
    const currentTheme = document.documentElement.getAttribute('data-theme');
    
    // Alternar al tema opuesto
    if (currentTheme === 'dark') {
        setTheme('light');
    } else {
        setTheme('dark');
    }
}

// Inicializar el tema cuando se carga la página
document.addEventListener('DOMContentLoaded', () => {
    // Verificar si hay una preferencia guardada en localStorage
    const savedTheme = localStorage.getItem('theme');
    
    // Verificar la preferencia del sistema operativo si no hay una guardada
    const prefersDarkScheme = window.matchMedia('(prefers-color-scheme: dark)').matches;
    
    // Aplicar el tema: guardado > preferencia del sistema > claro por defecto
    if (savedTheme) {
        setTheme(savedTheme);
    } else if (prefersDarkScheme) {
        setTheme('dark');
    } else {
        setTheme('light'); // Valor por defecto
    }
    
    // Agregar el event listener al botón de toggle
    const themeToggle = document.getElementById('theme-toggle');
    if (themeToggle) {
        themeToggle.addEventListener('click', toggleTheme);
    }
});