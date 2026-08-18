// ============================================================
// 京都文学マップ 編集機能
// サイト上でシーン・場所・作品を追加編集し、GitHub に直接コミットする。
// GitHub トークン未設定の場合は data.json のダウンロードにフォールバック。
// ============================================================

const TOKEN_KEY = "kyoto-map-github-token";
const NEW = "__new__";

const editorEl = document.createElement("div");
editorEl.id = "editor";
editorEl.innerHTML = `
  <button id="editor-toggle" title="編集">✎ 編集</button>
  <div id="editor-panel" hidden>
    <button id="editor-close" title="閉じる" aria-label="閉じる">×</button>
    <h2>シーンの追加・編集</h2>

    <div class="ed-photo-block">
      <label class="ed-label">📷 写真から入力（任意）
        <input type="file" id="ed-photo-input" accept="image/*" capture="environment">
      </label>
      <p class="ed-hint">読んでいる本の該当ページを撮ると、文章を読み取って引用欄に入れ、地図上の場所の候補を提案します。</p>
      <p class="ed-hint" id="ed-photo-status"></p>
      <div id="ed-photo-candidates" class="ed-photo-candidates" hidden></div>
    </div>

    <label class="ed-label">作品
      <select id="ed-work"></select>
    </label>

    <details id="ed-work-fields" class="ed-details">
      <summary>作品情報を編集</summary>
      <label class="ed-label">タイトル <input id="ed-work-title" type="text" placeholder="例: 夜行"></label>
      <label class="ed-label">著者 <input id="ed-work-author" type="text" placeholder="例: 森見登美彦"></label>
      <div class="ed-row">
        <label class="ed-label">刊行年（省略可） <input id="ed-work-year" type="number" step="1" min="1800" max="2100" placeholder="例: 2006"></label>
        <label class="ed-label ed-color">ピンの色 <input id="ed-work-color" type="color" value="#5a7d9a"></label>
      </div>
      <label class="ed-label">ISBN（省略可） <input id="ed-work-isbn" type="text" placeholder="例: 9784043878024"></label>
      <label class="ed-label">表紙画像URL（省略可・未入力なら自動検索） <input id="ed-work-cover" type="text" placeholder="https://..."></label>
      <label class="ed-label">あらすじ（省略可・未入力なら自動検索） <textarea id="ed-work-synopsis" rows="3"></textarea></label>
      <label class="ed-check"><input type="checkbox" id="ed-draft"> 下書き（読了まで一覧に公開しない）</label>
      <div class="ed-row">
        <button id="ed-work-save">作品情報を保存</button>
        <button id="ed-work-delete" class="ed-danger" hidden>この作品ごと削除</button>
      </div>
    </details>

    <label class="ed-label">場所
      <select id="ed-spot"></select>
    </label>
    <div id="ed-new-spot" hidden>
      <p class="ed-hint">地図をクリックすると座標が入ります。</p>
      <label class="ed-label">場所名 <input id="ed-spot-name" type="text" placeholder="例: 貴船神社"></label>
      <label class="ed-label">フリガナ（省略可） <input id="ed-spot-kana" type="text" placeholder="例: きふねじんじゃ"></label>
      <label class="ed-label">場所の説明（省略可） <input id="ed-spot-note" type="text"></label>
      <div class="ed-row">
        <label class="ed-label">緯度 <input id="ed-spot-lat" type="number" step="any"></label>
        <label class="ed-label">経度 <input id="ed-spot-lng" type="number" step="any"></label>
      </div>
    </div>
    <div id="ed-move-spot" hidden>
      <div class="ed-row">
        <button id="ed-move-toggle">📍 ピンの位置を打ち直す</button>
        <button id="ed-move-save" class="ed-primary" hidden>この位置で保存</button>
      </div>
      <p class="ed-hint" id="ed-move-hint"></p>
    </div>

    <label class="ed-label">この場所で何が起きたか
      <textarea id="ed-text" rows="5" placeholder="小説の中でこの場所で起きたことを書く"></textarea>
    </label>

    <label class="ed-label">該当箇所の文章（引用・省略可）
      <textarea id="ed-quote" rows="3" placeholder="本文からの短い引用"></textarea>
    </label>

    <div class="ed-row">
      <button id="ed-save" class="ed-primary">保存</button>
      <button id="ed-delete" class="ed-danger" hidden>このシーンを削除</button>
    </div>
    <p id="ed-status" class="ed-hint"></p>

    <details class="ed-settings">
      <summary>保存先の設定（GitHub トークン）</summary>
      <p class="ed-hint">
        Fine-grained personal access token（このリポジトリのみ・Contents: Read and write）を設定すると、
        保存時に GitHub へ直接コミットされ、数分でサイトに反映されます。
        未設定の場合は data.json がダウンロードされるので、手動で差し替えてください。
        トークンはこのブラウザ（localStorage）にのみ保存されます。
      </p>
      <label class="ed-label">トークン <input id="ed-token" type="password" autocomplete="off"></label>
      <div class="ed-row">
        <button id="ed-token-save">トークンを保存</button>
        <button id="ed-token-clear">削除</button>
      </div>
    </details>
  </div>
`;
document.querySelector(".map-container").appendChild(editorEl);

const $ = (id) => document.getElementById(id);
const panel = $("editor-panel");
let pickMarker = null;

$("editor-toggle").addEventListener("click", () => {
  panel.hidden = !panel.hidden;
  if (!panel.hidden) refreshSelects();
});

$("editor-close").addEventListener("click", () => {
  panel.hidden = true;
});

// ---- セレクトの中身 ----
function refreshSelects(keepWork, keepSpot) {
  const workSel = $("ed-work");
  workSel.innerHTML = "";
  WORKS.forEach((w) => {
    const yearPart = w.year ? `・${w.year}年` : "";
    workSel.add(new Option(`${w.title}（${w.author}${yearPart}）`, w.id));
  });
  workSel.add(new Option("＋ 新しい作品を追加", NEW));
  if (keepWork) workSel.value = keepWork;

  const spotSel = $("ed-spot");
  spotSel.innerHTML = "";
  Object.entries(SPOTS).forEach(([id, s]) => spotSel.add(new Option(s.name, id)));
  spotSel.add(new Option("＋ 新しい場所を追加（地図クリック）", NEW));
  if (keepSpot) spotSel.value = keepSpot;

  onSelectionChange();
}

function currentScene() {
  const work = WORKS.find((w) => w.id === $("ed-work").value);
  if (!work) return {};
  const scene = work.scenes.find((s) => s.spot === $("ed-spot").value);
  return { work, scene };
}

let moveMode = false;
let movePending = null;

function resetMoveMode() {
  moveMode = false;
  movePending = null;
  $("ed-move-save").hidden = true;
  $("ed-move-toggle").textContent = "📍 ピンの位置を打ち直す";
  updateMoveHint();
}

function updateMoveHint() {
  const spot = SPOTS[$("ed-spot").value];
  if (!spot) return;
  $("ed-move-hint").textContent = moveMode
    ? "地図をクリックすると新しい位置に仮ピンが立ちます。"
    : `現在の座標: ${spot.lat}, ${spot.lng}`;
}

function fillWorkFields(work) {
  $("ed-work-title").value = work ? work.title : "";
  $("ed-work-author").value = work ? work.author : "";
  $("ed-work-year").value = work && work.year ? work.year : "";
  $("ed-work-color").value = work ? work.color : "#5a7d9a";
  $("ed-work-isbn").value = work && work.isbn ? work.isbn : "";
  $("ed-work-cover").value = work && work.cover ? work.cover : "";
  $("ed-work-synopsis").value = work && work.synopsis ? work.synopsis : "";
  $("ed-draft").checked = !!(work && work.draft);
}

function onSelectionChange() {
  const newWork = $("ed-work").value === NEW;
  const newSpot = $("ed-spot").value === NEW;
  $("ed-new-spot").hidden = !newSpot;
  $("ed-move-spot").hidden = newSpot;

  if (pickMarker) { map.removeLayer(pickMarker); pickMarker = null; }
  resetMoveMode();

  const selWork = newWork ? null : WORKS.find((w) => w.id === $("ed-work").value);
  fillWorkFields(selWork);
  $("ed-work-fields").open = newWork;
  $("ed-work-delete").hidden = newWork;

  const { scene } = newWork || newSpot ? {} : currentScene();
  $("ed-text").value = scene ? scene.text : "";
  $("ed-quote").value = scene && scene.quote ? scene.quote : "";
  $("ed-save").textContent = scene ? "更新" : "保存";
  $("ed-delete").hidden = !scene;
}

// 開いている作品詳細から「この作品を編集する」で呼ばれる
window.openEditorForWork = (workId) => {
  panel.hidden = false;
  refreshSelects(workId);
};

$("ed-work").addEventListener("change", onSelectionChange);
$("ed-spot").addEventListener("change", onSelectionChange);

// 地図クリック: 新しい場所の座標入力、または既存ピンの位置打ち直し
map.on("click", (e) => {
  if (panel.hidden) return;
  if ($("ed-spot").value === NEW) {
    $("ed-spot-lat").value = e.latlng.lat.toFixed(5);
    $("ed-spot-lng").value = e.latlng.lng.toFixed(5);
    if (pickMarker) map.removeLayer(pickMarker);
    pickMarker = L.marker(e.latlng).addTo(map);
  } else if (moveMode) {
    movePending = e.latlng;
    if (pickMarker) map.removeLayer(pickMarker);
    pickMarker = L.marker(e.latlng).addTo(map);
    $("ed-move-save").hidden = false;
  }
});

$("ed-move-toggle").addEventListener("click", () => {
  moveMode = !moveMode;
  $("ed-move-toggle").textContent = moveMode ? "打ち直しをやめる" : "📍 ピンの位置を打ち直す";
  if (!moveMode) {
    movePending = null;
    $("ed-move-save").hidden = true;
    if (pickMarker) { map.removeLayer(pickMarker); pickMarker = null; }
  }
  updateMoveHint();
});

$("ed-move-save").addEventListener("click", async () => {
  const spotId = $("ed-spot").value;
  const spot = SPOTS[spotId];
  if (!spot || !movePending) return;
  spot.lat = parseFloat(movePending.lat.toFixed(5));
  spot.lng = parseFloat(movePending.lng.toFixed(5));
  if (pickMarker) { map.removeLayer(pickMarker); pickMarker = null; }
  resetMoveMode();
  render();
  await persistData(`「${spot.name}」の位置を更新しました。`);
});

// ---- 写真から入力（OCR + 場所候補の提案） ----
// Tesseract.js は初回利用時にだけ CDN から読み込む（通常の閲覧・編集では読み込まない）。
let tesseractLoadPromise = null;
function loadTesseract() {
  if (window.Tesseract) return Promise.resolve(window.Tesseract);
  if (tesseractLoadPromise) return tesseractLoadPromise;
  tesseractLoadPromise = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";
    s.onload = () => resolve(window.Tesseract);
    s.onerror = () => reject(new Error("OCRライブラリの読み込みに失敗しました"));
    document.head.appendChild(s);
  });
  return tesseractLoadPromise;
}

function photoStatus(msg) {
  $("ed-photo-status").textContent = msg;
}

$("ed-photo-input").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;

  const candEl = $("ed-photo-candidates");
  candEl.hidden = true;
  candEl.innerHTML = "";
  panel.querySelector("h2").scrollIntoView({ block: "start", behavior: "smooth" });

  try {
    photoStatus("OCRライブラリを読み込み中…（初回のみ数秒かかります）");
    const Tesseract = await loadTesseract();
    photoStatus("写真を読み取っています…");
    const { data } = await Tesseract.recognize(file, "jpn");
    const text = (data.text || "").replace(/[ \t]+/g, "").trim();
    if (!text) {
      photoStatus("文字を読み取れませんでした。手入力するか、別の写真でお試しください。");
      return;
    }
    $("ed-quote").value = text.length > 400 ? text.slice(0, 400) : text;
    showSpotCandidates(text);
    photoStatus("読み取り完了。引用欄に反映しました。下の候補から場所を選ぶか、手動で選択してください。");
  } catch (err) {
    photoStatus(`読み取りに失敗しました（${err.message}）。手動で入力してください。`);
  }
});

// 「下鴨神社・糺の森」のような複合名は「・」で分割し、
// どちらか一方だけが本文にあってもヒットするようにする
function nameParts(name) {
  return name
    .replace(/[（(][^（）()]*[）)]/g, "") // 括弧書きの補足は除外
    .split(/[・/]/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 2); // 1文字だけの断片は誤検出が多いので除外
}

function showSpotCandidates(text) {
  const candEl = $("ed-photo-candidates");
  candEl.innerHTML = "";
  const found = [];

  Object.entries(SPOTS).forEach(([id, s]) => {
    const parts = [...nameParts(s.name), ...(s.kana ? nameParts(s.kana) : [])];
    if (parts.some((p) => text.includes(p))) {
      found.push({ type: "existing", id, label: s.name });
    }
  });

  KNOWN_LANDMARKS.forEach((lm) => {
    const alreadyRegistered = Object.values(SPOTS).some((s) => nameParts(s.name).includes(lm.name));
    if (alreadyRegistered) return;
    if (text.includes(lm.name)) found.push({ type: "new", id: lm.id, label: lm.name });
  });

  if (!found.length) { candEl.hidden = true; return; }
  candEl.hidden = false;
  found.forEach((f) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "ed-candidate-chip";
    btn.textContent = (f.type === "existing" ? "📍 " : "✨ ") + f.label;
    btn.addEventListener("click", () => applyCandidate(f));
    candEl.appendChild(btn);
  });
}

async function applyCandidate(f) {
  if (f.type === "existing") {
    $("ed-spot").value = f.id;
    $("ed-spot").dispatchEvent(new Event("change"));
    photoStatus(`「${f.label}」を選択しました。`);
    return;
  }

  $("ed-spot").value = NEW;
  $("ed-spot").dispatchEvent(new Event("change"));
  $("ed-spot-name").value = f.label;
  photoStatus(`「${f.label}」の座標を検索しています…`);
  try {
    const r = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(f.label + ", 京都, Japan")}&format=json&limit=1`
    );
    const j = await r.json();
    if (j[0]) {
      const lat = parseFloat(j[0].lat);
      const lng = parseFloat(j[0].lon);
      $("ed-spot-lat").value = lat.toFixed(5);
      $("ed-spot-lng").value = lng.toFixed(5);
      if (pickMarker) map.removeLayer(pickMarker);
      pickMarker = L.marker([lat, lng]).addTo(map);
      map.setView([lat, lng], 16);
      photoStatus(`「${f.label}」の座標を自動入力しました。内容を確認して保存してください。`);
    } else {
      photoStatus(`「${f.label}」の座標が見つかりませんでした。地図をクリックして指定してください。`);
    }
  } catch (err) {
    photoStatus("座標の自動検索に失敗しました。地図をクリックして指定してください。");
  }
}

// ---- 保存・削除 ----
function status(msg, isError) {
  const el = $("ed-status");
  el.textContent = msg;
  el.classList.toggle("ed-error", !!isError);
}

function newId(prefix) {
  return `${prefix}-${Date.now().toString(36)}`;
}

function readWorkFields() {
  const year = parseInt($("ed-work-year").value, 10);
  return {
    title: $("ed-work-title").value.trim(),
    author: $("ed-work-author").value.trim(),
    year: Number.isFinite(year) ? year : undefined,
    color: $("ed-work-color").value,
    isbn: $("ed-work-isbn").value.trim(),
    cover: $("ed-work-cover").value.trim(),
    synopsis: $("ed-work-synopsis").value.trim(),
    draft: $("ed-draft").checked,
  };
}

function applyWorkFields(work, fields) {
  work.title = fields.title;
  work.author = fields.author;
  work.color = fields.color;
  if (fields.year !== undefined) work.year = fields.year; else delete work.year;
  if (fields.isbn) work.isbn = fields.isbn; else delete work.isbn;
  if (fields.cover) work.cover = fields.cover; else delete work.cover;
  if (fields.synopsis) work.synopsis = fields.synopsis; else delete work.synopsis;
  if (fields.draft) work.draft = true; else delete work.draft;
}

// ---- 作品情報の保存・削除（シーンとは独立） ----
$("ed-work-save").addEventListener("click", async () => {
  let workId = $("ed-work").value;
  const fields = readWorkFields();
  if (!fields.title) return status("作品タイトルを入力してください。", true);

  let work;
  if (workId === NEW) {
    workId = newId("work");
    work = { id: workId, scenes: [] };
    applyWorkFields(work, fields);
    WORKS.push(work);
  } else {
    work = WORKS.find((w) => w.id === workId);
    applyWorkFields(work, fields);
  }

  buildWorkList([...selectedWorks().map((w) => w.id), workId]);
  render();
  refreshSelects(workId, $("ed-spot").value);
  await persistData(`『${work.title}』の作品情報を保存しました。`);
});

$("ed-work-delete").addEventListener("click", async () => {
  const workId = $("ed-work").value;
  const work = WORKS.find((w) => w.id === workId);
  if (!work) return;
  if (!confirm(`『${work.title}』を全シーンごと削除します。よろしいですか？`)) return;
  WORKS.splice(WORKS.indexOf(work), 1);
  selectedWorkIds.delete(workId);
  buildWorkList();
  render();
  refreshSelects();
  await persistData(`『${work.title}』を削除しました。`);
});

$("ed-save").addEventListener("click", async () => {
  let workId = $("ed-work").value;
  let spotId = $("ed-spot").value;
  const text = $("ed-text").value.trim();
  if (!text) return status("シーンの本文を入力してください。", true);

  if (workId === NEW) {
    const fields = readWorkFields();
    if (!fields.title) return status("作品タイトルを入力してください。", true);
    workId = newId("work");
    const work = { id: workId, scenes: [] };
    applyWorkFields(work, fields);
    WORKS.push(work);
  }

  if (spotId === NEW) {
    const name = $("ed-spot-name").value.trim();
    const lat = parseFloat($("ed-spot-lat").value);
    const lng = parseFloat($("ed-spot-lng").value);
    if (!name) return status("場所名を入力してください。", true);
    if (!isFinite(lat) || !isFinite(lng)) return status("地図をクリックして座標を入れてください。", true);
    spotId = newId("spot");
    SPOTS[spotId] = { name, lat, lng, note: $("ed-spot-note").value.trim() };
    const kana = $("ed-spot-kana").value.trim();
    if (kana) SPOTS[spotId].kana = kana;
  }

  const quote = $("ed-quote").value.trim();
  const work = WORKS.find((w) => w.id === workId);
  const fields = readWorkFields();
  if (fields.title) applyWorkFields(work, fields);
  const existing = work.scenes.find((s) => s.spot === spotId);
  const target = existing || { spot: spotId };
  target.text = text;
  if (quote) target.quote = quote;
  else delete target.quote;
  if (!existing) work.scenes.push(target);

  applyAndPersist(`『${work.title}』のシーンを保存しました。`, workId, spotId);
});

$("ed-delete").addEventListener("click", async () => {
  const { work, scene } = currentScene();
  if (!work || !scene) return;
  work.scenes = work.scenes.filter((s) => s !== scene);
  applyAndPersist(`『${work.title}』のシーンを削除しました。`, work.id, $("ed-spot").value);
});

async function applyAndPersist(doneMsg, workId, spotId) {
  // 画面へ即時反映（編集した作品にチェックを入れる）
  const checked = new Set(selectedWorks().map((w) => w.id));
  checked.add(workId);
  buildWorkList([...checked]);
  render();
  if (pickMarker) { map.removeLayer(pickMarker); pickMarker = null; }
  refreshSelects(workId, spotId);
  $("ed-spot-name").value = $("ed-spot-kana").value = $("ed-spot-note").value = "";
  $("ed-spot-lat").value = $("ed-spot-lng").value = "";

  await persistData(doneMsg);
}

async function persistData(doneMsg) {
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) {
    downloadData();
    return status(doneMsg + " トークン未設定のため data.json をダウンロードしました。リポジトリの kyoto-literary-map/data.json と差し替えて push してください。");
  }
  try {
    status("GitHub に保存中…");
    await commitData();
    status(doneMsg + " GitHub にコミットしました（サイトの反映まで1分ほどかかります。少し待ってからリロードしてください）。");
  } catch (e) {
    downloadData();
    status(`GitHub への保存に失敗（${e.message}）。data.json をダウンロードしたので手動で差し替えてください。`, true);
  }
}

function serializeData() {
  return JSON.stringify({ spots: SPOTS, works: WORKS }, null, 2) + "\n";
}

function downloadData() {
  const blob = new Blob([serializeData()], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "data.json";
  a.click();
  URL.revokeObjectURL(a.href);
}

function toBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin);
}

async function commitData() {
  const token = localStorage.getItem(TOKEN_KEY);
  const api = `https://api.github.com/repos/${REPO}/contents/${DATA_PATH}`;
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
  };
  const cur = await fetch(`${api}?ref=main&t=${Date.now()}`, { headers });
  if (!cur.ok) throw new Error(`現在のデータ取得に失敗 (${cur.status})`);
  const sha = (await cur.json()).sha;

  const res = await fetch(api, {
    method: "PUT",
    headers,
    body: JSON.stringify({
      message: "Update map data from site editor",
      content: toBase64(serializeData()),
      sha,
      branch: "main",
    }),
  });
  if (!res.ok) throw new Error(`コミットに失敗 (${res.status})`);
}

// ---- トークン設定 ----
$("ed-token").value = localStorage.getItem(TOKEN_KEY) || "";
$("ed-token-save").addEventListener("click", () => {
  const v = $("ed-token").value.trim();
  if (!v) return status("トークンを入力してください。", true);
  localStorage.setItem(TOKEN_KEY, v);
  status("トークンをこのブラウザに保存しました。");
});
$("ed-token-clear").addEventListener("click", () => {
  localStorage.removeItem(TOKEN_KEY);
  $("ed-token").value = "";
  status("トークンを削除しました。");
});
