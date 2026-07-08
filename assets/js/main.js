(() => {
  'use strict';

  const RAIN_URL = '/lluvias.html';
  const ACCOUNT_URL = `${RAIN_URL}#cuenta`;
  const TERMS_URL = '/terminos.html';
  const AUTH_API = 'https://lluvias-api.sudamericanasrl.com';

  const menuButton = document.querySelector('[data-menu-toggle]');
  const nav = document.querySelector('[data-nav]');

  if (menuButton && nav) {
    menuButton.addEventListener('click', () => {
      const isOpen = nav.classList.toggle('open');
      menuButton.setAttribute('aria-expanded', String(isOpen));
    });
  }

  function ensurePrimaryNavigation() {
    if (!nav) return;

    // Normaliza la navegación sin duplicar enlaces existentes.
    const desiredLinks = [
      { href: '/servicios.html', label: 'Servicios', match: 'servicios.html' },
      { href: '/clima.html', label: 'Clima', match: 'clima.html' },
      { href: RAIN_URL, label: 'Lluvias', match: 'lluvias.html' },
      { href: '/presupuestos.html', label: 'Contacto', match: 'presupuestos.html' }
    ];

    for (const item of desiredLinks) {
      let link = Array.from(nav.querySelectorAll('a')).find(candidate => {
        const href = candidate.getAttribute('href') || '';
        return href.endsWith(item.match) || href === item.href;
      });

      if (!link) {
        link = document.createElement('a');
        link.href = item.href;
      }

      link.textContent = item.label;
      nav.appendChild(link); // también normaliza el orden
    }

    let accountLink = nav.querySelector('[data-global-account-link]');
    if (!accountLink) {
      accountLink = document.createElement('a');
      accountLink.href = ACCOUNT_URL;
      accountLink.textContent = 'Ingresar';
      accountLink.dataset.globalAccountLink = '';
      accountLink.setAttribute('aria-label', 'Ingresar o abrir mi cuenta de colaborador');
      nav.appendChild(accountLink);
    }
  }

  async function refreshGlobalAccountLink() {
    const accountLink = document.querySelector('[data-global-account-link]');
    if (!accountLink) return;

    try {
      const response = await fetch(`${AUTH_API}/usuarios/me`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        credentials: 'include'
      });

      const data = await response.json().catch(() => ({}));
      const user = data?.user || data?.data?.user || null;

      if (response.ok && user) {
        accountLink.textContent = 'Mi cuenta';
        accountLink.setAttribute('aria-label', 'Abrir mi cuenta de colaborador');
      }
    } catch {
      // La navegación nunca debe depender de que la API responda.
    }
  }

  function ensureTermsLink() {
    const footer = document.querySelector('.site-footer');
    if (!footer || footer.querySelector('[data-terms-link]')) return;

    const social = footer.querySelector('.footer-social');
    if (social) {
      const link = document.createElement('a');
      link.href = TERMS_URL;
      link.textContent = 'Términos y privacidad';
      link.dataset.termsLink = '';
      social.appendChild(link);
      return;
    }

    const small = footer.querySelector('small');
    if (small) {
      const separator = document.createTextNode(' · ');
      const link = document.createElement('a');
      link.href = TERMS_URL;
      link.textContent = 'Términos y privacidad';
      link.dataset.termsLink = '';
      small.append(separator, link);
    }
  }

  ensurePrimaryNavigation();
  ensureTermsLink();
  refreshGlobalAccountLink();

  const revealEls = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });
    revealEls.forEach((el) => observer.observe(el));
  } else {
    revealEls.forEach((el) => el.classList.add('visible'));
  }

  document.querySelectorAll('[data-copy-value]').forEach((button) => {
    button.addEventListener('click', async () => {
      const value = button.getAttribute('data-copy-value') || '';
      const label = button.getAttribute('data-copy-label') || 'Copiado';
      try {
        await navigator.clipboard.writeText(value);
        const previous = button.textContent;
        button.textContent = label;
        window.setTimeout(() => { button.textContent = previous; }, 1800);
      } catch {
        button.textContent = 'No se pudo copiar';
      }
    });
  });

  const year = document.querySelector('[data-year]');
  if (year) year.textContent = String(new Date().getFullYear());
})();
