(() => {
  'use strict';

  const RAIN_URL = '/lluvias.html';
  const ACCOUNT_URL = `${RAIN_URL}#cuenta`;
  const TERMS_URL = '/terminos.html';
  const AUTH_API = 'https://lluvias-api.sudamericanasrl.com';

  const menuButton = document.querySelector('[data-menu-toggle]');
  const nav = document.querySelector('[data-nav]');

  let currentSessionUser = null;
  let rainBridgeObserver = null;

  // =========================================================
  // MENÚ MÓVIL
  // =========================================================

  if (menuButton && nav) {
    menuButton.addEventListener('click', () => {
      const isOpen = nav.classList.toggle('open');

      menuButton.setAttribute(
        'aria-expanded',
        String(isOpen)
      );
    });
  }

  // =========================================================
  // HELPERS
  // =========================================================

  function isRainPage() {
    const path = window.location.pathname
      .replace(/\/+$/, '')
      .toLowerCase();

    return (
      path.endsWith('/lluvias.html') ||
      path.endsWith('/lluvias')
    );
  }

  function getGlobalAccountLink() {
    return document.querySelector(
      '[data-global-account-link]'
    );
  }

  function getRainAccountBridge() {
    return document.querySelector(
      '[data-account-button]'
    );
  }

  function isRainButtonLoggedIn(button) {
    if (!button) return false;

    const text = String(button.textContent || '')
      .trim()
      .toLowerCase();

    return (
      text !== '' &&
      !text.includes('ingresar')
    );
  }

  // =========================================================
  // NAVEGACIÓN GLOBAL
  // =========================================================

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
      let link = Array
        .from(nav.querySelectorAll('a'))
        .find((candidate) => {
          const href =
            candidate.getAttribute('href') || '';

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

    let accountLink = getGlobalAccountLink();

    if (!accountLink) {
      accountLink = document.createElement('a');

      accountLink.href = ACCOUNT_URL;
      accountLink.textContent = 'Ingresar';
      accountLink.dataset.globalAccountLink = '';

      accountLink.setAttribute(
        'aria-label',
        'Ingresar o abrir mi cuenta'
      );

      nav.appendChild(accountLink);
    }
  }

  // =========================================================
  // SESIÓN GLOBAL
  // =========================================================

  async function refreshGlobalAccountLink() {
    const accountLink = getGlobalAccountLink();

    if (!accountLink) return null;

    try {
      const response = await fetch(
        `${AUTH_API}/usuarios/me`,
        {
          method: 'GET',

          headers: {
            Accept: 'application/json'
          },

          credentials: 'include'
        }
      );

      const data = await response
        .json()
        .catch(() => ({}));

      const user =
        data?.user ||
        data?.data?.user ||
        null;

      if (response.ok && user) {
        currentSessionUser = user;

        accountLink.textContent = 'Mi cuenta';
        accountLink.href = ACCOUNT_URL;

        accountLink.setAttribute(
          'aria-label',
          'Abrir mi cuenta'
        );

        return user;
      }

      currentSessionUser = null;

      accountLink.textContent = 'Ingresar';
      accountLink.href = ACCOUNT_URL;

      accountLink.setAttribute(
        'aria-label',
        'Ingresar o crear perfil'
      );

      return null;
    } catch (error) {
      currentSessionUser = null;

      accountLink.textContent = 'Ingresar';
      accountLink.href = ACCOUNT_URL;

      return null;
    }
  }

  // =========================================================
  // CONEXIÓN ENTRE EL BOTÓN SUPERIOR
  // Y EL LOGIN REAL DE LLUVIAS
  // =========================================================

  function syncGlobalAccountFromRainButton(button) {
    const accountLink = getGlobalAccountLink();

    if (!accountLink || !button) return;

    const loggedIn = isRainButtonLoggedIn(button);

    if (loggedIn) {
      accountLink.textContent = 'Mi cuenta';

      accountLink.setAttribute(
        'aria-label',
        'Abrir mi cuenta'
      );
    } else {
      accountLink.textContent = 'Ingresar';

      accountLink.setAttribute(
        'aria-label',
        'Ingresar o crear perfil'
      );
    }
  }

  function prepareRainAccountBridge(button) {
    if (!button) return false;

    // El botón original sigue existiendo internamente
    // porque lluvias.js contiene toda la lógica real
    // de login, perfil y cuenta.
    //
    // Pero lo ocultamos visualmente para evitar
    // el "Ingresar" duplicado dentro del hero.
    button.style.display = 'none';

    syncGlobalAccountFromRainButton(button);

    if (!button.dataset.globalBridgeObserved) {
      button.dataset.globalBridgeObserved = '1';

      const observer = new MutationObserver(() => {
        button.style.display = 'none';

        syncGlobalAccountFromRainButton(button);
      });

      observer.observe(button, {
        childList: true,
        subtree: true,
        characterData: true
      });
    }

    return true;
  }

  function waitForRainAccountBridge(
    timeoutMs = 5000
  ) {
    return new Promise((resolve) => {
      const existing = getRainAccountBridge();

      if (existing) {
        prepareRainAccountBridge(existing);
        resolve(existing);
        return;
      }

      const startedAt = Date.now();

      const observer = new MutationObserver(() => {
        const button = getRainAccountBridge();

        if (button) {
          observer.disconnect();

          prepareRainAccountBridge(button);
          resolve(button);

          return;
        }

        if (
          Date.now() - startedAt >
          timeoutMs
        ) {
          observer.disconnect();
          resolve(null);
        }
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true
      });

      window.setTimeout(() => {
        observer.disconnect();

        const button = getRainAccountBridge();

        if (button) {
          prepareRainAccountBridge(button);
        }

        resolve(button || null);
      }, timeoutMs);
    });
  }

  function waitForRainSessionState(
    button,
    shouldBeLoggedIn,
    timeoutMs = 2500
  ) {
    return new Promise((resolve) => {
      const startedAt = Date.now();

      const check = () => {
        const buttonLoggedIn =
          isRainButtonLoggedIn(button);

        if (
          buttonLoggedIn === shouldBeLoggedIn ||
          Date.now() - startedAt > timeoutMs
        ) {
          resolve();
          return;
        }

        window.setTimeout(check, 100);
      };

      check();
    });
  }

  async function openRealRainAccount() {
    const button =
      await waitForRainAccountBridge();

    if (!button) {
      window.location.href = ACCOUNT_URL;
      return;
    }

    await waitForRainSessionState(
      button,
      Boolean(currentSessionUser)
    );

    // Ejecuta el botón REAL administrado
    // por lluvias.js:
    //
    // - sin sesión -> login Google/email
    // - con sesión -> Mi cuenta
    button.click();
  }

  async function connectGlobalAccountLink() {
    const accountLink = getGlobalAccountLink();

    if (!accountLink) return;

    accountLink.addEventListener(
      'click',
      async (event) => {
        // Desde cualquier otra página:
        // vamos a Lluvias y abrimos la cuenta allí.
        if (!isRainPage()) {
          return;
        }

        // Ya estamos en Lluvias:
        // no navegamos, abrimos el login real.
        event.preventDefault();

        await openRealRainAccount();
      }
    );

    if (!isRainPage()) return;

    // Ocultar el botón duplicado apenas
    // lluvias.js lo cree.
    waitForRainAccountBridge();

    // Si llegamos desde otra página usando #cuenta,
    // abrir automáticamente el login/cuenta real.
    if (
      window.location.hash.toLowerCase() ===
      '#cuenta'
    ) {
      await openRealRainAccount();

      // Limpiamos #cuenta para que al recargar
      // no vuelva a abrirse automáticamente.
      if (window.history?.replaceState) {
        window.history.replaceState(
          null,
          '',
          `${window.location.pathname}${window.location.search}`
        );
      }
    }
  }

  // =========================================================
  // TÉRMINOS Y PRIVACIDAD
  // =========================================================

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

  // =========================================================
  // INICIALIZACIÓN GLOBAL
  // =========================================================

  ensurePrimaryNavigation();
  ensureTermsLink();

  const sessionPromise =
    refreshGlobalAccountLink();

  sessionPromise
    .then(() => connectGlobalAccountLink())
    .catch(() => connectGlobalAccountLink());

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
