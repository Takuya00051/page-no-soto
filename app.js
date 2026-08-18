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
const searchEl = document.getElementById("work-search");
const sortEl = document.getElementById("work-sort-key");

// GitHub トークンが設定されているブラウザ＝サイトのオーナーとみなし、
// 下書き（draft: true）の作品はオーナーにだけ表示する
const OWNER_TOKEN_KEY = "kyoto-map-github-token";
const isOwner = () => !!localStorage.getItem(OWNER_TOKEN_KEY);

// チェック状態はリスト再構築（検索・並べ替え）をまたいで保持する
const selectedWorkIds = new Set();

function visibleWorksSorted() {
  const q = searchEl.value.trim().toLowerCase();
  let list = WORKS.filter((w) => !w.draft || isOwner());
  if (q) {
    list = list.filter(
      (w) => w.title.toLowerCase().includes(q) || w.author.toLowerCase().includes(q)
    );
  }
  const key = sortEl.value;
  if (key === "author") {
    list = [...list].sort((a, b) => a.author.localeCompare(b.author, "ja"));
  } else if (key === "title") {
    list = [...list].sort((a, b) => a.title.localeCompare(b.title, "ja"));
  } else if (key === "year") {
    list = [...list].sort((a, b) => (a.year ?? 9999) - (b.year ?? 9999));
  }
  return list;
}

function buildWorkList(selectedIds) {
  if (selectedIds) {
    selectedWorkIds.clear();
    selectedIds.forEach((id) => selectedWorkIds.add(id));
  }

  workListEl.innerHTML = "";
  const list = visibleWorksSorted();

  if (!list.length) {
    const empty = document.createElement("li");
    empty.className = "work-empty";
    empty.textContent = "該当する作品がありません。";
    workListEl.appendChild(empty);
    return;
  }

  list.forEach((work) => {
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
    if (work.draft) {
      const badge = document.createElement("span");
      badge.className = "draft-badge";
      badge.textContent = "下書き";
      meta.querySelector(".work-title").appendChild(badge);
    }
    const authorLine = [work.author, work.year ? `${work.year}年` : null, `${work.scenes.length}スポット`]
      .filter(Boolean)
      .join(" ・ ");
    meta.querySelector(".work-author").textContent = authorLine;

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = work.id;
    checkbox.checked = selectedWorkIds.has(work.id);
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) selectedWorkIds.add(work.id);
      else selectedWorkIds.delete(work.id);
      render();
    });

    const infoBtn = document.createElement("button");
    infoBtn.type = "button";
    infoBtn.className = "work-info-btn";
    infoBtn.title = "作品の詳細を見る";
    infoBtn.textContent = "ⓘ";
    infoBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      openWorkDetail(work);
    });

    // ⓘ ボタンをチェックボックスから離して誤タップを防ぐため、
    // 色ドットのすぐ右（本文の左）に置く
    label.append(dot, infoBtn, meta, checkbox);
    li.appendChild(label);
    workListEl.appendChild(li);
  });
}

searchEl.addEventListener("input", () => buildWorkList());
sortEl.addEventListener("change", () => buildWorkList());

function selectedWorks() {
  return WORKS.filter((w) => selectedWorkIds.has(w.id));
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

function popupHtml(spotId, spot, entries) {
  const el = document.createElement("div");
  el.className = "popup";

  const photoHolder = document.createElement("div");
  photoHolder.className = "popup-photo";
  el.appendChild(photoHolder);

  const visitBtn = document.createElement("button");
  visitBtn.type = "button";
  visitBtn.className = "visited-toggle";
  const setVisitLabel = () => {
    const done = myLog.visited.has(spotId);
    visitBtn.textContent = done ? "📍 行った" : "📍 行った にする";
    visitBtn.classList.toggle("done", done);
  };
  setVisitLabel();
  visitBtn.addEventListener("click", () => {
    toggleVisited(spotId);
    setVisitLabel();
  });
  el.appendChild(visitBtn);

  if (spot.kana) {
    const kana = document.createElement("p");
    kana.className = "popup-spot-kana";
    kana.textContent = spot.kana;
    el.appendChild(kana);
  }

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

  const gmapLink = document.createElement("a");
  gmapLink.className = "popup-gmap-link";
  gmapLink.href = `https://www.google.com/maps/search/?api=1&query=${spot.lat},${spot.lng}`;
  gmapLink.target = "_blank";
  gmapLink.rel = "noopener";
  gmapLink.textContent = "Googleマップで開く";
  el.appendChild(gmapLink);

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

let didInitialFit = false;
const markersBySpot = new Map();

function render() {
  // 開いているポップアップを覚えておき、再描画後に開き直す
  let openSpotId = null;
  markersBySpot.forEach((m, id) => { if (m.isPopupOpen()) openSpotId = id; });

  markerLayer.clearLayers();
  markersBySpot.clear();
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
    const content = popupHtml(spotId, spot, entries);
    marker.bindPopup(content, {
      maxWidth: 320,
      // map.getSize() はタブが未描画のタイミングで 0 を返すことがあるため、
      // ウィンドウの高さから安全に計算する
      maxHeight: Math.max(200, Math.round(window.innerHeight * 0.6)),
      autoPanPadding: L.point(40, 40),
    });
    attachPhoto(marker, spotId, spot, content);
    marker.addTo(markerLayer);
    markersBySpot.set(spotId, marker);
    latLngs.push([spot.lat, spot.lng]);
  });

  // 地図の全体移動は初回表示のときだけ。以降はユーザーの視点を保つ
  if (latLngs.length && !didInitialFit) {
    map.fitBounds(L.latLngBounds(latLngs).pad(0.2), { maxZoom: 15, animate: false });
    didInitialFit = true;
  }

  // 開いていたポップアップを復元（同じ場所が残っていれば）
  if (openSpotId && markersBySpot.has(openSpotId)) {
    markersBySpot.get(openSpotId).openPopup();
  }
}

// ---- 個人の読書記録・訪問記録（このブラウザだけに保存） ----
const MY_LOG_KEY = "kyoto-map-my-log";

function loadMyLog() {
  try {
    const raw = JSON.parse(localStorage.getItem(MY_LOG_KEY) || "{}");
    return { read: new Set(raw.read || []), visited: new Set(raw.visited || []) };
  } catch (e) {
    return { read: new Set(), visited: new Set() };
  }
}

const myLog = loadMyLog();

function saveMyLog() {
  localStorage.setItem(
    MY_LOG_KEY,
    JSON.stringify({ read: [...myLog.read], visited: [...myLog.visited] })
  );
}

function toggleRead(workId) {
  if (myLog.read.has(workId)) myLog.read.delete(workId);
  else myLog.read.add(workId);
  saveMyLog();
}

function toggleVisited(spotId) {
  if (myLog.visited.has(spotId)) myLog.visited.delete(spotId);
  else myLog.visited.add(spotId);
  saveMyLog();
}

function renderMyLogPanel() {
  const readCount = myLog.read.size;
  const visitedCount = myLog.visited.size;
  const byRegion = new Map();
  myLog.visited.forEach((spotId) => {
    const region = (SPOTS[spotId] && SPOTS[spotId].region) || "その他";
    byRegion.set(region, (byRegion.get(region) || 0) + 1);
  });
  const regionLine = [...byRegion.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([region, count]) => `${region} ${count}ヶ所`)
    .join("｜");

  return `
    <p class="mylog-summary">読んだ ${readCount}作品｜訪問 ${visitedCount}ヶ所</p>
    <p class="mylog-regions">${regionLine || "まだ訪問記録がありません"}</p>
    <p class="ed-hint">記録はこのブラウザだけに保存されます（他の人には見えません）。ⓘ詳細画面の「📖 読んだ」、地図ピンの「📍 行った」で記録できます。</p>
  `;
}

const myLogPanel = document.createElement("div");
myLogPanel.id = "my-log-panel";
myLogPanel.hidden = true;
myLogPanel.innerHTML = `
  <div class="work-detail-backdrop"></div>
  <div class="work-detail-card">
    <button class="work-detail-close" title="閉じる" aria-label="閉じる">×</button>
    <h2 class="mylog-title">わたしの記録</h2>
    <div class="mylog-body"></div>
  </div>
`;
document.body.appendChild(myLogPanel);
myLogPanel.querySelector(".work-detail-close").addEventListener("click", () => { myLogPanel.hidden = true; });
myLogPanel.querySelector(".work-detail-backdrop").addEventListener("click", () => { myLogPanel.hidden = true; });

document.getElementById("my-log-toggle").addEventListener("click", () => {
  myLogPanel.querySelector(".mylog-body").innerHTML = renderMyLogPanel();
  myLogPanel.hidden = false;
});

// ---- 作品の詳細（表紙・あらすじ） ----
// work.cover / work.synopsis が手入力されていればそれを優先。
// なければ Google Books API でベストエフォート取得を試みる（失敗しても致命的ではない）。
const bookInfoCache = new Map();

async function fetchBookInfo(work) {
  if (bookInfoCache.has(work.id)) return bookInfoCache.get(work.id);
  let result = null;
  try {
    const q = `intitle:${encodeURIComponent(work.title)}+inauthor:${encodeURIComponent(work.author)}`;
    const r = await fetch(`https://www.googleapis.com/books/v1/volumes?q=${q}&country=JP&maxResults=1`);
    const j = await r.json();
    const info = j.items && j.items[0] && j.items[0].volumeInfo;
    if (info) {
      result = {
        cover: info.imageLinks && (info.imageLinks.thumbnail || info.imageLinks.smallThumbnail),
        description: info.description,
        infoLink: info.infoLink,
      };
    }
  } catch (e) { /* オフライン・APIエラー時は取得なしで続行 */ }
  bookInfoCache.set(work.id, result);
  return result;
}

const detailEl = document.createElement("div");
detailEl.id = "work-detail";
detailEl.hidden = true;
detailEl.innerHTML = `
  <div class="work-detail-backdrop"></div>
  <div class="work-detail-card">
    <button class="work-detail-close" title="閉じる" aria-label="閉じる">×</button>
    <div class="work-detail-body"></div>
  </div>
`;
document.body.appendChild(detailEl);

function closeWorkDetail() {
  detailEl.hidden = true;
}
detailEl.querySelector(".work-detail-close").addEventListener("click", closeWorkDetail);
detailEl.querySelector(".work-detail-backdrop").addEventListener("click", closeWorkDetail);

async function openWorkDetail(work) {
  const body = detailEl.querySelector(".work-detail-body");
  detailEl.hidden = false;

  const metaLine = [work.author, work.year ? `${work.year}年` : null].filter(Boolean).join(" ・ ");
  const sceneButtons = work.scenes
    .map((scene) => {
      const spot = SPOTS[scene.spot];
      return spot
        ? `<button type="button" class="detail-scene-btn" data-spot="${scene.spot}">${spot.name}</button>`
        : "";
    })
    .join("");

  body.innerHTML = `
    <div class="detail-cover-holder">
      <div class="detail-cover-loading">表紙を探しています…</div>
    </div>
    <p class="detail-work-title">${work.title}</p>
    <p class="detail-work-meta">${metaLine}</p>
    <button type="button" class="read-toggle"></button>
    <div class="detail-synopsis">${work.synopsis ? "" : "あらすじを取得しています…"}</div>
    <div class="detail-scenes"><h3>登場する場所</h3><div class="detail-scene-list">${sceneButtons}</div></div>
    <button type="button" class="detail-edit-btn">この作品を編集する</button>
  `;

  const readBtn = body.querySelector(".read-toggle");
  const setReadLabel = () => {
    const done = myLog.read.has(work.id);
    readBtn.textContent = done ? "📖 読んだ" : "📖 読んだ にする";
    readBtn.classList.toggle("done", done);
  };
  setReadLabel();
  readBtn.addEventListener("click", () => {
    toggleRead(work.id);
    setReadLabel();
  });

  body.querySelectorAll(".detail-scene-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      closeWorkDetail();
      selectedWorkIds.add(work.id);
      buildWorkList();
      render();
      focusSpot(btn.dataset.spot);
    });
  });
  body.querySelector(".detail-edit-btn").addEventListener("click", () => {
    closeWorkDetail();
    if (window.openEditorForWork) window.openEditorForWork(work.id);
  });

  // 表紙: 手入力があれば即表示、なければ自動取得を試みる
  const coverHolder = body.querySelector(".detail-cover-holder");
  if (work.cover) {
    coverHolder.innerHTML = `<img src="${work.cover}" alt="${work.title}">`;
  } else {
    const info = await fetchBookInfo(work);
    if (detailEl.hidden) return; // 取得中に閉じられていたら何もしない
    if (info && info.cover) {
      coverHolder.innerHTML = `<img src="${info.cover}" alt="${work.title}">`;
    } else {
      coverHolder.innerHTML = `<div class="detail-cover-none">表紙画像は見つかりませんでした</div>`;
    }
  }

  // あらすじ: 手入力があればそれを表示、なければ自動取得（Google Books のAPI経由の紹介文）
  const synEl = body.querySelector(".detail-synopsis");
  if (work.synopsis) {
    synEl.textContent = work.synopsis;
  } else {
    const info = await fetchBookInfo(work);
    if (detailEl.hidden) return;
    if (info && info.description) {
      synEl.textContent = info.description;
      if (info.infoLink) {
        const link = document.createElement("a");
        link.href = info.infoLink;
        link.target = "_blank";
        link.rel = "noopener";
        link.className = "detail-source-link";
        link.textContent = "Google Books で見る";
        synEl.after(link);
      }
    } else {
      synEl.textContent = "あらすじは見つかりませんでした。編集画面から手入力できます。";
    }
  }
}

// 指定したスポットへ地図を移動してポップアップを開く
// 初回表示の fitBounds アニメーションと競合すると位置がずれるため、
// このジャンプ系の移動は常に animate:false（瞬間移動）にする。
function focusSpot(spotId) {
  const spot = SPOTS[spotId];
  if (!spot) return;
  const zoom = Math.max(Number.isFinite(map.getZoom()) ? map.getZoom() : 14, 16);
  map.setView([spot.lat, spot.lng], zoom, { animate: false });
  const marker = markersBySpot.get(spotId);
  if (marker) marker.openPopup();
  sidebar.classList.remove("open");
}

// ---- 場所で検索 ----
const spotSearchEl = document.getElementById("spot-search");
const spotResultsEl = document.getElementById("spot-search-results");

function matchingSpots(q) {
  const needle = q.trim().toLowerCase();
  if (!needle) return [];
  return Object.entries(SPOTS)
    .filter(([, s]) => s.name.toLowerCase().includes(needle) || (s.kana || "").includes(needle))
    .slice(0, 8);
}

spotSearchEl.addEventListener("input", () => {
  const matches = matchingSpots(spotSearchEl.value);
  spotResultsEl.innerHTML = "";
  if (!matches.length) { spotResultsEl.hidden = true; return; }
  matches.forEach(([id, spot]) => {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = spot.name;
    btn.addEventListener("click", () => selectSpotFromSearch(id));
    li.appendChild(btn);
    spotResultsEl.appendChild(li);
  });
  spotResultsEl.hidden = false;
});

document.addEventListener("click", (e) => {
  if (!spotResultsEl.contains(e.target) && e.target !== spotSearchEl) {
    spotResultsEl.hidden = true;
  }
});

function selectSpotFromSearch(spotId) {
  const linkedWorks = WORKS.filter(
    (w) => (!w.draft || isOwner()) && w.scenes.some((s) => s.spot === spotId)
  );
  linkedWorks.forEach((w) => selectedWorkIds.add(w.id));
  buildWorkList();
  render();
  focusSpot(spotId);
  spotSearchEl.value = "";
  spotResultsEl.hidden = true;
  spotResultsEl.innerHTML = "";
}

// ---- 表示中のピンに画面を合わせる ----
document.getElementById("fit-pins").addEventListener("click", () => {
  const lls = [...markersBySpot.values()].map((m) => m.getLatLng());
  if (lls.length) {
    map.fitBounds(L.latLngBounds(lls).pad(0.2), { maxZoom: 15, animate: false });
  }
  sidebar.classList.remove("open");
});

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
