(() => {
  const form = document.querySelector('[data-weather-search]');
  const input = document.querySelector('[data-weather-input]');
  const useLocationBtn = document.querySelector('[data-use-location]');
  const statusEl = document.querySelector('[data-weather-status]');
  const cityEl = document.querySelector('[data-weather-city]');
  const tempEl = document.querySelector('[data-temp]');
  const conditionEl = document.querySelector('[data-condition]');
  const windEl = document.querySelector('[data-wind]');
  const gustEl = document.querySelector('[data-gust]');
  const humidityEl = document.querySelector('[data-humidity]');
  const rainEl = document.querySelector('[data-rain]');
  const sprayEl = document.querySelector('[data-spray-status]');
  const forecastEl = document.querySelector('[data-forecast]');

  if (!form) return;

  const WMO = {
    0: 'Despejado', 1: 'Mayormente despejado', 2: 'Parcialmente nublado', 3: 'Cubierto',
    45: 'Niebla', 48: 'Niebla con escarcha', 51: 'Llovizna leve', 53: 'Llovizna',
    55: 'Llovizna intensa', 61: 'Lluvia leve', 63: 'Lluvia', 65: 'Lluvia intensa',
    71: 'Nieve leve', 73: 'Nieve', 75: 'Nieve intensa', 80: 'Chaparrones leves',
    81: 'Chaparrones', 82: 'Chaparrones intensos', 95: 'Tormenta', 96: 'Tormenta con granizo',
    99: 'Tormenta fuerte con granizo'
  };

  function setStatus(message, isError = false) {
    statusEl.textContent = message;
    statusEl.style.color = isError ? '#9d1630' : '';
  }

  function sprayAssessment({ wind, gust, rain, humidity }) {
    // This is deliberately a simple informational heuristic, not an agronomic recommendation.
    if (rain > 45 || wind > 22 || gust > 32) {
      return { cls: 'bad', text: 'Condiciones poco favorables para aplicación. Revisar lluvia y viento antes de operar.' };
    }
    if (rain > 25 || wind > 15 || gust > 25 || humidity < 35) {
      return { cls: 'caution', text: 'Condiciones a evaluar. Verificar producto, deriva, humedad y ventana operativa.' };
    }
    return { cls: 'good', text: 'Ventana meteorológica potencialmente favorable. Confirmar siempre con criterio operativo y etiqueta del producto.' };
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

  async function fetchWeather(lat, lon, label) {
    setStatus('Actualizando datos meteorológicos…');
    const url = new URL('https://api.open-meteo.com/v1/forecast');
    url.searchParams.set('latitude', String(lat));
    url.searchParams.set('longitude', String(lon));
    url.searchParams.set('current', 'temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,wind_gusts_10m');
    url.searchParams.set('hourly', 'precipitation_probability');
    url.searchParams.set('daily', 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max');
    url.searchParams.set('timezone', 'auto');
    url.searchParams.set('forecast_days', '7');
    url.searchParams.set('wind_speed_unit', 'kmh');

    const response = await fetch(url);
    if (!response.ok) throw new Error('No se pudo cargar el pronóstico.');
    const data = await response.json();

    const currentHour = new Date(data.current.time).getHours();
    const hourlyIndex = data.hourly.time.findIndex((t) => new Date(t).getHours() === currentHour);
    const rainProbability = hourlyIndex >= 0 ? data.hourly.precipitation_probability[hourlyIndex] : 0;

    const assessment = sprayAssessment({
      wind: data.current.wind_speed_10m,
      gust: data.current.wind_gusts_10m,
      rain: rainProbability,
      humidity: data.current.relative_humidity_2m
    });

    cityEl.textContent = label;
    tempEl.textContent = `${Math.round(data.current.temperature_2m)}°`;
    conditionEl.textContent = WMO[data.current.weather_code] || 'Condición variable';
    windEl.textContent = `${Math.round(data.current.wind_speed_10m)} km/h`;
    gustEl.textContent = `${Math.round(data.current.wind_gusts_10m)} km/h`;
    humidityEl.textContent = `${Math.round(data.current.relative_humidity_2m)}%`;
    rainEl.textContent = `${Math.round(rainProbability || 0)}%`;
    sprayEl.className = `spray-status ${assessment.cls}`;
    sprayEl.textContent = assessment.text;

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

    setStatus(`Actualizado para ${label}.`);
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const query = input.value.trim();
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
        .catch((error) => setStatus(error.message, true)),
      () => setStatus('No se pudo acceder a tu ubicación.', true),
      { enableHighAccuracy: false, timeout: 9000 }
    );
  });

  // Default: Villa Ángela / central service area. Approximate coordinates only for the initial view.
  fetchWeather(-27.57, -60.72, 'Villa Ángela, Chaco').catch((error) => setStatus(error.message, true));
})();
