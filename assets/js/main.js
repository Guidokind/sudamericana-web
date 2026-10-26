(() => {
  'use strict';
  const TERMS_URL = '/terminos.html';
  const menuButton = document.querySelector('[data-menu-toggle]');
  const nav = document.querySelector('[data-nav]');
  if (menuButton && nav) {
    menuButton.addEventListener('click', () => {
      menuButton.setAttribute('aria-expanded', String(nav.classList.toggle('open')));
    });
  }

  function ensureTermsLink() {
    const footer =
      document.querySelector('.site-footer');

    if (!footer) return;

    if (
      footer.querySelector('[data-terms-link]')
    ) {
      return;
    }

    const social =
      footer.querySelector('.footer-social');

    if (social) {
      const link = document.createElement('a');

      link.href = TERMS_URL;
      link.textContent =
        'Términos y privacidad';

      link.dataset.termsLink = '';

      social.appendChild(link);

      return;
    }

    const small = footer.querySelector('small');

    if (small) {
      const separator =
        document.createTextNode(' · ');

      const link =
        document.createElement('a');

      link.href = TERMS_URL;
      link.textContent =
        'Términos y privacidad';

      link.dataset.termsLink = '';

      small.append(
        separator,
        link
      );
    }
  }

  ensureTermsLink();

  // =========================================================
  // ANIMACIONES EXISTENTES
  // =========================================================

  const revealEls =
    document.querySelectorAll('.reveal');

  if ('IntersectionObserver' in window) {
    const observer =
      new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              entry.target
                .classList
                .add('visible');

              observer.unobserve(
                entry.target
              );
            }
          });
        },
        {
          threshold: 0.12
        }
      );

    revealEls.forEach((el) => {
      observer.observe(el);
    });
  } else {
    revealEls.forEach((el) => {
      el.classList.add('visible');
    });
  }

  // =========================================================
  // BOTONES DE COPIAR EXISTENTES
  // =========================================================

  document
    .querySelectorAll('[data-copy-value]')
    .forEach((button) => {
      button.addEventListener(
        'click',
        async () => {
          const value =
            button.getAttribute(
              'data-copy-value'
            ) || '';

          const label =
            button.getAttribute(
              'data-copy-label'
            ) || 'Copiado';

          try {
            await navigator
              .clipboard
              .writeText(value);

            const previous =
              button.textContent;

            button.textContent = label;

            window.setTimeout(() => {
              button.textContent =
                previous;
            }, 1800);
          } catch (error) {
            button.textContent =
              'No se pudo copiar';
          }
        }
      );
    });

  // =========================================================
  // AÑO AUTOMÁTICO
  // =========================================================

  const year =
    document.querySelector('[data-year]');

  if (year) {
    year.textContent =
      String(new Date().getFullYear());
  }
})();
