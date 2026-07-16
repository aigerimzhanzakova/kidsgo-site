const STORAGE_KEY = "kidsgo_leads_v2";

const form = document.querySelector("#leadForm");
const formMessage = document.querySelector("#formMessage");
const toast = document.querySelector("[data-toast]");
const addressInput = document.querySelector("[data-address-input]");
const addressSuggestions = document.querySelector("[data-address-suggestions]");
const addressStatus = document.querySelector("[data-address-status]");
const searchAddressButton = document.querySelector("[data-search-address]");
const homeLatInput = document.querySelector("[data-home-lat]");
const homeLngInput = document.querySelector("[data-home-lng]");
const mapHelper = document.querySelector("[data-map-helper]");
const useMapCenterButton = document.querySelector("[data-use-map-center]");
const citySelect = document.querySelector('select[name="district"]');

const cityCenters = {
  Алматы: [43.238949, 76.889709],
  Астана: [51.12822, 71.430668],
  Шымкент: [42.341684, 69.590101],
};

let toastTimer;
let addressTimer;
let addressSearchId = 0;
let homeMap;
let homeMarker;
let mapReady = false;

initAddressMap();
bindAddressSearch();

form?.addEventListener("submit", (event) => {
  event.preventDefault();

  if (!form.reportValidity()) {
    return;
  }

  if (mapReady && (!homeLatInput.value || !homeLngInput.value)) {
    formMessage.textContent = "Выберите адрес из подсказок или поставьте точку на карте.";
    addressInput.focus();
    return;
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
    direction: getValue(formData, "direction"),
    startTime: getValue(formData, "startTime"),
    endTime: getValue(formData, "endTime"),
    childrenCount: getValue(formData, "childrenCount"),
    comment: getValue(formData, "comment"),
  };

  const leads = loadLeads();
  leads.unshift(lead);
  saveLeads(leads);

  form.reset();
  form.elements.childrenCount.value = "1";
  form.elements.direction.value = "Туда и обратно";
  clearAddressPoint();
  formMessage.textContent =
    "Спасибо! Заявка принята. Мы свяжемся с вами и уточним детали маршрута.";
  showToast("Заявка отправлена.");
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
    zoom: 12,
    scrollWheelZoom: false,
  });

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap",
  }).addTo(homeMap);

  homeMap.on("click", (event) => {
    setHomePoint(event.latlng.lat, event.latlng.lng, addressInput.value || "Точка выбрана на карте");
    addressStatus.textContent = "Точка выбрана на карте вручную.";
  });

  useMapCenterButton?.addEventListener("click", () => {
    const centerPoint = homeMap.getCenter();
    setHomePoint(centerPoint.lat, centerPoint.lng, addressInput.value || "Точка выбрана на карте");
    addressStatus.textContent = "Выбран центр текущей области карты.";
  });

  citySelect?.addEventListener("change", () => {
    const nextCenter = getSelectedCityCenter();
    homeMap.setView(nextCenter, 12);
  });

  mapReady = true;
}

function bindAddressSearch() {
  if (!addressInput || !addressSuggestions) {
    return;
  }

  addressInput.addEventListener("input", () => {
    clearTimeout(addressTimer);
    clearAddressPoint(false);
    const query = addressInput.value.trim();

    if (query.length < 3) {
      hideSuggestions();
      addressStatus.textContent = "Введите минимум 3 символа для поиска адреса.";
      return;
    }

    addressStatus.textContent = "Ищем подходящие адреса...";
    addressTimer = window.setTimeout(() => searchAddress(query), 420);
  });

  addressInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      runAddressSearch();
    }
  });

  searchAddressButton?.addEventListener("click", runAddressSearch);

  document.addEventListener("click", (event) => {
    if (
      !addressSuggestions.contains(event.target) &&
      event.target !== addressInput &&
      event.target !== searchAddressButton
    ) {
      hideSuggestions();
    }
  });
}

function runAddressSearch() {
  clearTimeout(addressTimer);
  clearAddressPoint(false);
  const query = addressInput.value.trim();

  if (query.length < 3) {
    hideSuggestions();
    addressStatus.textContent = "Введите минимум 3 символа для поиска адреса.";
    addressInput.focus();
    return;
  }

  addressStatus.textContent = "Ищем подходящие адреса на карте...";
  searchAddress(query);
}

async function searchAddress(query) {
  const searchId = ++addressSearchId;
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
    if (searchId !== addressSearchId || query !== addressInput.value.trim()) {
      return;
    }

    renderSuggestions(results);
  } catch {
    if (searchId !== addressSearchId) {
      return;
    }

    hideSuggestions();
    addressStatus.textContent =
      "Не удалось загрузить подсказки. Можно выбрать точку на карте вручную.";
  }
}

function renderSuggestions(results) {
  addressSuggestions.innerHTML = "";

  const mapResults = results.filter((item) => {
    const lat = Number(item.lat);
    const lng = Number(item.lon);
    return Number.isFinite(lat) && Number.isFinite(lng);
  });

  if (!mapResults.length) {
    addressSuggestions.hidden = false;
    addressSuggestions.innerHTML = `
      <div class="suggestion-empty">
        Адрес не найден. Переместите карту и поставьте точку вручную.
      </div>
    `;
    addressStatus.textContent = "Адрес не найден в подсказках.";
    return;
  }

  const firstResult = mapResults[0];
  setHomePoint(Number(firstResult.lat), Number(firstResult.lon), shortAddress(firstResult));

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
      addressInput.value = label;
      setHomePoint(lat, lng, label);
      hideSuggestions();
      addressStatus.textContent = "Адрес выбран из подсказок.";
    });
    addressSuggestions.append(button);
  });

  addressSuggestions.hidden = false;
  addressStatus.textContent =
    "Карта показала первый найденный адрес. Выберите точный вариант из списка или уточните точку вручную.";
}

function setHomePoint(lat, lng, label) {
  homeLatInput.value = String(lat);
  homeLngInput.value = String(lng);

  if (addressInput && !addressInput.value.trim()) {
    addressInput.value = label;
  }

  if (!homeMap) {
    return;
  }

  if (!homeMarker) {
    homeMarker = L.marker([lat, lng], { draggable: true }).addTo(homeMap);
    homeMarker.on("dragend", () => {
      const point = homeMarker.getLatLng();
      homeLatInput.value = String(point.lat);
      homeLngInput.value = String(point.lng);
      addressStatus.textContent = "Точка на карте обновлена вручную.";
    });
  } else {
    homeMarker.setLatLng([lat, lng]);
  }

  homeMarker.bindPopup(label).openPopup();
  homeMap.setView([lat, lng], 16);
}

function clearAddressPoint(resetInput = true) {
  homeLatInput.value = "";
  homeLngInput.value = "";
  if (resetInput && addressInput) {
    addressInput.value = "";
  }
  if (homeMarker && homeMap) {
    homeMarker.removeFrom(homeMap);
    homeMarker = null;
  }
  hideSuggestions();
}

function hideSuggestions() {
  if (!addressSuggestions) {
    return;
  }

  addressSuggestions.hidden = true;
}

function getSelectedCityCenter() {
  return cityCenters[citySelect?.value] || cityCenters["Алматы"];
}

function getSearchCity() {
  const selectedCity = citySelect?.value || "Алматы";
  return selectedCity.includes("Другой") ? "Казахстан" : selectedCity;
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
