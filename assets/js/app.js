const state = {
  photos: [],
  albums: [],
  currentAlbumPhotos: [],
  lightboxSet: [],
  lightboxIndex: 0,
};

const els = {
  tabs: document.querySelectorAll(".tab"),
  homeView: document.getElementById("home-view"),
  timelineView: document.getElementById("timeline-view"),
  albumsView: document.getElementById("albums-view"),
  albumDetailView: document.getElementById("album-detail-view"),
  mapView: document.getElementById("map-view"),
  emptyState: document.getElementById("empty-state"),
  statsStrip: document.getElementById("stats-strip"),
  onThisDay: document.getElementById("on-this-day"),
  lightbox: document.getElementById("lightbox"),
  lightboxImg: document.querySelector(".lightbox-img"),
  lightboxDate: document.querySelector(".lightbox-date"),
  lightboxPlace: document.querySelector(".lightbox-place"),
};

let leafletMap = null;
let timelineChunks = [];
let timelineChunkIndex = 0;
let timelineObserver = null;
const rendered = { timeline: false, albums: false };

const MONTHS_VI = [
  "Tháng 1", "Tháng 2", "Tháng 3", "Tháng 4", "Tháng 5", "Tháng 6",
  "Tháng 7", "Tháng 8", "Tháng 9", "Tháng 10", "Tháng 11", "Tháng 12",
];

function formatDate(iso) {
  if (!iso) return "Không rõ ngày";
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS_VI[d.getMonth()]}, ${d.getFullYear()}`;
}

function yearOf(iso) {
  return iso ? new Date(iso).getFullYear().toString() : "Không rõ năm";
}

async function loadData() {
  try {
    const res = await fetch("data/photos.json");
    if (!res.ok) throw new Error("no data");
    const data = await res.json();
    state.photos = data.photos || [];
    state.albums = data.albums || [];
  } catch {
    state.photos = [];
    state.albums = [];
  }
}

function photoCardHTML(photo) {
  return `
    <div class="photo-card" data-id="${photo.id}">
      <img data-src="${photo.thumb}" alt="${photo.place || ""}" loading="lazy" />
      <div class="photo-card-meta">
        <span class="date">${formatDate(photo.date)}</span>
        ${photo.place ? `<span class="place">${photo.place}</span>` : ""}
      </div>
    </div>`;
}

function mountLazyImages(container) {
  const imgs = container.querySelectorAll("img[data-src]");
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const img = entry.target;
        img.src = img.dataset.src;
        delete img.dataset.src; // keeps repeated mountLazyImages() scans on a growing container cheap
        img.addEventListener("load", () => img.classList.add("loaded"), { once: true });
        io.unobserve(img);
      }
    },
    { rootMargin: "200px" }
  );
  imgs.forEach((img) => io.observe(img));
}

function monthOf(iso) {
  return iso ? new Date(iso).getMonth() : -1;
}

// Flattens photos into ordered {year, month, photos} groups — one group per
// batch the infinite-scroll renderer below appends at a time.
function buildTimelineChunks() {
  const byYear = new Map();
  for (const p of state.photos) {
    const y = yearOf(p.date);
    if (!byYear.has(y)) byYear.set(y, new Map());
    const months = byYear.get(y);
    const m = monthOf(p.date);
    if (!months.has(m)) months.set(m, []);
    months.get(m).push(p);
  }
  // state.photos is sorted ascending by date already; chunks come out oldest-first
  const chunks = [];
  for (const [year, months] of byYear) {
    const monthKeys = [...months.keys()].sort((a, b) => a - b);
    for (const m of monthKeys) {
      chunks.push({ year, month: m, photos: months.get(m) });
    }
  }
  return chunks;
}

const TIMELINE_BATCH = 3;

function renderTimelineBatch() {
  const el = els.timelineView;
  let sentinel = el.querySelector(".timeline-sentinel");
  if (!sentinel) {
    el.innerHTML = "";
    sentinel = document.createElement("div");
    sentinel.className = "timeline-sentinel";
    el.appendChild(sentinel);
    el._lastYear = null;
    el._openYearEl = null;
  }

  const batch = timelineChunks.slice(timelineChunkIndex, timelineChunkIndex + TIMELINE_BATCH);
  timelineChunkIndex += batch.length;

  for (const chunk of batch) {
    if (chunk.year !== el._lastYear) {
      const yearSection = document.createElement("section");
      yearSection.className = "timeline-year";
      yearSection.innerHTML = `<h2 class="timeline-year-label">${chunk.year}</h2>`;
      el.insertBefore(yearSection, sentinel);
      el._openYearEl = yearSection;
      el._lastYear = chunk.year;
    }
    const monthDiv = document.createElement("div");
    monthDiv.className = "timeline-month";
    monthDiv.innerHTML = `
      <h3 class="timeline-month-label">${chunk.month === -1 ? "Không rõ tháng" : MONTHS_VI[chunk.month]}</h3>
      <div class="photo-grid">${chunk.photos.map(photoCardHTML).join("")}</div>
    `;
    el._openYearEl.appendChild(monthDiv);
    mountLazyImages(monthDiv);
  }

  if (timelineChunkIndex >= timelineChunks.length) {
    sentinel.remove();
    if (timelineObserver) {
      timelineObserver.disconnect();
      timelineObserver = null;
    }
  }
}

// Renders the first batch immediately, then appends more batches as the
// user scrolls near the bottom — avoids building thousands of DOM nodes
// up front for a lifetime's worth of photos.
function renderTimeline() {
  timelineChunks = buildTimelineChunks();
  timelineChunkIndex = 0;
  if (timelineChunks.length === 0) {
    els.timelineView.innerHTML = "";
    return;
  }

  renderTimelineBatch();

  const sentinel = els.timelineView.querySelector(".timeline-sentinel");
  if (sentinel) {
    timelineObserver = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) renderTimelineBatch();
      },
      { rootMargin: "600px" }
    );
    timelineObserver.observe(sentinel);
  }
}

function renderStats() {
  const photos = state.photos;
  const values = {
    photos: photos.length,
    albums: state.albums.length,
    places: new Set(photos.map((p) => p.place).filter(Boolean)).size,
    years: new Set(photos.map((p) => yearOf(p.date)).filter((y) => y !== "Không rõ năm")).size,
  };
  document.querySelectorAll("[data-stat]").forEach((el) => {
    el.textContent = values[el.dataset.stat] ?? 0;
  });
  els.statsStrip.classList.remove("hidden");
}

// Day-of-year on a fixed non-leap reference year, so month/day pairs from
// any two dates can be compared regardless of which year they actually fell in.
function dayOfYear(month, day) {
  return Math.round((Date.UTC(2001, month, day) - Date.UTC(2001, 0, 1)) / 86400000);
}

function circularDayDistance(a, b) {
  const diff = Math.abs(a - b);
  return Math.min(diff, 365 - diff);
}

// Always finds *something* to show: an exact "same day, past year" match if
// one exists, otherwise whichever past-year photo's month/day sits closest
// to today (wrapping around the year boundary) — so the home tab never comes
// up empty just because nothing happened on this exact date historically.
function renderOnThisDay() {
  const today = new Date();
  const todayDoy = dayOfYear(today.getMonth(), today.getDate());

  const pastPhotos = state.photos.filter((p) => p.date && new Date(p.date).getFullYear() < today.getFullYear());
  if (pastPhotos.length === 0) {
    els.onThisDay.classList.add("hidden");
    return;
  }

  let minDist = Infinity;
  for (const p of pastPhotos) {
    const d = new Date(p.date);
    const dist = circularDayDistance(dayOfYear(d.getMonth(), d.getDate()), todayDoy);
    if (dist < minDist) minDist = dist;
  }
  const matches = pastPhotos.filter((p) => {
    const d = new Date(p.date);
    return circularDayDistance(dayOfYear(d.getMonth(), d.getDate()), todayDoy) === minDist;
  });

  els.onThisDay.querySelector(".on-this-day-label").textContent =
    minDist === 0 ? "Hôm nay năm xưa" : "Kỷ niệm gần đây";

  const scroller = els.onThisDay.querySelector(".on-this-day-scroller");
  scroller.innerHTML = matches
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .map((p) => {
      const badge =
        minDist === 0 ? `${today.getFullYear() - new Date(p.date).getFullYear()} năm trước` : formatDate(p.date);
      return `
      <div class="on-this-day-card" data-id="${p.id}">
        <img data-src="${p.thumb}" alt="${p.place || ""}" loading="lazy" />
        <span class="on-this-day-years">${badge}</span>
      </div>`;
    })
    .join("");
  mountLazyImages(scroller);
  els.onThisDay.classList.remove("hidden");
}

function ensureMap() {
  if (leafletMap || typeof L === "undefined") return;
  const withCoord = state.photos.filter((p) => p.coord);
  const container = document.getElementById("memories-map");

  if (withCoord.length === 0) {
    container.outerHTML = `<p class="map-empty-hint">Chưa có ảnh nào có dữ liệu vị trí GPS.</p>`;
    return;
  }

  leafletMap = L.map("memories-map", { scrollWheelZoom: false });
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors",
    maxZoom: 18,
  }).addTo(leafletMap);

  const byCoord = new Map();
  for (const p of withCoord) {
    const key = p.coord.join(",");
    if (!byCoord.has(key)) byCoord.set(key, []);
    byCoord.get(key).push(p);
  }

  const bounds = [];
  for (const [key, photos] of byCoord) {
    const [lat, lon] = key.split(",").map(Number);
    bounds.push([lat, lon]);
    const marker = L.circleMarker([lat, lon], {
      radius: 8,
      color: "#c9a24b",
      fillColor: "#c9a24b",
      fillOpacity: 0.85,
      weight: 2,
    }).addTo(leafletMap);
    const place = photos[0].place || "Không rõ địa danh";
    marker.bindPopup(
      `<div class="map-popup"><strong>${place}</strong><p>${photos.length} ảnh</p><button class="map-popup-btn" type="button">Xem ảnh</button></div>`
    );
    marker.on("popupopen", (e) => {
      const btn = e.popup.getElement().querySelector(".map-popup-btn");
      btn.addEventListener("click", () => openLightbox(photos, 0));
    });
  }
  leafletMap.fitBounds(bounds, { padding: [30, 30] });
}

function albumCardHTML(album) {
  const range =
    album.dateStart && album.dateEnd
      ? album.dateStart === album.dateEnd
        ? formatDate(album.dateStart)
        : `${formatDate(album.dateStart)} — ${formatDate(album.dateEnd)}`
      : "Không rõ ngày";
  return `
    <div class="album-card" data-id="${album.id}">
      ${album.cover ? `<img class="cover" data-src="${album.cover}" alt="${album.name}" loading="lazy" />` : `<div class="cover"></div>`}
      <div class="album-card-body">
        <h3 class="album-card-title">${album.name}</h3>
        <p class="album-card-meta">${album.count} ảnh &middot; ${range}</p>
      </div>
    </div>`;
}

function renderAlbums() {
  if (state.albums.length === 0) {
    els.albumsView.innerHTML = "";
    return;
  }
  els.albumsView.innerHTML = `<div class="album-grid">${state.albums.map(albumCardHTML).join("")}</div>`;
  mountLazyImages(els.albumsView);
}

function showAlbumDetail(albumId) {
  const album = state.albums.find((a) => a.id === albumId);
  state.currentAlbumPhotos = state.photos.filter((p) => p.albumId === albumId);
  if (!album) return;

  els.albumDetailView.innerHTML = `
    <div class="album-detail-header">
      <button class="back-button">&larr; Albums</button>
      <h2 class="album-detail-title">${album.name}</h2>
    </div>
    <div class="photo-grid">${state.currentAlbumPhotos.map(photoCardHTML).join("")}</div>
  `;
  mountLazyImages(els.albumDetailView);
  switchView("album-detail");
}

function switchView(view) {
  [els.homeView, els.timelineView, els.albumsView, els.albumDetailView, els.mapView].forEach((v) =>
    v.classList.remove("active")
  );
  document.getElementById(`${view}-view`).classList.add("active");
  els.tabs.forEach((tab) => {
    const isMatch = tab.dataset.view === view;
    tab.classList.toggle("active", isMatch);
    tab.setAttribute("aria-selected", isMatch ? "true" : "false");
  });
}

function openLightbox(photos, index) {
  state.lightboxSet = photos;
  state.lightboxIndex = index;
  renderLightbox();
  els.lightbox.classList.remove("hidden");
}

function renderLightbox() {
  const photo = state.lightboxSet[state.lightboxIndex];
  if (!photo) return;
  els.lightboxImg.src = photo.full;
  els.lightboxImg.alt = photo.place || "";
  els.lightboxDate.textContent = formatDate(photo.date);
  els.lightboxPlace.textContent = photo.place || "";
}

function closeLightbox() {
  els.lightbox.classList.add("hidden");
  els.lightboxImg.src = "";
}

function stepLightbox(delta) {
  const len = state.lightboxSet.length;
  state.lightboxIndex = (state.lightboxIndex + delta + len) % len;
  renderLightbox();
}

function bindEvents() {
  els.tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const view = tab.dataset.view;
      switchView(view);
      // Each tab's content is only built the first time it's opened, so
      // opening the app never has to render more than the home tab.
      if (view === "timeline" && !rendered.timeline) {
        rendered.timeline = true;
        renderTimeline();
      } else if (view === "albums" && !rendered.albums) {
        rendered.albums = true;
        renderAlbums();
      } else if (view === "map") {
        ensureMap();
        setTimeout(() => leafletMap && leafletMap.invalidateSize(), 50);
      }
    });
  });

  // Delegated listeners: the grids inside these containers get replaced
  // wholesale on every render, but the containers themselves never do, so
  // binding here once avoids ever needing to re-attach per-card listeners.
  els.timelineView.addEventListener("click", (e) => {
    const card = e.target.closest(".photo-card");
    if (!card) return;
    const idx = state.photos.findIndex((p) => p.id === card.dataset.id);
    if (idx > -1) openLightbox(state.photos, idx);
  });

  els.onThisDay.addEventListener("click", (e) => {
    const card = e.target.closest(".on-this-day-card");
    if (!card) return;
    const idx = state.photos.findIndex((p) => p.id === card.dataset.id);
    if (idx > -1) openLightbox(state.photos, idx);
  });

  els.albumsView.addEventListener("click", (e) => {
    const card = e.target.closest(".album-card");
    if (!card) return;
    showAlbumDetail(card.dataset.id);
  });

  els.albumDetailView.addEventListener("click", (e) => {
    if (e.target.closest(".back-button")) {
      switchView("albums");
      return;
    }
    const card = e.target.closest(".photo-card");
    if (!card) return;
    const idx = state.currentAlbumPhotos.findIndex((p) => p.id === card.dataset.id);
    if (idx > -1) openLightbox(state.currentAlbumPhotos, idx);
  });

  document.querySelector(".lightbox-close").addEventListener("click", closeLightbox);
  document.querySelector(".lightbox-prev").addEventListener("click", () => stepLightbox(-1));
  document.querySelector(".lightbox-next").addEventListener("click", () => stepLightbox(1));

  // Tap the left/right half of the photo itself to go prev/next — handy on
  // mobile where the edge arrow buttons are small and easy to miss.
  els.lightboxImg.addEventListener("click", (e) => {
    const rect = els.lightboxImg.getBoundingClientRect();
    const isLeftHalf = e.clientX - rect.left < rect.width / 2;
    stepLightbox(isLeftHalf ? -1 : 1);
  });
  els.lightbox.addEventListener("click", (e) => {
    if (e.target === els.lightbox) closeLightbox();
  });
  document.addEventListener("keydown", (e) => {
    if (els.lightbox.classList.contains("hidden")) return;
    if (e.key === "Escape") closeLightbox();
    if (e.key === "ArrowLeft") stepLightbox(-1);
    if (e.key === "ArrowRight") stepLightbox(1);
  });

  let touchStartX = 0;
  els.lightbox.addEventListener(
    "touchstart",
    (e) => {
      touchStartX = e.changedTouches[0].clientX;
    },
    { passive: true }
  );
  els.lightbox.addEventListener(
    "touchend",
    (e) => {
      const deltaX = e.changedTouches[0].clientX - touchStartX;
      if (Math.abs(deltaX) < 50) return;
      stepLightbox(deltaX > 0 ? -1 : 1);
    },
    { passive: true }
  );
}

async function init() {
  await loadData();
  if (state.photos.length === 0) {
    els.emptyState.classList.remove("hidden");
  } else {
    // Only the landing tab ("Kỷ niệm") is built up front — Timeline/Albums/Map
    // render lazily the first time their tab is opened (see bindEvents).
    renderStats();
    renderOnThisDay();
  }
  bindEvents();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
}

init();
