(() => {
  'use strict';

  const RAIN_URL = '/lluvias.html';
  const ACCOUNT_URL = `${RAIN_URL}#cuenta`;
  const TERMS_URL = '/terminos.html';
  const AUTH_API = 'https://lluvias-api.sudamericanasrl.com';

  const menuButton = document.querySelector('[data-menu-toggle]');
  const nav = document.querySelector('[data-nav]');

  // Menú móvil existente
  if (menuButton && nav) {
    menuButton.addEventListener('click', () => {
      const isOpen = nav.classList.toggle('open');
      menuButton.setAttribute('aria-expanded', String(isOpen));
    });
  }

  // Asegura que la navegación principal tenga siempre
  // Servicios · Clima · Lluvias · Contacto · Ingresar/Mi cuenta
  function ensurePrimaryNavigation() {
    if (!nav) return;

    const desiredLinks = [
      {
        href: '/servicios.html',
        label: 'Servicios',
        match: 'servicios.html'
      },
      {
        href: '/clima.html',
        label: 'Clima',
        match: 'clima.html'
      },
      {
        href: RAIN_URL,
        label: 'Lluvias',
        match: 'lluvias.html'
      },
      {
        href: '/presupuestos.html',
        label: 'Contacto',
        match: 'presupuestos.html'
      }
    ];

    for (const item of desiredLinks) {
      let link = Array.from(nav.querySelectorAll('a')).find((candidate) => {
        const href = candidate.getAttribute('href') || '';

        return (
          href === item.href ||
          href.endsWith(item.match)
        );
      });

      if (!link) {
        link = document.createElement('a');
        link.href = item.href;
      }

      link.textContent = item.label;
      nav.appendChild(link);
    }

    let accountLink = nav.querySelector('[data-global-account-link]');

    if (!accountLink) {
      accountLink = document.createElement('a');
      accountLink.href = ACCOUNT_URL;
      accountLink.textContent = 'Ingresar';
      accountLink.dataset.globalAccountLink = '';
      accountLink.setAttribute(
        'aria-label',
        'Ingresar o abrir mi cuenta de colaborador'
      );

      nav.appendChild(accountLink);
    }
  }

  // Consulta la sesión existente.
  // Si el usuario ya está autenticado cambia "Ingresar" por "Mi cuenta".
  async function refreshGlobalAccountLink() {
    const accountLink = document.querySelector(
      '[data-global-account-link]'
    );

    if (!accountLink) return;

    try {
      const response = await fetch(`${AUTH_API}/usuarios/me`, {
        method: 'GET',
        headers: {
          Accept: 'application/json'
        },
        credentials: 'include'
      });

      const data = await response.json().catch(() => ({}));

      const user =
        data?.user ||
        data?.data?.user ||
        null;

      if (response.ok && user) {
        accountLink.textContent = 'Mi cuenta';
        accountLink.href = ACCOUNT_URL;
        accountLink.setAttribute(
          'aria-label',
          'Abrir mi cuenta de colaborador'
        );
      } else {
        accountLink.textContent = 'Ingresar';
        accountLink.href = ACCOUNT_URL;
      }
    } catch (error) {
      // Si la API no responde, la navegación sigue funcionando.
      // Nunca bloqueamos el sitio por un fallo de sesión.
      accountLink.textContent = 'Ingresar';
      accountLink.href = ACCOUNT_URL;
    }
  }

  // Agrega Términos y privacidad al pie de página
  // sin editar cada HTML individualmente.
  function ensureTermsLink() {
    const footer = document.querySelector('.site-footer');

    if (!footer) return;

    if (footer.querySelector('[data-terms-link]')) return;

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

  // Ejecutamos primero los cambios globales.
  ensurePrimaryNavigation();
  ensureTermsLink();
  refreshGlobalAccountLink();

  // Animaciones existentes del sitio
  const revealEls = document.querySelectorAll('.reveal');

  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            observer.unobserve(entry.target);
          }
        });
      },
      {
        threshold: 0.12
      }
    );

    revealEls.forEach((el) => observer.observe(el));
  } else {
    revealEls.forEach((el) => el.classList.add('visible'));
  }

  // Botones existentes de copiar información
  document
    .querySelectorAll('[data-copy-value]')
    .forEach((button) => {
      button.addEventListener('click', async () => {
        const value =
          button.getAttribute('data-copy-value') || '';

        const label =
          button.getAttribute('data-copy-label') || 'Copiado';

        try {
          await navigator.clipboard.writeText(value);

          const previous = button.textContent;

          button.textContent = label;

          window.setTimeout(() => {
            button.textContent = previous;
          }, 1800);
        } catch (error) {
          button.textContent = 'No se pudo copiar';
        }
      });
    });

  // Año automático existente
  const year = document.querySelector('[data-year]');

  if (year) {
    year.textContent = String(new Date().getFullYear());
  }
})();
