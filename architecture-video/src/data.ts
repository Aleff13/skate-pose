export const FPS = 30;
export const WIDTH = 1920;
export const HEIGHT = 1080;

export type NodeId = "browser" | "api" | "cognito" | "ddb" | "s3" | "sqs" | "worker";
export type EdgeId = "b_a" | "a_cog" | "a_ddb" | "a_s3" | "a_sqs" | "w_sqs" | "w_s3" | "w_ddb";
export type P = [number, number];
export type Hsl = [number, number, number];

export const hsl = ([h, s, l]: Hsl, f = 1, a = 1) => `hsl(${h} ${s}% ${Math.min(96, l * f)}% / ${a})`;

export const R = 78; // raio dos nós

export interface NodeDef {
  id: NodeId;
  pos: P;
  color: Hsl;
  name: string;
  sub: string;
  label: "above" | "below" | "right";
}

export const NODES: NodeDef[] = [
  { id: "browser", pos: [200, 450], color: [211, 100, 66], name: "Navegador", sub: "HTML · CSS · JS puro", label: "below" },
  { id: "api", pos: [620, 450], color: [158, 64, 50], name: "API", sub: "Node.js · Express 5 · TypeScript", label: "below" },
  { id: "cognito", pos: [1130, 300], color: [2, 100, 70], name: "Cognito", sub: "JWT RS256 · JWKS", label: "above" },
  { id: "s3", pos: [1620, 300], color: [40, 100, 55], name: "S3", sub: "raw/ · processed/", label: "above" },
  { id: "ddb", pos: [1130, 640], color: [239, 100, 76], name: "DynamoDB", sub: "videos · GSI byOwner", label: "right" },
  { id: "sqs", pos: [1620, 640], color: [330, 86, 68], name: "SQS", sub: "fila + DLQ", label: "below" },
  { id: "worker", pos: [1380, 900], color: [188, 86, 52], name: "Worker", sub: "MoveNet · ffmpeg · canvas", label: "below" },
];
export const node = (id: NodeId) => NODES.find((n) => n.id === id)!;

export interface EdgeDef {
  id: EdgeId;
  from: NodeId;
  to: NodeId;
  ctrl: P;
}
export const EDGES: EdgeDef[] = [
  { id: "b_a", from: "browser", to: "api", ctrl: [410, 450] },
  { id: "a_cog", from: "api", to: "cognito", ctrl: [870, 330] },
  { id: "a_ddb", from: "api", to: "ddb", ctrl: [880, 600] },
  { id: "a_s3", from: "api", to: "s3", ctrl: [1100, 450] },
  { id: "a_sqs", from: "api", to: "sqs", ctrl: [1130, 450] },
  { id: "w_sqs", from: "worker", to: "sqs", ctrl: [1540, 820] },
  { id: "w_s3", from: "worker", to: "s3", ctrl: [2100, 620] },
  { id: "w_ddb", from: "worker", to: "ddb", ctrl: [1190, 830] },
];
export const edge = (id: EdgeId) => EDGES.find((e) => e.id === id)!;

/** Um pacote viajando por uma aresta. `at`/`dur` em frames, relativos ao início do passo. */
export interface Leg {
  edge: EdgeId;
  rev?: boolean; // percorre da ponta `to` para a ponta `from`
  at: number;
  dur: number;
  label: string;
  tone?: NodeId; // cor do pacote (padrão: origem)
}

export interface Step {
  title: string;
  desc: string;
  code: string;
  nodes: NodeId[];
  dur: number;
  legs: Leg[];
  pipeline?: boolean;
}

export const STEPS: Step[] = [
  {
    title: "Entrar na conta",
    desc: "O navegador envia e-mail e senha à API, que autentica no Cognito. O Cognito devolve tokens JWT (RS256); a API valida assinatura, emissor e client_id a cada chamada.",
    code: "POST /auth/login → InitiateAuth",
    nodes: ["browser", "api", "cognito"],
    dur: 180,
    legs: [
      { edge: "b_a", at: 0, dur: 40, label: "POST /auth/login" },
      { edge: "a_cog", at: 40, dur: 40, label: "InitiateAuth" },
      { edge: "a_cog", rev: true, at: 90, dur: 40, label: "JWT · access + refresh" },
      { edge: "b_a", rev: true, at: 130, dur: 40, label: "accessToken", tone: "cognito" },
    ],
  },
  {
    title: "Registrar o vídeo",
    desc: "O navegador pede para enviar um vídeo. A API cria o registro no DynamoDB (pending_upload) e devolve uma URL pré-assinada de PUT, válida por 15 minutos.",
    code: "POST /videos → PutItem + presign PUT",
    nodes: ["browser", "api", "ddb"],
    dur: 170,
    legs: [
      { edge: "b_a", at: 0, dur: 40, label: "POST /videos {nome, tipo, tamanho}" },
      { edge: "a_ddb", at: 40, dur: 40, label: "PutItem · pending_upload" },
      { edge: "b_a", rev: true, at: 100, dur: 50, label: "URL pré-assinada (PUT)", tone: "s3" },
    ],
  },
  {
    title: "Enviar direto ao S3",
    desc: "O arquivo vai por PUT na URL pré-assinada, com barra de progresso. Em dev, um proxy da API repassa ao emulador; em produção o PUT vai direto ao S3.",
    code: "PUT raw/<usuário>/<id>.mov",
    nodes: ["browser", "api", "s3"],
    dur: 170,
    legs: [
      { edge: "b_a", at: 0, dur: 65, label: "PUT /_s3/… (proxy de dev)" },
      { edge: "a_s3", at: 60, dur: 65, label: "PUT raw/<usuário>/<id>.mov", tone: "browser" },
    ],
  },
  {
    title: "Confirmar o envio",
    desc: "A API confere no S3 se o arquivo chegou e qual o tamanho real, e só então marca o vídeo como uploaded no DynamoDB.",
    code: "POST /videos/:id/complete → HeadObject",
    nodes: ["browser", "api", "s3", "ddb"],
    dur: 180,
    legs: [
      { edge: "b_a", at: 0, dur: 35, label: "POST /videos/:id/complete" },
      { edge: "a_s3", at: 35, dur: 40, label: "HeadObject (tamanho real)" },
      { edge: "a_ddb", at: 80, dur: 40, label: "status: uploaded" },
      { edge: "b_a", rev: true, at: 130, dur: 40, label: "200 · Enviado", tone: "api" },
    ],
  },
  {
    title: "Clicar em Processar",
    desc: "A transição uploaded → queued é atômica (condicional no DynamoDB), então não há fila duplicada. A API publica {videoId} no SQS e responde 202.",
    code: "POST /videos/:id/process → SendMessage",
    nodes: ["browser", "api", "ddb", "sqs"],
    dur: 180,
    legs: [
      { edge: "b_a", at: 0, dur: 35, label: "POST /videos/:id/process" },
      { edge: "a_ddb", at: 35, dur: 40, label: "uploaded → queued (atômico)" },
      { edge: "a_sqs", at: 80, dur: 50, label: "SendMessage {videoId}" },
      { edge: "b_a", rev: true, at: 140, dur: 35, label: "202 · Na fila", tone: "api" },
    ],
  },
  {
    title: "O worker pega o trabalho",
    desc: "O worker faz long polling no SQS, marca processing no DynamoDB e baixa o vídeo bruto do S3. Se falhar 3 vezes, a mensagem vai para a DLQ.",
    code: "ReceiveMessage → GetObject",
    nodes: ["worker", "sqs", "ddb", "s3"],
    dur: 190,
    legs: [
      { edge: "w_sqs", rev: true, at: 0, dur: 55, label: "ReceiveMessage (long poll 20 s)" },
      { edge: "w_ddb", at: 60, dur: 40, label: "status: processing" },
      { edge: "w_s3", rev: true, at: 110, dur: 65, label: "GetObject · vídeo bruto" },
    ],
  },
  {
    title: "Pose e esqueleto",
    desc: "O ffmpeg extrai os quadros, o MoveNet (TensorFlow.js) estima as articulações, o canvas desenha o esqueleto e o ffmpeg remonta em H.264. O resultado volta ao S3.",
    code: "PutObject processed/<id>.mp4",
    nodes: ["worker", "s3", "ddb", "sqs"],
    dur: 230,
    pipeline: true,
    legs: [
      { edge: "w_s3", at: 120, dur: 50, label: "PutObject processed/<id>.mp4" },
      { edge: "w_ddb", at: 165, dur: 30, label: "status: processed" },
      { edge: "w_sqs", at: 195, dur: 30, label: "DeleteMessage" },
    ],
  },
  {
    title: "Assistir o resultado",
    desc: "O navegador consulta o status a cada 3 s. Quando vira processed, pede URLs pré-assinadas de leitura e toca o vídeo com o esqueleto no player.",
    code: "GET /videos → GET /_s3/…/processed.mp4",
    nodes: ["browser", "api", "ddb", "s3"],
    dur: 270,
    legs: [
      { edge: "b_a", at: 0, dur: 30, label: "GET /videos (polling 3 s)" },
      { edge: "a_ddb", at: 30, dur: 30, label: "Query GSI byOwner" },
      { edge: "a_ddb", rev: true, at: 65, dur: 30, label: "status: processed" },
      { edge: "b_a", rev: true, at: 100, dur: 35, label: "status + URLs assinadas", tone: "api" },
      { edge: "b_a", at: 145, dur: 30, label: "GET /_s3/…/processed.mp4" },
      { edge: "a_s3", at: 175, dur: 30, label: "GET (Range)", tone: "browser" },
      { edge: "a_s3", rev: true, at: 205, dur: 30, label: "bytes do vídeo" },
      { edge: "b_a", rev: true, at: 235, dur: 30, label: "▶ vídeo com esqueleto", tone: "s3" },
    ],
  },
];

export const PIPELINE = ["ffprobe", "frames · ffmpeg", "MoveNet", "esqueleto · canvas", "H.264 · ffmpeg"];

export const INTRO = 120;
export const OVERVIEW = 240;
export const OUTRO = 210;
export const STEP_START: number[] = [];
{
  let t = INTRO + OVERVIEW;
  for (const s of STEPS) {
    STEP_START.push(t);
    t += s.dur;
  }
}
export const OUTRO_START = STEP_START[STEPS.length - 1]! + STEPS[STEPS.length - 1]!.dur;
export const TOTAL = OUTRO_START + OUTRO;

export const quad = (p0: P, c: P, p1: P, t: number): P => {
  const u = 1 - t;
  return [u * u * p0[0] + 2 * u * t * c[0] + t * t * p1[0], u * u * p0[1] + 2 * u * t * c[1] + t * t * p1[1]];
};

export const STACK = [
  { title: "Frontend", color: [211, 100, 66] as Hsl, items: ["HTML · CSS · JS vanilla", "Upload por XHR com progresso", "Player com Original / Esqueleto"] },
  { title: "Backend", color: [158, 64, 50] as Hsl, items: ["Node.js 24 · Express 5", "TypeScript · Zod", "jose (validação de JWT)"] },
  { title: "AWS (emulado)", color: [40, 100, 55] as Hsl, items: ["Cognito · autenticação", "DynamoDB · metadados", "S3 · URLs pré-assinadas", "SQS + DLQ · fila"] },
  { title: "Processamento", color: [188, 86, 52] as Hsl, items: ["Worker separado da API", "TensorFlow.js · MoveNet", "ffmpeg · @napi-rs/canvas"] },
];
