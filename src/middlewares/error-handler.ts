import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

// Erros do Cognito -> HTTP
const COGNITO: Record<string, number> = {
  NotAuthorizedException: 401,
  UserNotFoundException: 401, // não revela se o usuário existe
  UserNotConfirmedException: 403,
  UsernameExistsException: 409,
  InvalidPasswordException: 400,
  InvalidParameterException: 400,
  ValidationException: 400, // DynamoDB: ex.: cursor de paginação adulterado
  CodeMismatchException: 400,
  ExpiredCodeException: 400,
  TooManyRequestsException: 429,
  LimitExceededException: 429,
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) return void res.status(err.status).json({ error: err.message });
  if (err instanceof ZodError) {
    return void res.status(400).json({ error: "Requisição inválida", issues: err.issues });
  }
  // body-parser (ex.: JSON malformado -> 400, corpo grande demais -> 413): erro do cliente, não do servidor
  const clientStatus = (err as { status?: unknown; type?: unknown }).status;
  if (typeof clientStatus === "number" && clientStatus >= 400 && clientStatus < 500 && (err as { type?: unknown }).type) {
    return void res.status(clientStatus).json({ error: "Corpo da requisição inválido" });
  }
  const status = COGNITO[(err as { name?: string }).name ?? ""];
  if (status) return void res.status(status).json({ error: (err as Error).message });
  console.error(err);
  res.status(500).json({ error: "Erro interno" });
};
