// Cliente da API: sessão (tokens), refresh automático e upload direto via URL pré-assinada.
const STORE = "skate.session";

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const session = {
  get() {
    try { return JSON.parse(localStorage.getItem(STORE)); } catch { return null; }
  },
  set(s) {
    try { localStorage.setItem(STORE, JSON.stringify(s)); } catch { /* storage bloqueado */ }
  },
  clear() {
    try { localStorage.removeItem(STORE); } catch { /* idem */ }
  },
};

async function parse(res) {
  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data?.error ?? `Erro ${res.status}`);
  return data;
}

function send(path, { method = "GET", body, token } = {}) {
  return fetch(path, {
    method,
    headers: {
      ...(body !== undefined && { "Content-Type": "application/json" }),
      ...(token && { Authorization: `Bearer ${token}` }),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

let refreshing = null;
async function refreshTokens() {
  const s = session.get();
  if (!s?.refreshToken) throw new ApiError(401, "Sessão expirada");
  refreshing ??= send("/auth/refresh", { method: "POST", body: { refreshToken: s.refreshToken } })
    .then(parse)
    .then((t) => { session.set({ ...s, accessToken: t.accessToken }); return t.accessToken; })
    .finally(() => { refreshing = null; });
  return refreshing;
}

/** Chamada autenticada; num 401 tenta renovar o token uma vez. */
export async function api(path, opts = {}) {
  const s = session.get();
  let res = await send(path, { ...opts, token: s?.accessToken });
  if (res.status === 401 && s?.refreshToken) {
    try {
      res = await send(path, { ...opts, token: await refreshTokens() });
    } catch {
      session.clear();
      window.dispatchEvent(new Event("session-expired"));
      throw new ApiError(401, "Sessão expirada");
    }
  }
  if (res.status === 401) {
    session.clear();
    window.dispatchEvent(new Event("session-expired"));
  }
  return parse(res);
}

export const auth = {
  async signUp(email, password) {
    return parse(await send("/auth/signup", { method: "POST", body: { email, password } }));
  },
  async login(email, password) {
    const t = await parse(await send("/auth/login", { method: "POST", body: { email, password } }));
    session.set({ email, accessToken: t.accessToken, refreshToken: t.refreshToken });
  },
  logout: () => session.clear(),
};

export const videos = {
  list: () => api("/videos?limit=100"),
  create: (fileName, contentType, sizeBytes) => api("/videos", { method: "POST", body: { fileName, contentType, sizeBytes } }),
  complete: (id) => api(`/videos/${id}/complete`, { method: "POST" }),
  process: (id) => api(`/videos/${id}/process`, { method: "POST" }),
  urls: (id) => api(`/videos/${id}/urls`),
};

/** PUT direto na URL pré-assinada, com progresso (fetch ainda não expõe progresso de upload). */
export function putFile(upload, file, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(upload.method, upload.url);
    for (const [k, v] of Object.entries(upload.headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve();
      // o S3 responde XML com <Message>; mostra o motivo real (ex.: limite de armazenamento do emulador)
      const motivo = /<Message>([\s\S]*?)<\/Message>/.exec(xhr.responseText ?? "")?.[1]?.replace(/&quot;/g, '"').replace(/&amp;/g, "&");
      reject(new Error(`O S3 recusou o envio (HTTP ${xhr.status})${motivo ? `: ${motivo}` : ""}`));
    };
    xhr.onerror = () => reject(new Error("Falha de rede no envio para o S3"));
    xhr.onabort = () => reject(new Error("Envio cancelado"));
    xhr.send(file);
  });
}
