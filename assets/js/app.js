const state = {
  photos: [],
  albums: [],
  lightboxSet: [],
  lightboxIndex: 0,
};

const els = {
  tabs: document.querySelectorAll(".tab"),
  timelineView: document.getElementById("timeline-view"),
  albumsView: document.getElementById("albums-view"),
  albumDetailView: document.getElementById("album-detail-view"),
  emptyState: document.getElementById("empty-state"),
  lightbox: document.getElementById("lightbox"),
  lightboxImg: document.querySelector(".lightbox-img"),
  lightboxDate: document.querySelector(".lightbox-date"),
  lightboxPlace: document.querySelector(".lightbox-place"),
};

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
        img.addEventListener("load", () => img.classList.add("loaded"), { once: true });
        io.unobserve(img);
      }
    },
    { rootMargin: "200px" }
  );
  imgs.forEach((img) => io.observe(img));
}

function renderTimeline() {
  if (state.photos.length === 0) {
    els.timelineView.innerHTML = "";
    return;
  }
  const byYear = new Map();
  for (const p of state.photos) {
    const y = yearOf(p.date);
    if (!byYear.has(y)) byYear.set(y, []);
    byYear.get(y).push(p);
  }
  // state.photos is sorted ascending by date already; render oldest year first
  const years = [...byYear.keys()];

  els.timelineView.innerHTML = years
    .map(
      (year) => `
      <section class="timeline-year">
        <h2 class="timeline-year-label">${year}</h2>
        <div class="photo-grid">
          ${byYear.get(year).map(photoCardHTML).join("")}
        </div>
      </section>`
    )
    .join("");

  mountLazyImages(els.timelineView);
  els.timelineView.querySelectorAll(".photo-card").forEach((card) => {
    card.addEventListener("click", () => {
      const id = card.dataset.id;
      const idx = state.photos.findIndex((p) => p.id === id);
      openLightbox(state.photos, idx);
    });
  });
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
  els.albumsView.querySelectorAll(".album-card").forEach((card) => {
    card.addEventListener("click", () => showAlbumDetail(card.dataset.id));
  });
}

function showAlbumDetail(albumId) {
  const album = state.albums.find((a) => a.id === albumId);
  const photos = state.photos.filter((p) => p.albumId === albumId);
  if (!album) return;

  els.albumDetailView.innerHTML = `
    <div class="album-detail-header">
      <button class="back-button">&larr; Albums</button>
      <h2 class="album-detail-title">${album.name}</h2>
    </div>
    <div class="photo-grid">${photos.map(photoCardHTML).join("")}</div>
  `;
  mountLazyImages(els.albumDetailView);
  els.albumDetailView.querySelector(".back-button").addEventListener("click", () => switchView("albums"));
  els.albumDetailView.querySelectorAll(".photo-card").forEach((card) => {
    card.addEventListener("click", () => {
      const id = card.dataset.id;
      const idx = photos.findIndex((p) => p.id === id);
      openLightbox(photos, idx);
    });
  });

  switchView("album-detail");
}

function switchView(view) {
  [els.timelineView, els.albumsView, els.albumDetailView].forEach((v) => v.classList.remove("active"));
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
    tab.addEventListener("click", () => switchView(tab.dataset.view));
  });

  document.querySelector(".lightbox-close").addEventListener("click", closeLightbox);
  document.querySelector(".lightbox-prev").addEventListener("click", () => stepLightbox(-1));
  document.querySelector(".lightbox-next").addEventListener("click", () => stepLightbox(1));
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
    renderTimeline();
    renderAlbums();
  }
  bindEvents();
}

init();
