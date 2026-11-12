import https from "node:https";
import { trustedCa as ca } from "./ca.js";

/** GET JSON confiando no CA do emulador (o fetch do Node não usa AWS_CA_BUNDLE). */
export function getJson(url: string): Promise<unknown> {
  if (!ca) return fetch(url).then((r) => r.json());
  return new Promise((resolve, reject) => {
    https
      .get(url, { ca }, (res) => {
        let body = "";
        res.on("data", (d) => (body += d));
        res.on("end", () => {
          if ((res.statusCode ?? 500) >= 400) return reject(new Error(`GET ${url} -> ${res.statusCode}`));
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            reject(e);
          }
        });
      })
      .on("error", reject);
  });
}
