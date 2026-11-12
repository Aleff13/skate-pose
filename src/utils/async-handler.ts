import type { RequestHandler } from "express";

// Garante que rejeições de handlers async cheguem ao errorHandler.
export const wrap =
  (fn: (...a: Parameters<RequestHandler>) => Promise<unknown>): RequestHandler =>
  (req, res, next) =>
    void fn(req, res, next).catch(next);
