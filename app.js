// ============================================================
// 京都文学マップ 表示ロジック
// （データは data.json。サイト上の編集機能は editor.js）
// ============================================================

const REPO = "Takuya00051/ClaudecodeTest2";
const DATA_PATH = "kyoto-literary-map/data.json";

let SPOTS = {};
let WORKS = [];

const map = L.map("map", { zoomControl: false }).setView([35.023, 135.776], 14);
L.control.zoom({ position: "bottomright" }).addTo(map);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
}).addTo(map);

const markerLayer = L.layerGroup().addTo(map);

// ---- 方位表示（地図は常に北が上） ----
const compass = L.control({ position: "topright" });
compass.onAdd = () => {
  const el = L.DomUtil.create("div", "compass");
  el.innerHTML =
    '<svg viewBox="0 0 60 60" width="56" height="56" aria-label="方位: 上が北">' +
    '<circle cx="30" cy="30" r="27" fill="rgba(255,255,255,0.92)" stroke="#c9c2b6"/>' +
    '<polygon points="30,17 34,30 30,28 26,30" fill="#b3261e"/>' +
    '<polygon points="30,43 34,30 30,32 26,30" fill="#9b9488"/>' +
    '<text x="30" y="13.5" text-anchor="middle" font-size="9.5" font-weight="bold" fill="#2b2620">北</text>' +
    '<text x="30" y="53.5" text-anchor="middle" font-size="8.5" fill="#6b6257">南</text>' +
    '<text x="48.5" y="33.5" text-anchor="middle" font-size="8.5" fill="#6b6257">東</text>' +
    '<text x="11.5" y="33.5" text-anchor="middle" font-size="8.5" fill="#6b6257">西</text>' +
    "</svg>";
  return el;
};
compass.addTo(map);

// ---- 現在地表示 ----
let geoWatchId = null;
let geoMarker = null;
let geoCircle = null;
let geoFirstFix = false;

const locateCtl = L.control({ position: "bottomright" });
locateCtl.onAdd = () => {
  const btn = L.DomUtil.create("button", "locate-btn");
  btn.type = "button";
  btn.title = "現在地を表示";
  btn.textContent = "📍";
  L.DomEvent.disableClickPropagation(btn);
  btn.addEventListener("click", () => toggleLocate(btn));
  return btn;
};
locateCtl.addTo(map);

function stopLocate(btn) {
  if (geoWatchId !== null) navigator.geolocation.clearWatch(geoWatchId);
  geoWatchId = null;
  if (geoMarker) { map.removeLayer(geoMarker); geoMarker = null; }
  if (geoCircle) { map.removeLayer(geoCircle); geoCircle = null; }
  btn.classList.remove("active");
}

function toggleLocate(btn) {
  if (geoWatchId !== null) return stopLocate(btn);
  if (!("geolocation" in navigator)) {
    alert("この端末では位置情報を利用できません。");
    return;
  }
  geoFirstFix = true;
  btn.classList.add("active");
  geoWatchId = navigator.geolocation.watchPosition(
    (pos) => {
      const ll = [pos.coords.latitude, pos.coords.longitude];
      if (!geoMarker) {
        geoCircle = L.circle(ll, {
          radius: pos.coords.accuracy,
          color: "#1a73e8", weight: 1, opacity: 0.4,
          fillColor: "#1a73e8", fillOpacity: 0.12,
        }).addTo(map);
        geoMarker = L.circleMarker(ll, {
          radius: 8, color: "#fff", weight: 3,
          fillColor: "#1a73e8", fillOpacity: 1,
        }).addTo(map);
      } else {
        geoMarker.setLatLng(ll);
        geoCircle.setLatLng(ll).setRadius(pos.coords.accuracy);
      }
      if (geoFirstFix) {
        map.setView(ll, Math.max(map.getZoom(), 15));
        geoFirstFix = false;
      }
    },
    (err) => {
      alert("現在地を取得できませんでした（" + err.message + "）");
      stopLocate(btn);
    },
    { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
  );
}

// 公開サイトでは GitHub の最新データを優先して取得する
// （Pages の再ビルドを待たずに編集結果が反映される）。失敗時は同梱の data.json。
async function loadData() {
  const isLocal = ["localhost", "127.0.0.1"].includes(location.hostname);
  if (!isLocal) {
    try {
      const r = await fetch(
        `https://raw.githubusercontent.com/${REPO}/main/${DATA_PATH}?t=${Date.now()}`,
        { cache: "no-store" }
      );
      if (r.ok) return await r.json();
    } catch (e) { /* fall through */ }
  }
  const r = await fetch("data.json", { cache: "no-store" });
  return await r.json();
}

// URL ハッシュ（#yoru-mijika,yojohan）で選択状態を共有できるようにする
function selectedIdsFromHash() {
  const raw = decodeURIComponent(location.hash.replace(/^#/, ""));
  if (!raw) return null;
  const valid = new Set(WORKS.map((w) => w.id));
  const ids = raw.split(",").filter((id) => valid.has(id));
  return ids.length ? ids : null;
}

// ---- サイドバーの作品リスト ----
const workListEl = document.getElementById("work-list");

function buildWorkList(selectedIds) {
  workListEl.innerHTML = "";
  WORKS.forEach((work) => {
    const li = document.createElement("li");
    li.className = "work-item";

    const label = document.createElement("label");

    const dot = document.createElement("span");
    dot.className = "work-color";
    dot.style.background = work.color;

    const meta = document.createElement("span");
    meta.className = "work-meta";
    meta.innerHTML =
      `<span class="work-title"></span><div class="work-author"></div>`;
    meta.querySelector(".work-title").textContent = work.title;
    meta.querySelector(".work-author").textContent =
      `${work.author} ・ ${work.scenes.length}スポット`;

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = work.id;
    checkbox.checked = selectedIds.includes(work.id);
    checkbox.addEventListener("change", render);

    label.append(dot, meta, checkbox);
    li.appendChild(label);
    workListEl.appendChild(li);
  });
}

function selectedWorks() {
  const checked = new Set(
    [...workListEl.querySelectorAll("input:checked")].map((el) => el.value)
  );
  return WORKS.filter((w) => checked.has(w.id));
}

// ---- マーカー描画 ----
function markerIcon(colors) {
  const size = colors.length > 1 ? 26 : 20;
  let background;
  if (colors.length === 1) {
    background = colors[0];
  } else {
    // 複数作品で共有されている場所は、各作品の色を扇形に分けて表示
    const step = 360 / colors.length;
    const segments = colors
      .map((c, i) => `${c} ${i * step}deg ${(i + 1) * step}deg`)
      .join(", ");
    background = `conic-gradient(${segments})`;
  }
  return L.divIcon({
    className: "",
    html: `<span class="spot-marker${colors.length > 1 ? " linked" : ""}" ` +
      `style="width:${size}px;height:${size}px;background:${background}"></span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
  });
}

// ---- スポット写真（Wikimedia Commons の座標検索） ----
// spot に photo（画像URL）があればそれを優先。なければ座標周辺の
// Commons 画像を自動検索する。結果はメモリにキャッシュ。
const photoCache = new Map();

async function fetchSpotPhoto(spotId, spot) {
  if (spot.photo) return { url: spot.photo, pageUrl: spot.photoCredit || null };
  if (photoCache.has(spotId)) return photoCache.get(spotId);
  let result = null;
  try {
    const api =
      "https://commons.wikimedia.org/w/api.php" +
      `?action=query&generator=geosearch&ggscoord=${spot.lat}%7C${spot.lng}` +
      "&ggsradius=300&ggslimit=8&ggsnamespace=6" +
      "&prop=imageinfo&iiprop=url&iiurlwidth=480&format=json&origin=*";
    const r = await fetch(api);
    const j = await r.json();
    const pages = Object.values((j.query && j.query.pages) || {});
    const info = pages
      .map((p) => p.imageinfo && p.imageinfo[0])
      .find((i) => i && /\.(jpe?g|png)(\?|$)/i.test(i.thumburl || ""));
    if (info) result = { url: info.thumburl, pageUrl: info.descriptionurl };
  } catch (e) { /* オフライン等は写真なしで続行 */ }
  photoCache.set(spotId, result);
  return result;
}

function attachPhoto(marker, spotId, spot, contentEl) {
  marker.on("popupopen", async (e) => {
    const holder = contentEl.querySelector(".popup-photo");
    if (!holder || holder.dataset.loaded) return;
    const photo = await fetchSpotPhoto(spotId, spot);
    holder.dataset.loaded = "1";
    if (!photo) { holder.remove(); e.popup.update(); return; }
    const img = document.createElement("img");
    img.src = photo.url;
    img.alt = spot.name;
    img.addEventListener("load", () => e.popup.update());
    holder.appendChild(img);
    if (photo.pageUrl) {
      const credit = document.createElement("a");
      credit.className = "popup-photo-credit";
      credit.href = photo.pageUrl;
      credit.target = "_blank";
      credit.rel = "noopener";
      credit.textContent = "© Wikimedia Commons";
      holder.appendChild(credit);
    }
    e.popup.update();
  });
}

function popupHtml(spot, entries) {
  const el = document.createElement("div");
  el.className = "popup";

  const photoHolder = document.createElement("div");
  photoHolder.className = "popup-photo";
  el.appendChild(photoHolder);

  const name = document.createElement("p");
  name.className = "popup-spot-name";
  name.textContent = spot.name;
  el.appendChild(name);

  if (spot.note) {
    const note = document.createElement("p");
    note.className = "popup-spot-note";
    note.textContent = spot.note;
    el.appendChild(note);
  }

  entries.forEach(({ work, scene }) => {
    const block = document.createElement("div");
    block.className = "popup-work";
    block.style.borderLeftColor = work.color;

    const title = document.createElement("p");
    title.className = "popup-work-title";
    title.style.color = work.color;
    title.textContent = `『${work.title}』${work.author}`;

    const text = document.createElement("p");
    text.className = "popup-work-text";
    text.textContent = scene.text;

    block.append(title, text);

    if (scene.quote) {
      const quote = document.createElement("blockquote");
      quote.className = "popup-quote";
      quote.textContent = scene.quote;
      block.appendChild(quote);
    }
    el.appendChild(block);
  });

  return el;
}

function render() {
  markerLayer.clearLayers();
  const works = selectedWorks();

  // 選択状態を URL ハッシュへ反映（ブックマーク・共有用）
  history.replaceState(null, "", works.length
    ? `#${works.map((w) => w.id).join(",")}`
    : location.pathname + location.search);

  // 選択中の作品のシーンを場所ごとにまとめる
  const bySpot = new Map();
  works.forEach((work) => {
    work.scenes.forEach((scene) => {
      const spot = SPOTS[scene.spot];
      if (!spot) {
        console.warn(`data.json: 場所ID "${scene.spot}" が spots にありません（${work.title}）`);
        return;
      }
      if (!bySpot.has(scene.spot)) bySpot.set(scene.spot, []);
      bySpot.get(scene.spot).push({ work, scene });
    });
  });

  const latLngs = [];
  bySpot.forEach((entries, spotId) => {
    const spot = SPOTS[spotId];
    const colors = entries.map((e) => e.work.color);
    const marker = L.marker([spot.lat, spot.lng], { icon: markerIcon(colors) });
    const content = popupHtml(spot, entries);
    marker.bindPopup(content, {
      maxWidth: 320,
      autoPanPadding: L.point(40, 40),
    });
    attachPhoto(marker, spotId, spot, content);
    marker.addTo(markerLayer);
    latLngs.push([spot.lat, spot.lng]);
  });

  if (latLngs.length) {
    map.fitBounds(L.latLngBounds(latLngs).pad(0.2), { maxZoom: 15 });
  }
}

// ---- モバイル用サイドバー開閉 ----
const sidebar = document.getElementById("sidebar");
document.getElementById("sidebar-toggle").addEventListener("click", () => {
  sidebar.classList.toggle("open");
});
map.on("click", () => sidebar.classList.remove("open"));

// ---- 起動 ----
const appReady = loadData().then((data) => {
  SPOTS = data.spots;
  WORKS = data.works;
  buildWorkList(selectedIdsFromHash() ?? [WORKS[0]?.id].filter(Boolean));
  render();
});
