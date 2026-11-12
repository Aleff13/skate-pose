import http from "node:http";
import https from "node:https";
import type { RequestHandler } from "express";
import { env } from "../config/env.js";
import { s3Endpoint } from "../services/storage.service.js";
import { trustedCa } from "../utils/ca.js";

/**
 * SÓ DESENVOLVIMENTO. Repassa GET/HEAD/PUT de /_s3/<bucket>/... ao emulador de S3.
 * Não autentica: quem autoriza é a assinatura da URL pré-assinada (query string), que o
 * emulador valida. Fica restrito ao bucket configurado e é desligado em produção (ver app.ts).
 */
export const s3DevProxy: RequestHandler = (req, res) => {
  if (!["GET", "HEAD", "PUT"].includes(req.method)) return void res.status(405).end();
  if (!req.url.startsWith(`/${env.S3_BUCKET}/`)) return void res.status(404).end();

  const target = new URL(s3Endpoint!);
  const isHttps = target.protocol === "https:";

  // Origin/Referer fariam o emulador aplicar regra de CORS (e devolver 403); o host precisa ser o assinado.
  const headers = { ...req.headers, host: target.host };
  delete headers.origin;
  delete headers.referer;

  const upstream = (isHttps ? https : http).request(
    {
      hostname: target.hostname,
      port: target.port || (isHttps ? 443 : 80),
      path: req.url,
      method: req.method,
      headers,
      ...(isHttps && trustedCa ? { ca: trustedCa } : {}),
    },
    (up) => {
      res.writeHead(up.statusCode ?? 502, up.headers);
      up.pipe(res);
    },
  );
  upstream.on("error", (err) => {
    console.error("[s3-proxy]", err.message);
    if (!res.headersSent) res.status(502).json({ error: "Falha ao falar com o S3" });
    else res.destroy();
  });
  req.on("aborted", () => upstream.destroy());
  req.pipe(upstream);
};
