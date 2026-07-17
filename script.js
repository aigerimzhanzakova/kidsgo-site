const STORAGE_KEY = "kidsgo_leads_v2";
// Paste the deployed Google Apps Script Web app URL here.
const GOOGLE_SHEETS_WEB_APP_URL = "https://script.google.com/macros/s/AKfycbw4QNhSGlxVa3Ka8IvP3EY6grsCfPrrMCGO9EMlTGXo7FaEJTzXGfAElIqK-TYt5_zs/exec";
const GOOGLE_SHEETS_OWNER_EMAIL = "aigerim.zhanzakova@gmail.com";

const form = document.querySelector("#leadForm");
const formMessage = document.querySelector("#formMessage");
const submitButton = form?.querySelector('[type="submit"]');
const toast = document.querySelector("[data-toast]");
const addressStatus = document.querySelector("[data-address-status]");
const searchAddressButton = document.querySelector("[data-search-address]");
const mapHelper = document.querySelector("[data-map-helper]");
const useMapCenterButton = document.querySelector("[data-use-map-center]");
const citySelect = document.querySelector('select[name="district"]');
const addressConfigs = {
  home: {
    role: "home",
    title: "Адрес дома",
    label: "адрес дома",
    input: document.querySelector('[data-address-input="home"]'),
    suggestions: document.querySelector('[data-address-suggestions="home"]'),
    latInput: document.querySelector("[data-home-lat]"),
    lngInput: document.querySelector("[data-home-lng]"),
    marker: null,
  },
  school: {
    role: "school",
    title: "Адрес школы/сада/секции",
    label: "адрес школы/сада/секции",
    input: document.querySelector('[data-address-input="school"]'),
    suggestions: document.querySelector('[data-address-suggestions="school"]'),
    latInput: document.querySelector("[data-school-lat]"),
    lngInput: document.querySelector("[data-school-lng]"),
    marker: null,
  },
};

const cityCenters = {
  Алматы: [43.238949, 76.889709],
  Астана: [51.12822, 71.430668],
  Шымкент: [42.341684, 69.590101],
  Караганда: [49.806, 73.085],
  Актобе: [50.283933, 57.166978],
  Атырау: [47.0945, 51.9238],
  Актау: [43.65, 51.1975],
  Павлодар: [52.287303, 76.967402],
  "Усть-Каменогорск": [49.9481, 82.6275],
  Тараз: [42.9, 71.3667],
  Костанай: [53.2144, 63.6246],
  Кызылорда: [44.8488, 65.4823],
  Уральск: [51.2278, 51.3865],
  Туркестан: [43.2973, 68.2518],
};
const kazakhstanCenter = [48.0196, 66.9237];

let toastTimer;
let addressTimer;
let addressSearchId = 0;
let homeMap;
let routeLine;
let mapReady = false;
let activeAddressRole = "home";
const addressIcons = {};

initAddressMap();
bindAddressSearch();
citySelect?.addEventListener("change", handleCityChange);

form?.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!form.reportValidity()) {
    return;
  }

  if (false && mapReady) {
    const missingAddress = Object.values(addressConfigs).find(
      (config) => !config.latInput?.value || !config.lngInput?.value
    );

    if (missingAddress) {
      formMessage.textContent = `Выберите ${missingAddress.label} из подсказок или поставьте точку на карте.`;
      setActiveAddress(missingAddress.role);
      missingAddress.input?.focus();
      return;
    }
  }

  const formData = new FormData(form);
  const lead = {
    id: window.crypto?.randomUUID?.() || String(Date.now()),
    createdAt: new Date().toISOString(),
    status: "Новая",
    parentName: getValue(formData, "parentName"),
    phone: getValue(formData, "phone"),
    district: getValue(formData, "district"),
    childName: getValue(formData, "childName"),
    homeAddress: getValue(formData, "homeAddress"),
    homeLat: getValue(formData, "homeLat"),
    homeLng: getValue(formData, "homeLng"),
    schoolAddress: getValue(formData, "schoolAddress"),
    schoolLat: getValue(formData, "schoolLat"),
    schoolLng: getValue(formData, "schoolLng"),
    direction: getValue(formData, "direction"),
    startTime: getValue(formData, "startTime"),
    endTime: getValue(formData, "endTime"),
    childrenCount: getValue(formData, "childrenCount"),
    comment: getValue(formData, "comment"),
  };

  const leads = loadLeads();
  leads.unshift(lead);
  saveLeads(leads);

  const originalButtonText = submitButton?.textContent;
  if (submitButton) {
    submitButton.disabled = true;
    submitButton.textContent = "Отправляем...";
  }

  const sentToSheets = await submitLeadToGoogleSheets(lead);

  form.reset();
  form.elements.childrenCount.value = "1";
  form.elements.direction.value = "Туда и обратно";
  resetAddressPoints();
  updateAddressAvailability();
  if (submitButton) {
    submitButton.disabled = false;
    submitButton.textContent = originalButtonText;
  }
  formMessage.textContent =
    "Спасибо! Заявка принята. Мы свяжемся с вами и уточним детали маршрута.";
  showToast("Заявка отправлена.");
  return;
});

function initAddressMap() {
  if (!window.L || !document.querySelector("#homeMap")) {
    if (mapHelper) {
      mapHelper.textContent = "Карта загрузится при наличии интернет-соединения.";
    }
    return;
  }

  const center = getSelectedCityCenter();
  homeMap = L.map("homeMap", {
    center,
    zoom: getSelectedCityZoom(),
    scrollWheelZoom: false,
  });

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap",
  }).addTo(homeMap);

  homeMap.on("click", (event) => {
    if (!isCitySelected()) {
      addressStatus.textContent = "Сначала выберите город, затем поставьте точку на карте.";
      citySelect?.focus();
      return;
    }

    const config = getActiveAddressConfig();
    setAddressPoint(
      config.role,
      event.latlng.lat,
      event.latlng.lng,
      config.input?.value || "Точка выбрана на карте"
    );
    addressStatus.textContent = `Точка для поля "${config.title}" выбрана на карте вручную.`;
  });

  useMapCenterButton?.addEventListener("click", () => {
    if (!isCitySelected()) {
      addressStatus.textContent = "Сначала выберите город, затем выберите точку на карте.";
      citySelect?.focus();
      return;
    }

    const config = getActiveAddressConfig();
    const centerPoint = homeMap.getCenter();
    setAddressPoint(
      config.role,
      centerPoint.lat,
      centerPoint.lng,
      config.input?.value || "Точка выбрана на карте"
    );
    addressStatus.textContent = `Выбран центр карты для поля "${config.title}".`;
  });

  mapReady = true;
}

function bindAddressSearch() {
  Object.values(addressConfigs).forEach((config) => {
    if (!config.input || !config.suggestions) {
      return;
    }

    config.input.addEventListener("focus", () => {
      setActiveAddress(config.role);
    });

    config.input.addEventListener("input", () => {
      clearTimeout(addressTimer);
      setActiveAddress(config.role);
      clearAddressPoint(config.role, false);
      const query = config.input.value.trim();

      if (query.length < 3) {
        hideSuggestions(config.role);
        addressStatus.textContent = "Введите минимум 3 символа для поиска адреса.";
        return;
      }

      addressStatus.textContent = `Ищем ${config.label}...`;
      addressTimer = window.setTimeout(() => searchAddress(config.role, query), 420);
    });

    config.input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        runAddressSearch(config.role);
      }
    });
  });

  searchAddressButton?.addEventListener("click", () => runAddressSearch());

  document.addEventListener("click", (event) => {
    const clickedSuggestions = Object.values(addressConfigs).some((config) =>
      config.suggestions?.contains(event.target)
    );
    const clickedAddressInput = Object.values(addressConfigs).some(
      (config) => config.input === event.target
    );

    if (
      !clickedSuggestions &&
      !clickedAddressInput &&
      event.target !== searchAddressButton
    ) {
      hideSuggestions();
    }
  });

  updateAddressAvailability();
}

function runAddressSearch(role = activeAddressRole) {
  const config = addressConfigs[role];
  if (!config?.input) {
    return;
  }

  if (!isCitySelected()) {
    hideSuggestions();
    addressStatus.textContent = "Сначала выберите город, затем заполните адрес.";
    citySelect?.focus();
    return;
  }

  clearTimeout(addressTimer);
  setActiveAddress(role);
  clearAddressPoint(role, false);
  const query = config.input.value.trim();

  if (query.length < 3) {
    hideSuggestions(role);
    addressStatus.textContent = "Введите минимум 3 символа для поиска адреса.";
    config.input.focus();
    return;
  }

  addressStatus.textContent = `Ищем ${config.label} на карте...`;
  searchAddress(role, query);
}

async function searchAddress(role, query) {
  const searchId = ++addressSearchId;
  const config = addressConfigs[role];
  const city = getSearchCity();
  const placeQuery = city === "Казахстан" ? `${query}, Казахстан` : `${query}, ${city}, Казахстан`;
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("limit", "6");
  url.searchParams.set("countrycodes", "kz");
  url.searchParams.set("accept-language", "ru");
  url.searchParams.set("q", placeQuery);

  try {
    const response = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      throw new Error("address search failed");
    }

    const results = await response.json();
    if (searchId !== addressSearchId || query !== config.input.value.trim()) {
      return;
    }

    renderSuggestions(role, results);
  } catch {
    if (searchId !== addressSearchId) {
      return;
    }

    hideSuggestions(role);
    addressStatus.textContent =
      "Не удалось загрузить подсказки. Можно выбрать точку на карте вручную.";
  }
}

function renderSuggestions(role, results) {
  const config = addressConfigs[role];
  config.suggestions.innerHTML = "";

  const mapResults = results.filter((item) => {
    const lat = Number(item.lat);
    const lng = Number(item.lon);
    return Number.isFinite(lat) && Number.isFinite(lng);
  });

  if (!mapResults.length) {
    config.suggestions.hidden = false;
    config.suggestions.innerHTML = `
      <div class="suggestion-empty">
        Адрес не найден. Переместите карту и поставьте точку вручную.
      </div>
    `;
    addressStatus.textContent = "Адрес не найден в подсказках.";
    return;
  }

  const firstResult = mapResults[0];
  setAddressPoint(role, Number(firstResult.lat), Number(firstResult.lon), shortAddress(firstResult));

  mapResults.forEach((item) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "suggestion-item";
    button.innerHTML = `
      <span class="suggestion-icon"></span>
      <span>
        <strong>${escapeHtml(shortAddress(item))}</strong>
        <small>${escapeHtml(item.display_name)}</small>
      </span>
    `;
    button.addEventListener("click", () => {
      const lat = Number(item.lat);
      const lng = Number(item.lon);
      const label = shortAddress(item);
      config.input.value = label;
      setAddressPoint(role, lat, lng, label);
      hideSuggestions(role);
      addressStatus.textContent = `${config.title} выбран из подсказок.`;
    });
    config.suggestions.append(button);
  });

  config.suggestions.hidden = false;
  addressStatus.textContent =
    `Карта показала первый найденный вариант для поля "${config.title}". Выберите точный адрес из списка или уточните точку вручную.`;
}

function setAddressPoint(role, lat, lng, label) {
  const config = addressConfigs[role];
  if (!config) {
    return;
  }

  config.latInput.value = String(lat);
  config.lngInput.value = String(lng);

  if (config.input && !config.input.value.trim()) {
    config.input.value = label;
  }

  if (!homeMap) {
    return;
  }

  if (!config.marker) {
    config.marker = L.marker([lat, lng], {
      draggable: true,
      icon: getAddressIcon(role),
    }).addTo(homeMap);
    config.marker.on("dragend", () => {
      const point = config.marker.getLatLng();
      config.latInput.value = String(point.lat);
      config.lngInput.value = String(point.lng);
      setActiveAddress(role);
      addressStatus.textContent = `Точка для поля "${config.title}" обновлена вручную.`;
      updateAddressRouteLine();
      updateMapViewForAddresses([point.lat, point.lng]);
    });
  } else {
    config.marker.setLatLng([lat, lng]);
  }

  setActiveAddress(role);
  config.marker.bindPopup(`${config.title}: ${label}`).openPopup();
  updateAddressRouteLine();
  updateMapViewForAddresses([lat, lng]);
}

function clearAddressPoint(role, resetInput = true) {
  const config = addressConfigs[role];
  if (!config) {
    return;
  }

  config.latInput.value = "";
  config.lngInput.value = "";
  if (resetInput && config.input) {
    config.input.value = "";
  }
  if (config.marker && homeMap) {
    config.marker.removeFrom(homeMap);
    config.marker = null;
  }
  updateAddressRouteLine();
  hideSuggestions(role);
}

function resetAddressPoints() {
  Object.keys(addressConfigs).forEach((role) => clearAddressPoint(role));
  setActiveAddress("home");
}

function hideSuggestions(role) {
  if (role) {
    const config = addressConfigs[role];
    if (config?.suggestions) {
      config.suggestions.hidden = true;
    }
    return;
  }

  Object.values(addressConfigs).forEach((config) => {
    if (config.suggestions) {
      config.suggestions.hidden = true;
    }
  });
}

function getActiveAddressConfig() {
  return addressConfigs[activeAddressRole] || addressConfigs.home;
}

function setActiveAddress(role) {
  const config = addressConfigs[role];
  if (!config) {
    return;
  }

  activeAddressRole = role;
  document.querySelectorAll("[data-address-field]").forEach((field) => {
    field.classList.toggle("is-active", field.dataset.addressField === role);
  });

  if (mapHelper) {
    mapHelper.textContent = isCitySelected()
      ? `Клик по карте сейчас выбирает ${config.label}.`
      : "Сначала выберите город, затем заполните адреса.";
  }
}

function updateAddressAvailability() {
  const enabled = isCitySelected();

  Object.values(addressConfigs).forEach((config) => {
    if (config.input) {
      config.input.disabled = !enabled;
    }

    if (!enabled) {
      hideSuggestions(config.role);
    }
  });

  if (searchAddressButton) {
    searchAddressButton.disabled = !enabled;
  }

  if (useMapCenterButton) {
    useMapCenterButton.disabled = !enabled;
  }

  setActiveAddress(activeAddressRole);
  addressStatus.textContent = enabled
    ? "Начните вводить адрес дома или школы, затем выберите вариант из списка или точку на карте."
    : "Сначала выберите город, затем заполните адрес дома и адрес школы.";
}

function isCitySelected() {
  return Boolean(citySelect?.value);
}

function handleCityChange() {
  if (homeMap) {
    const nextCenter = getSelectedCityCenter();
    homeMap.setView(nextCenter, getSelectedCityZoom());
  }

  resetAddressPoints();
  updateAddressAvailability();
}

function updateMapViewForAddresses(fallbackLatLng) {
  if (!homeMap) {
    return;
  }

  const markers = Object.values(addressConfigs)
    .map((config) => config.marker)
    .filter(Boolean);

  if (markers.length > 1) {
    const group = L.featureGroup(markers);
    homeMap.fitBounds(group.getBounds().pad(0.24), { maxZoom: 15 });
    return;
  }

  if (fallbackLatLng) {
    homeMap.setView(fallbackLatLng, 16);
  }
}

function updateAddressRouteLine() {
  if (!homeMap) {
    return;
  }

  const homePoint = getAddressLatLng("home");
  const schoolPoint = getAddressLatLng("school");

  if (!homePoint || !schoolPoint) {
    if (routeLine) {
      routeLine.removeFrom(homeMap);
      routeLine = null;
    }
    return;
  }

  const points = [homePoint, schoolPoint];

  if (!routeLine) {
    routeLine = L.polyline(points, {
      color: "#0D5C53",
      weight: 5,
      opacity: 0.86,
      dashArray: "10 8",
      lineCap: "round",
      lineJoin: "round",
    }).addTo(homeMap);
    routeLine.bringToBack();
    return;
  }

  routeLine.setLatLngs(points);
}

function getAddressLatLng(role) {
  const config = addressConfigs[role];
  const lat = Number(config?.latInput?.value);
  const lng = Number(config?.lngInput?.value);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  return [lat, lng];
}

function getAddressIcon(role) {
  if (!addressIcons[role]) {
    const letter = role === "home" ? "Д" : "Ш";
    const className = role === "home" ? "home-pin" : "school-pin";
    addressIcons[role] = L.divIcon({
      className: `address-marker ${className}`,
      html: `<span><b>${letter}</b></span>`,
      iconSize: [36, 36],
      iconAnchor: [18, 36],
      popupAnchor: [0, -34],
    });
  }

  return addressIcons[role];
}

function getSelectedCityCenter() {
  return cityCenters[citySelect?.value] || kazakhstanCenter;
}

function getSelectedCityZoom() {
  return cityCenters[citySelect?.value] ? 12 : 5;
}

function getSearchCity() {
  const selectedCity = citySelect?.value || "";
  return selectedCity && !selectedCity.includes("Другой") ? selectedCity : "Казахстан";
}

function shortAddress(item) {
  const address = item.address || {};
  const road = address.road || address.pedestrian || address.neighbourhood || address.suburb;
  const house = address.house_number;
  const name = item.name && !item.name.match(/^\d+$/) ? item.name : "";

  if (road && house) {
    return `${road}, ${house}`;
  }

  return name || road || item.display_name.split(",").slice(0, 2).join(",");
}

async function submitLeadToGoogleSheets(lead) {
  if (!GOOGLE_SHEETS_WEB_APP_URL) {
    return false;
  }

  try {
    await fetch(GOOGLE_SHEETS_WEB_APP_URL, {
      method: "POST",
      mode: "no-cors",
      headers: {
        "Content-Type": "text/plain;charset=utf-8",
      },
      body: JSON.stringify(lead),
    });
    return true;
  } catch {
    return false;
  }
}

function loadLeads() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function saveLeads(leads) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(leads));
}

function getValue(formData, key) {
  return String(formData.get(key) || "").trim();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function showToast(message) {
  if (!toast) {
    return;
  }

  toast.textContent = message;
  toast.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toast.classList.remove("is-visible");
  }, 2800);
}
