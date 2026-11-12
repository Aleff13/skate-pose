import { ApiError, auth, putFile, session, videos as api } from "./api.js";

const $ = (id) => document.getElementById(id);
const els = {
  app: $("app"), list: $("list"), empty: $("empty"), count: $("count"), detail: $("detail"),
  viewSwitch: $("view-switch"), email: $("user-email"), sheet: $("auth-sheet"), form: $("auth-form"),
  drop: $("drop"), fileInput: $("file-input"), toasts: $("toasts"),
};

const state = {
  videos: [], // do servidor
  uploads: new Map(), // envios em andamento: tempId -> { name, size, progress }
  selectedId: null,
  view: "raw", // "raw" | "processed"
  urls: null, // { id, raw, processed, at }
  pollTimer: null,
};

const STATUS = {
  pending_upload: "Envio incompleto", uploaded: "Enviado", queued: "Na fila",
  processing: "Processando", processed: "Pronto", failed: "Falhou",
};
const BUSY = new Set(["queued", "processing"]);
const MIME_BY_EXT = { mov: "video/quicktime", mp4: "video/mp4", m4v: "video/x-m4v", webm: "video/webm", avi: "video/x-msvideo", mkv: "video/x-matroska" };

/* ---------- utilidades ---------- */
const fmtBytes = (n) => (n < 1e6 ? `${(n / 1e3).toFixed(0)} KB` : n < 1e9 ? `${(n / 1e6).toFixed(1)} MB` : `${(n / 1e9).toFixed(2)} GB`);
const fmtDur = (s) => (s == null ? "—" : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`);
const dateFmt = new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short" });
const fmtDate = (iso) => dateFmt.format(new Date(iso));

/** Cria elementos sem innerHTML (nomes de arquivo vêm do usuário). */
function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const c of children.flat()) if (c != null) el.append(c);
  return el;
}
const svg = (inner, size = 18) => {
  const t = document.createElement("template");
  t.innerHTML = `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
  return t.content.firstChild;
};
const ICON_FILM = '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M10 9.5l5 2.5-5 2.5z" fill="currentColor"/>';

function toast(msg, kind = "") {
  const t = h("div", { class: `toast ${kind}` }, msg);
  els.toasts.append(t);
  setTimeout(() => t.remove(), 5500);
}
const errMsg = (e) => (e instanceof Error ? e.message : String(e));
const selected = () => state.videos.find((v) => v.id === state.selectedId) ?? null;

/* ---------- login ---------- */
let signupMode = false;
function setAuthMode(signup) {
  signupMode = signup;
  $("auth-title").textContent = signup ? "Criar conta" : "Entrar";
  $("auth-submit").textContent = signup ? "Criar conta" : "Entrar";
  $("auth-toggle").textContent = signup ? "Já tenho conta" : "Criar conta";
  $("auth-password").autocomplete = signup ? "new-password" : "current-password";
  $("auth-error").hidden = true;
}
function showSheet() {
  els.app.hidden = true;
  stopPolling();
  if (!els.sheet.open) els.sheet.showModal();
  $("auth-email").focus();
}
els.sheet.addEventListener("cancel", (e) => e.preventDefault()); // login é obrigatório
$("auth-toggle").addEventListener("click", () => setAuthMode(!signupMode));
els.form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = $("auth-email").value.trim();
  const password = $("auth-password").value;
  const errEl = $("auth-error");
  errEl.hidden = true;
  if (!email || password.length < 8) {
    errEl.textContent = "Informe um e-mail e uma senha de pelo menos 8 caracteres.";
    errEl.hidden = false;
    return;
  }
  $("auth-submit").disabled = true;
  try {
    if (signupMode) {
      const r = await auth.signUp(email, password);
      if (!r.confirmed) {
        errEl.textContent = "Conta criada. Confirme o código enviado por e-mail antes de entrar.";
        errEl.hidden = false;
        setAuthMode(false);
        return;
      }
    }
    await auth.login(email, password);
    els.sheet.close();
    els.form.reset();
    await start();
  } catch (err) {
    errEl.textContent = err instanceof ApiError && err.status === 401 ? "E-mail ou senha incorretos." : errMsg(err);
    errEl.hidden = false;
  } finally {
    $("auth-submit").disabled = false;
  }
});
$("logout").addEventListener("click", () => {
  auth.logout();
  state.videos = [];
  state.selectedId = null;
  showSheet();
});
window.addEventListener("session-expired", showSheet);

/* ---------- lista ---------- */
function renderList() {
  const rows = [];

  for (const [id, u] of state.uploads) {
    rows.push(
      h("li", { class: "item", "data-upload": id },
        h("div", { class: "thumb" }, svg(ICON_FILM)),
        h("div", { class: "text" },
          h("div", { class: "name" }, u.name),
          h("div", { class: "sub muted" }, `Enviando… ${Math.round(u.progress * 100)}%`)),
        h("span", { class: "spinner" }),
        h("div", { class: "bar" }, h("i", { style: `width:${u.progress * 100}%` }))),
    );
  }

  for (const v of state.videos) {
    rows.push(
      h("li", { class: "item", role: "option", "data-id": v.id, "aria-selected": String(v.id === state.selectedId) },
        h("div", { class: "thumb" }, svg(ICON_FILM)),
        h("div", { class: "text" },
          h("div", { class: "name", title: v.originalName }, v.originalName),
          h("div", { class: "sub muted" }, `${fmtDate(v.createdAt)} · ${fmtBytes(v.sizeBytes)}`)),
        h("span", { class: `pill ${v.status}` }, BUSY.has(v.status) ? h("span", { class: "spinner" }) : null, STATUS[v.status])),
    );
  }

  els.list.replaceChildren(...rows);
  els.empty.hidden = rows.length > 0;
  els.count.textContent = state.videos.length ? String(state.videos.length) : "";
}
els.list.addEventListener("click", (e) => {
  const li = e.target.closest("[data-id]");
  if (li) select(li.dataset.id);
});
els.list.addEventListener("keydown", (e) => {
  if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
  e.preventDefault();
  const i = state.videos.findIndex((v) => v.id === state.selectedId);
  const next = state.videos[Math.min(state.videos.length - 1, Math.max(0, i + (e.key === "ArrowDown" ? 1 : -1)))];
  if (next) select(next.id);
});

/* ---------- detalhe ---------- */
function select(id) {
  state.selectedId = id;
  state.view = "raw";
  els.app.dataset.mobile = "detail";
  renderList();
  renderDetail(true);
}
$("back").addEventListener("click", () => {
  els.app.dataset.mobile = "list";
});

function detailEmpty() {
  return h("div", { class: "detail-empty" },
    svg(ICON_FILM, 56),
    h("div", { class: "big" }, state.videos.length ? "Selecione um vídeo" : "Envie seu primeiro vídeo"),
    h("div", {}, "Arraste um arquivo para a janela ou use “Enviar vídeo”."));
}

function metaBlock(v) {
  const rows = [
    ["Duração", fmtDur(v.durationSec)],
    ["Resolução", v.width ? `${v.width} × ${v.height}` : "—"],
    ["Quadros/s", v.fps ? v.fps.toFixed(0) : "—"],
    ["Tamanho", fmtBytes(v.sizeBytes)],
    ["Enviado em", fmtDate(v.createdAt)],
  ];
  return h("dl", { class: "meta" }, rows.map(([k, val]) => h("div", {}, h("dt", {}, k), h("dd", {}, val))));
}

function statusBlock(v) {
  const nodes = [];
  if (BUSY.has(v.status)) {
    nodes.push(
      h("div", { class: "banner" },
        h("div", { class: "row" }, h("span", { class: "spinner" }), v.status === "queued" ? "Na fila de processamento…" : "Processando o vídeo…"),
        h("div", { class: "muted" }, "Isso pode levar alguns minutos. Você pode fechar esta janela; o processamento continua no servidor."),
        h("div", { class: "bar indeterminate" }, h("i"))),
    );
  }
  if (v.status === "failed") {
    nodes.push(h("div", { class: "banner error" }, h("div", { class: "row" }, "Falha no processamento"), v.errorMessage ? h("div", {}, v.errorMessage) : null));
  }
  if (v.status === "pending_upload") {
    nodes.push(h("div", { class: "banner" }, h("div", { class: "row" }, "Envio incompleto"), h("div", { class: "muted" }, "O arquivo não chegou ao S3. Envie o vídeo novamente.")));
  }

  const actions = h("div", { class: "actions" });
  if (v.status === "uploaded" || v.status === "failed") {
    actions.append(h("button", { class: "btn-primary", id: "process-btn", onclick: () => processVideo(v.id) }, v.status === "failed" ? "Tentar novamente" : "Processar"));
  }
  if (BUSY.has(v.status)) actions.append(h("button", { class: "btn-primary", disabled: true }, "Processando…"));
  if (v.status === "processed" && state.urls?.id === v.id && state.urls.processed) {
    actions.append(h("a", { href: state.urls.processed, download: `esqueleto-${v.originalName.replace(/\.[^.]+$/, "")}.mp4` }, "Baixar com esqueleto"));
  }
  if (actions.childElementCount) nodes.push(actions);
  return nodes;
}

/** `rebuild` recria o player; sem ele só atualiza status/ações (o polling não pode reiniciar o vídeo). */
function renderDetail(rebuild = false) {
  const v = selected();
  syncViewSwitch(v);
  if (!v) {
    els.detail.dataset.id = "";
    els.detail.replaceChildren(detailEmpty());
    return;
  }
  if (rebuild || els.detail.dataset.id !== v.id) {
    els.detail.dataset.id = v.id;
    const player = v.status === "pending_upload" ? null : h("div", { class: "player", id: "player" }, h("div", { class: "overlay", id: "overlay" }, "Carregando…"));
    els.detail.replaceChildren(
      h("div", { class: "detail-head" }, h("h1", {}, v.originalName), h("div", { class: "muted" }, `${STATUS[v.status]} · ${fmtDate(v.createdAt)}`)),
      player,
      h("div", { id: "status-block" }),
      h("div", { id: "meta-block" }),
    );
    if (player) loadSource();
  } else {
    els.detail.querySelector(".detail-head .muted").textContent = `${STATUS[v.status]} · ${fmtDate(v.createdAt)}`;
  }
  $("status-block").replaceChildren(...statusBlock(v));
  $("meta-block").replaceChildren(metaBlock(v));
}

function syncViewSwitch(v) {
  els.viewSwitch.hidden = !v || v.status === "pending_upload";
  if (!v) return;
  for (const b of els.viewSwitch.querySelectorAll("button")) {
    b.setAttribute("aria-selected", String(b.dataset.view === state.view));
    if (b.dataset.view === "processed") b.disabled = !v.hasProcessed;
  }
}
els.viewSwitch.addEventListener("click", (e) => {
  const b = e.target.closest("button[data-view]");
  if (!b || b.disabled || b.dataset.view === state.view) return;
  const old = els.detail.querySelector("video");
  const keep = old ? { t: old.currentTime, paused: old.paused } : null;
  state.view = b.dataset.view;
  syncViewSwitch(selected());
  loadSource(keep);
});

/** (Re)busca as URLs pré-assinadas (expiram em 15 min) e aponta o <video> para a escolhida. */
async function loadSource(keep = null, retried = false) {
  const v = selected();
  const player = $("player");
  if (!v || !player) return;
  const fresh = state.urls && state.urls.id === v.id && state.urls.hasProcessed === v.hasProcessed && Date.now() - state.urls.at < 600_000;
  try {
    if (!fresh) state.urls = { ...(await api.urls(v.id)), id: v.id, hasProcessed: v.hasProcessed, at: Date.now() };
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) return;
    $("overlay") && ($("overlay").textContent = `Não foi possível carregar o vídeo: ${errMsg(e)}`);
    return;
  }
  if (selected()?.id !== v.id) return; // usuário trocou de vídeo no meio do caminho

  const src = state.view === "processed" && state.urls.processed ? state.urls.processed : state.urls.raw;
  let video = player.querySelector("video");
  if (!video) {
    video = h("video", { controls: true, playsinline: true, preload: "metadata" });
    player.prepend(video);
    video.addEventListener("loadedmetadata", () => {
      $("overlay")?.remove();
      player.style.setProperty("--ar", `${video.videoWidth} / ${video.videoHeight}`);
      if (video._keep) {
        video.currentTime = Math.min(video._keep.t, video.duration || video._keep.t);
        if (!video._keep.paused) video.play().catch(() => {});
        video._keep = null;
      }
    });
    video.addEventListener("error", () => {
      if (retried) return void ($("overlay") ?? player.append(h("div", { class: "overlay", id: "overlay" }, "Não foi possível reproduzir este vídeo.")));
      state.urls = null; // URL expirada? busca de novo uma vez
      loadSource({ t: video.currentTime, paused: video.paused }, true);
    });
  }
  video._keep = keep;
  if (video.getAttribute("src") !== src) video.src = src;
  renderDetail(false); // atualiza o link de download, que depende das URLs
}

async function processVideo(id) {
  const btn = $("process-btn");
  if (btn) btn.disabled = true;
  try {
    upsert(await api.process(id));
    schedulePoll();
  } catch (e) {
    toast(errMsg(e), "error");
    await refresh();
  }
}

/* ---------- dados ---------- */
function upsert(v) {
  const i = state.videos.findIndex((x) => x.id === v.id);
  if (i >= 0) state.videos[i] = v;
  else state.videos.unshift(v);
  renderList();
  renderDetail(false);
}

async function refresh() {
  try {
    const { items } = await api.list();
    const before = new Map(state.videos.map((v) => [v.id, v.status]));
    state.videos = items;
    renderList();
    const cur = selected();
    if (state.selectedId && !cur) state.selectedId = null;
    // terminou de processar: mostra o resultado com o esqueleto
    if (cur && before.get(cur.id) !== "processed" && cur.status === "processed" && before.has(cur.id)) {
      state.view = "processed";
      state.urls = null;
      renderDetail(true);
      toast(`“${cur.originalName}” foi processado.`);
    } else {
      renderDetail(false);
    }
    schedulePoll();
  } catch (e) {
    if (!(e instanceof ApiError && e.status === 401)) toast(`Não foi possível atualizar a lista: ${errMsg(e)}`, "error");
  }
}

function stopPolling() {
  clearTimeout(state.pollTimer);
  state.pollTimer = null;
}
function schedulePoll() {
  stopPolling();
  if (state.videos.some((v) => BUSY.has(v.status))) state.pollTimer = setTimeout(refresh, 3000);
}

/* ---------- upload ---------- */
function contentTypeOf(file) {
  if (file.type.startsWith("video/")) return file.type;
  return MIME_BY_EXT[file.name.split(".").pop().toLowerCase()] ?? null;
}

async function uploadOne(file) {
  const contentType = contentTypeOf(file);
  if (!contentType) return toast(`“${file.name}” não parece ser um vídeo.`, "error");

  const tmp = crypto.randomUUID();
  state.uploads.set(tmp, { name: file.name, size: file.size, progress: 0 });
  renderList();
  try {
    const { video, upload } = await api.create(file.name, contentType, file.size); // 1) registra + URL assinada
    await putFile(upload, file, (p) => {                                            // 2) PUT direto no S3
      state.uploads.get(tmp).progress = p;
      const row = els.list.querySelector(`[data-upload="${tmp}"]`);
      if (row) {
        row.querySelector(".bar > i").style.width = `${p * 100}%`;
        row.querySelector(".sub").textContent = `Enviando… ${Math.round(p * 100)}%`;
      }
    });
    const done = await api.complete(video.id);                                      // 3) confirma no backend
    state.uploads.delete(tmp);
    upsert(done);
    select(done.id);
  } catch (e) {
    toast(`Falha ao enviar “${file.name}”: ${errMsg(e)}`, "error");
  } finally {
    state.uploads.delete(tmp);
    await refresh();
  }
}

async function uploadFiles(files) {
  for (const f of files) await uploadOne(f); // um por vez: não disputa banda com o próprio upload
}

$("upload-btn").addEventListener("click", () => els.fileInput.click());
els.fileInput.addEventListener("change", () => {
  const files = [...els.fileInput.files];
  els.fileInput.value = "";
  uploadFiles(files);
});

let dragDepth = 0;
const hasFiles = (e) => [...(e.dataTransfer?.types ?? [])].includes("Files");
window.addEventListener("dragenter", (e) => { if (hasFiles(e)) { dragDepth++; els.drop.hidden = false; } });
window.addEventListener("dragleave", (e) => { if (hasFiles(e) && --dragDepth <= 0) { dragDepth = 0; els.drop.hidden = true; } });
window.addEventListener("dragover", (e) => { if (hasFiles(e)) e.preventDefault(); });
window.addEventListener("drop", (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  dragDepth = 0;
  els.drop.hidden = true;
  if (!els.app.hidden) uploadFiles([...e.dataTransfer.files]);
});

/* ---------- início ---------- */
async function start() {
  els.email.textContent = session.get()?.email ?? "";
  els.app.hidden = false;
  els.app.dataset.mobile = "list";
  renderList();
  renderDetail(true);
  await refresh();
}

if (session.get()) start();
else showSheet();
