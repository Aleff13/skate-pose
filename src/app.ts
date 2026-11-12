import path from "node:path";
import express from "express";
import { errorHandler } from "./middlewares/error-handler.js";
import { s3DevProxy } from "./middlewares/s3-dev-proxy.js";
import { authRouter } from "./routes/auth.routes.js";
import { videosRouter } from "./routes/videos.routes.js";
import { S3_PROXY_PREFIX, s3ProxyEnabled } from "./services/storage.service.js";

export const app = express();

// Antes do express.json(): o corpo do upload (vídeo) é repassado em stream, sem ser lido.
if (s3ProxyEnabled) app.use(S3_PROXY_PREFIX, s3DevProxy);

app.use(express.json());
app.use(express.static(path.join(import.meta.dirname, "../public")));
app.get("/health", (_req, res) => void res.json({ status: "ok" }));
app.use("/auth", authRouter);
app.use("/videos", videosRouter);
app.use(errorHandler);
