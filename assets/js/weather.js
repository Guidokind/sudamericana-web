(() => {
  const form = document.querySelector('[data-weather-search]');
  if (!form) return;

  const input = document.querySelector('[data-weather-input]');
  const useLocationBtn = document.querySelector('[data-use-location]');
  const statusEl = document.querySelector('[data-weather-status]');
  const cityEl = document.querySelector('[data-weather-city]');
  const tempEl = document.querySelector('[data-temp]');
  const conditionEl = document.querySelector('[data-condition]');
  const windEl = document.querySelector('[data-wind]');
  const windDirectionEl = document.querySelector('[data-wind-direction]');
  const gustEl = document.querySelector('[data-gust]');
  const humidityEl = document.querySelector('[data-humidity]');
  const rainEl = document.querySelector('[data-rain]');
  const assessmentEl = document.querySelector('[data-spray-status]');
  const assessmentDetailEl = document.querySelector('[data-assessment-detail]');
  const forecastEl = document.querySelector('[data-forecast]');
  const homeHourlyEl = document.querySelector('[data-home-hourly]');

  const WMO = {
    0: 'Despejado', 1: 'Mayormente despejado', 2: 'Parcialmente nublado', 3: 'Cubierto',
    45: 'Niebla', 48: 'Niebla con escarcha', 51: 'Llovizna leve', 53: 'Llovizna',
    55: 'Llovizna intensa', 61: 'Lluvia leve', 63: 'Lluvia', 65: 'Lluvia intensa',
    71: 'Nieve leve', 73: 'Nieve', 75: 'Nieve intensa', 80: 'Chaparrones leves',
    81: 'Chaparrones', 82: 'Chaparrones intensos', 95: 'Tormenta', 96: 'Tormenta con granizo',
    99: 'Tormenta fuerte con granizo'
  };

  function setStatus(message, isError = false) {
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.style.color = isError ? '#9d1630' : '';
  }

  function compassDirection(degrees) {
    if (!Number.isFinite(degrees)) return '--';
    const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSO', 'SO', 'OSO', 'O', 'ONO', 'NO', 'NNO'];
    return directions[Math.round((((degrees % 360) + 360) % 360) / 22.5) % 16];
  }

  function getCurrentHourlyIndex(data) {
    if (!data.hourly?.time?.length) return 0;
    const exactIndex = data.hourly.time.indexOf(data.current.time);
    if (exactIndex >= 0) return exactIndex;

    const currentHour = String(data.current.time || '').slice(0, 13);
    const prefixIndex = data.hourly.time.findIndex((time) => String(time).slice(0, 13) === currentHour);
    return prefixIndex >= 0 ? prefixIndex : 0;
  }

  function assessmentFor({ wind, gust, rain3h, humidity }) {
    const reasons = [];

    if (rain3h >= 45) reasons.push('alta probabilidad de lluvia en las próximas 3 h');
    if (wind > 22) reasons.push('viento elevado');
    if (gust > 32) reasons.push('ráfagas elevadas');

    if (reasons.length) {
      return {
        cls: 'bad',
        title: 'Desfavorables',
        detail: reasons.join(' · ')
      };
    }

    if (rain3h >= 25) reasons.push('lluvia próxima a vigilar');
    if (wind > 15) reasons.push('viento moderado');
    if (gust > 25) reasons.push('ráfagas a vigilar');
    if (humidity < 35) reasons.push('humedad relativa baja');

    if (reasons.length) {
      return {
        cls: 'caution',
        title: 'A evaluar',
        detail: reasons.join(' · ')
      };
    }

    return {
      cls: 'good',
      title: 'Potencialmente favorables',
      detail: 'viento moderado · ráfagas contenidas · baja probabilidad de lluvia inmediata'
    };
  }

  async function geocode(query) {
    const url = new URL('https://geocoding-api.open-meteo.com/v1/search');
    url.searchParams.set('name', query);
    url.searchParams.set('count', '1');
    url.searchParams.set('language', 'es');
    url.searchParams.set('format', 'json');

    const response = await fetch(url);
    if (!response.ok) throw new Error('No se pudo buscar la localidad.');

    const data = await response.json();
    if (!data.results?.length) throw new Error('No encontramos esa localidad.');
    return data.results[0];
  }

  function renderHourly(data, startIndex) {
    if (!homeHourlyEl) return;

    const endIndex = Math.min(startIndex + 5, data.hourly.time.length);
    const rows = [];

    for (let i = startIndex; i < endIndex; i += 1) {
      const date = new Date(`${data.hourly.time[i]}:00`);
      const isNow = i === startIndex;
      const timeLabel = isNow
        ? 'Ahora'
        : new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit' }).format(date);

      rows.push(`
        <article class="hour-card${isNow ? ' is-now' : ''}">
          <span class="hour-time">${timeLabel}</span>
          <strong class="hour-temp">${Math.round(data.hourly.temperature_2m[i])}°</strong>
          <div class="hour-lines">
            <div class="hour-line"><small>Viento</small><strong>${Math.round(data.hourly.wind_speed_10m[i] || 0)} km/h</strong></div>
            <div class="hour-line"><small>HR</small><strong>${Math.round(data.hourly.relative_humidity_2m[i] || 0)}%</strong></div>
            <div class="hour-line"><small>Lluvia</small><strong>${Math.round(data.hourly.precipitation_probability[i] || 0)}%</strong></div>
          </div>
        </article>`);
    }

    homeHourlyEl.innerHTML = rows.join('');
  }

  function renderDailyForecast(data) {
    if (!forecastEl) return;

    forecastEl.innerHTML = data.daily.time.map((date, i) => {
      const day = new Intl.DateTimeFormat('es-AR', { weekday: 'short', day: '2-digit', month: '2-digit' })
        .format(new Date(`${date}T12:00:00`));

      return `
        <div class="forecast-row">
          <strong>${day}</strong>
          <span><strong>${Math.round(data.daily.temperature_2m_max[i])}°</strong><br><small>máx.</small></span>
          <span><strong>${Math.round(data.daily.temperature_2m_min[i])}°</strong><br><small>mín.</small></span>
          <span><strong>${Math.round(data.daily.precipitation_probability_max[i] || 0)}%</strong><br><small>lluvia</small></span>
          <span><strong>${Math.round(data.daily.wind_speed_10m_max[i] || 0)}</strong><br><small>km/h</small></span>
        </div>`;
    }).join('');
  }

  async function fetchWeather(lat, lon, label) {
    setStatus('Actualizando datos meteorológicos…');

    const url = new URL('https://api.open-meteo.com/v1/forecast');
    url.searchParams.set('latitude', String(lat));
    url.searchParams.set('longitude', String(lon));
    url.searchParams.set('current', 'temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m');
    url.searchParams.set('hourly', 'temperature_2m,relative_humidity_2m,precipitation_probability,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m');
    url.searchParams.set('daily', 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max');
    url.searchParams.set('timezone', 'auto');
    url.searchParams.set('forecast_days', '7');
    url.searchParams.set('wind_speed_unit', 'kmh');

    const response = await fetch(url);
    if (!response.ok) throw new Error('No se pudo cargar el pronóstico.');

    const data = await response.json();
    const hourlyIndex = getCurrentHourlyIndex(data);
    const nextRainValues = data.hourly.precipitation_probability
      .slice(hourlyIndex, Math.min(hourlyIndex + 3, data.hourly.precipitation_probability.length))
      .filter(Number.isFinite);
    const rain3h = nextRainValues.length ? Math.max(...nextRainValues) : 0;

    const assessment = assessmentFor({
      wind: Number(data.current.wind_speed_10m || 0),
      gust: Number(data.current.wind_gusts_10m || 0),
      rain3h,
      humidity: Number(data.current.relative_humidity_2m || 0)
    });

    if (cityEl) cityEl.textContent = label;
    if (tempEl) tempEl.textContent = `${Math.round(data.current.temperature_2m)}°`;
    if (conditionEl) conditionEl.textContent = WMO[data.current.weather_code] || 'Condición variable';
    if (windEl) windEl.textContent = `${Math.round(data.current.wind_speed_10m)} km/h`;
    if (windDirectionEl) {
      const degrees = Number(data.current.wind_direction_10m);
      windDirectionEl.textContent = `${compassDirection(degrees)} ${Math.round(degrees)}°`;
    }
    if (gustEl) gustEl.textContent = `${Math.round(data.current.wind_gusts_10m)} km/h`;
    if (humidityEl) humidityEl.textContent = `${Math.round(data.current.relative_humidity_2m)}%`;
    if (rainEl) rainEl.textContent = `${Math.round(rain3h)}%`;

    if (assessmentEl) {
      assessmentEl.className = `spray-status ${assessment.cls}`;
      assessmentEl.textContent = assessment.title;
    }
    if (assessmentDetailEl) assessmentDetailEl.textContent = assessment.detail;

    renderHourly(data, hourlyIndex);
    renderDailyForecast(data);
    setStatus(`Actualizado para ${label}.`);
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const query = input?.value.trim() || '';
    if (query.length < 2) return setStatus('Escribí una localidad.', true);

    try {
      const place = await geocode(query);
      const label = [place.name, place.admin1].filter(Boolean).join(', ');
      await fetchWeather(place.latitude, place.longitude, label);
    } catch (error) {
      setStatus(error.message || 'Ocurrió un error.', true);
    }
  });

  useLocationBtn?.addEventListener('click', () => {
    if (!navigator.geolocation) return setStatus('Tu navegador no permite geolocalización.', true);

    setStatus('Solicitando ubicación…');
    navigator.geolocation.getCurrentPosition(
      (position) => fetchWeather(position.coords.latitude, position.coords.longitude, 'Ubicación actual')
        .catch((error) => setStatus(error.message || 'No se pudo cargar el clima.', true)),
      () => setStatus('No se pudo acceder a tu ubicación.', true),
      { enableHighAccuracy: false, timeout: 9000 }
    );
  });

  // Vista inicial: Villa Ángela, Chaco.
  fetchWeather(-27.57, -60.72, 'Villa Ángela, Chaco')
    .catch((error) => setStatus(error.message || 'No se pudo cargar el clima.', true));
})();
