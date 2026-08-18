// Подключите этот файл в конце body на всех страницах (или через свой основной JS-файл)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => console.log('Service Worker зарегистрирован:', reg.scope))
      .catch((err) => console.error('Ошибка регистрации Service Worker:', err));
  });
}
