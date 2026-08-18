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
    <h2>シーンの追加・編集</h2>

    <label class="ed-label">作品
      <select id="ed-work"></select>
    </label>
    <div id="ed-new-work" hidden>
      <label class="ed-label">タイトル <input id="ed-work-title" type="text" placeholder="例: 夜行"></label>
      <label class="ed-label">著者 <input id="ed-work-author" type="text" placeholder="例: 森見登美彦"></label>
      <label class="ed-label ed-color">ピンの色 <input id="ed-work-color" type="color" value="#5a7d9a"></label>
    </div>

    <label class="ed-label">場所
      <select id="ed-spot"></select>
    </label>
    <div id="ed-new-spot" hidden>
      <p class="ed-hint">地図をクリックすると座標が入ります。</p>
      <label class="ed-label">場所名 <input id="ed-spot-name" type="text" placeholder="例: 貴船神社"></label>
      <label class="ed-label">場所の説明（省略可） <input id="ed-spot-note" type="text"></label>
      <div class="ed-row">
        <label class="ed-label">緯度 <input id="ed-spot-lat" type="number" step="any"></label>
        <label class="ed-label">経度 <input id="ed-spot-lng" type="number" step="any"></label>
      </div>
    </div>

    <label class="ed-label">この場所で何が起きたか
      <textarea id="ed-text" rows="5" placeholder="小説の中でこの場所で起きたことを書く"></textarea>
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

// ---- セレクトの中身 ----
function refreshSelects(keepWork, keepSpot) {
  const workSel = $("ed-work");
  workSel.innerHTML = "";
  WORKS.forEach((w) => workSel.add(new Option(`${w.title}（${w.author}）`, w.id)));
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

function onSelectionChange() {
  const newWork = $("ed-work").value === NEW;
  const newSpot = $("ed-spot").value === NEW;
  $("ed-new-work").hidden = !newWork;
  $("ed-new-spot").hidden = !newSpot;

  if (!newSpot && pickMarker) { map.removeLayer(pickMarker); pickMarker = null; }

  const { scene } = newWork || newSpot ? {} : currentScene();
  $("ed-text").value = scene ? scene.text : "";
  $("ed-save").textContent = scene ? "更新" : "保存";
  $("ed-delete").hidden = !scene;
}

$("ed-work").addEventListener("change", onSelectionChange);
$("ed-spot").addEventListener("change", onSelectionChange);

// 新しい場所モード中の地図クリックで座標を拾う
map.on("click", (e) => {
  if (panel.hidden || $("ed-spot").value !== NEW) return;
  $("ed-spot-lat").value = e.latlng.lat.toFixed(5);
  $("ed-spot-lng").value = e.latlng.lng.toFixed(5);
  if (pickMarker) map.removeLayer(pickMarker);
  pickMarker = L.marker(e.latlng).addTo(map);
});

// ---- 保存・削除 ----
function status(msg, isError) {
  const el = $("ed-status");
  el.textContent = msg;
  el.classList.toggle("ed-error", !!isError);
}

function newId(prefix) {
  return `${prefix}-${Date.now().toString(36)}`;
}

$("ed-save").addEventListener("click", async () => {
  let workId = $("ed-work").value;
  let spotId = $("ed-spot").value;
  const text = $("ed-text").value.trim();
  if (!text) return status("シーンの本文を入力してください。", true);

  if (workId === NEW) {
    const title = $("ed-work-title").value.trim();
    const author = $("ed-work-author").value.trim();
    if (!title) return status("作品タイトルを入力してください。", true);
    workId = newId("work");
    WORKS.push({ id: workId, title, author, color: $("ed-work-color").value, scenes: [] });
  }

  if (spotId === NEW) {
    const name = $("ed-spot-name").value.trim();
    const lat = parseFloat($("ed-spot-lat").value);
    const lng = parseFloat($("ed-spot-lng").value);
    if (!name) return status("場所名を入力してください。", true);
    if (!isFinite(lat) || !isFinite(lng)) return status("地図をクリックして座標を入れてください。", true);
    spotId = newId("spot");
    SPOTS[spotId] = { name, lat, lng, note: $("ed-spot-note").value.trim() };
  }

  const work = WORKS.find((w) => w.id === workId);
  const existing = work.scenes.find((s) => s.spot === spotId);
  if (existing) existing.text = text;
  else work.scenes.push({ spot: spotId, text });

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
  $("ed-work-title").value = $("ed-work-author").value = "";
  $("ed-spot-name").value = $("ed-spot-note").value = "";
  $("ed-spot-lat").value = $("ed-spot-lng").value = "";

  // 永続化
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) {
    downloadData();
    return status(doneMsg + " トークン未設定のため data.json をダウンロードしました。リポジトリの kyoto-literary-map/data.json と差し替えて push してください。");
  }
  try {
    status("GitHub に保存中…");
    await commitData();
    status(doneMsg + " GitHub にコミットしました（サイト反映まで数分）。");
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
