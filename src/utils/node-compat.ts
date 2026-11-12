/**
 * @tensorflow/tfjs-node 4.x chama helpers de `util` removidos no Node 23+
 * (ex.: util.isNullOrUndefined). Recolocamos antes do tfjs ser carregado.
 * Este módulo precisa ser o PRIMEIRO import de quem usa tfjs-node.
 */
import util from "node:util";

const compat = util as unknown as Record<string, unknown>;
const shims: Record<string, (v: unknown) => boolean> = {
  isNull: (v) => v === null,
  isUndefined: (v) => v === undefined,
  isNullOrUndefined: (v) => v === null || v === undefined,
  isNumber: (v) => typeof v === "number",
  isString: (v) => typeof v === "string",
  isBoolean: (v) => typeof v === "boolean",
  isSymbol: (v) => typeof v === "symbol",
  isFunction: (v) => typeof v === "function",
  isObject: (v) => v !== null && typeof v === "object",
  isPrimitive: (v) => v === null || (typeof v !== "object" && typeof v !== "function"),
};
for (const [name, fn] of Object.entries(shims)) compat[name] ??= fn;
