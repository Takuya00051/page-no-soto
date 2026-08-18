// ============================================================
// 京都文学マップ 表示ロジック
// （データの追加・編集は data.js だけで完結します）
// ============================================================

const map = L.map("map", { zoomControl: false }).setView([35.023, 135.776], 14);
L.control.zoom({ position: "bottomright" }).addTo(map);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
}).addTo(map);

const markerLayer = L.layerGroup().addTo(map);

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
const initialSelection = selectedIdsFromHash() ?? [WORKS[0]?.id].filter(Boolean);

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
  checkbox.checked = initialSelection.includes(work.id);
  checkbox.addEventListener("change", render);

  label.append(dot, meta, checkbox);
  li.appendChild(label);
  workListEl.appendChild(li);
});

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

function popupHtml(spot, entries) {
  const el = document.createElement("div");
  el.className = "popup";

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

  if (entries.length > 1) {
    const badge = document.createElement("span");
    badge.className = "popup-link-note";
    badge.textContent = `${entries.length}作品がリンクする場所`;
    el.appendChild(badge);
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
        console.warn(`data.js: 場所ID "${scene.spot}" が SPOTS にありません（${work.title}）`);
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
    marker.bindPopup(popupHtml(spot, entries), { maxWidth: 320 });
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

render();
