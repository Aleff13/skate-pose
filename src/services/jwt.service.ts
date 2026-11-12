import { createLocalJWKSet, errors, jwtVerify, type JSONWebKeySet } from "jose";
import { resources } from "../infra/resources.js";
import { getJson } from "../utils/https-json.js";

type KeySet = ReturnType<typeof createLocalJWKSet>;
let cache: { issuer: string; keys: KeySet } | null = null;

async function keySet(forceRefresh = false): Promise<KeySet> {
  const { issuer } = resources.cognito;
  if (!forceRefresh && cache?.issuer === issuer) return cache.keys;
  const jwks = (await getJson(`${issuer}/.well-known/jwks.json`)) as JSONWebKeySet;
  cache = { issuer, keys: createLocalJWKSet(jwks) };
  return cache.keys;
}

async function verify(token: string, keys: KeySet) {
  return jwtVerify(token, keys, { issuer: resources.cognito.issuer });
}

/** Valida assinatura (JWKS do Cognito), emissor, expiração, tipo e app client. */
export async function verifyAccessToken(token: string): Promise<{ sub: string }> {
  let result;
  try {
    result = await verify(token, await keySet());
  } catch (err) {
    if (!(err instanceof errors.JWKSNoMatchingKey)) throw err;
    result = await verify(token, await keySet(true)); // chaves rotacionadas
  }
  const { payload } = result;
  if (payload.token_use !== "access") throw new Error("token_use inválido");
  if (payload.client_id !== resources.cognito.clientId) throw new Error("client_id inválido");
  if (!payload.sub) throw new Error("sub ausente");
  return { sub: payload.sub };
}
