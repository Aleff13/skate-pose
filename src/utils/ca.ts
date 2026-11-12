import { readFileSync } from "node:fs";

/** Certificado do emulador (AWS_CA_BUNDLE), se houver. */
export const trustedCa = process.env.AWS_CA_BUNDLE ? readFileSync(process.env.AWS_CA_BUNDLE) : undefined;
