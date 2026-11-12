import { createReadStream, createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import type { Readable } from "node:stream";
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { awsClientConfig } from "../config/aws.js";
import { env } from "../config/env.js";

// WHEN_REQUIRED: sem isso o SDK embute checksum nas URLs pré-assinadas e o PUT do navegador quebra.
const s3 = new S3Client({
  ...awsClientConfig,
  forcePathStyle: env.S3_FORCE_PATH_STYLE,
  requestChecksumCalculation: "WHEN_REQUIRED",
});

/**
 * Dev: o emulador não responde preflight CORS (501) e usa certificado autoassinado, então o
 * navegador não consegue falar com ele. Reescrevemos as URLs pré-assinadas para um proxy da
 * própria API (/_s3). Em produção as URLs vão direto para o S3.
 */
export const s3Endpoint = process.env.AWS_ENDPOINT_URL?.replace(/\/$/, "");
export const s3ProxyEnabled = env.NODE_ENV !== "production" && !!s3Endpoint;
export const S3_PROXY_PREFIX = "/_s3";
const forBrowser = (url: string) =>
  s3ProxyEnabled && url.startsWith(s3Endpoint!) ? S3_PROXY_PREFIX + url.slice(s3Endpoint!.length) : url;

export const storageService = {
  /** Cria o bucket se não existir. O emulador perde tudo ao reiniciar, então isso roda no boot (fora de produção). */
  async ensureBucket() {
    try {
      await s3.send(new HeadBucketCommand({ Bucket: env.S3_BUCKET }));
    } catch (err) {
      if ((err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode !== 404) throw err;
      await s3.send(new CreateBucketCommand({ Bucket: env.S3_BUCKET }));
      console.log(`[s3] bucket '${env.S3_BUCKET}' criado`);
    }
  },

  async uploadFile(key: string, filePath: string, contentType: string) {
    await new Upload({
      client: s3,
      params: { Bucket: env.S3_BUCKET, Key: key, Body: createReadStream(filePath), ContentType: contentType },
    }).done();
  },

  async downloadToFile(key: string, destPath: string) {
    const res = await s3.send(new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
    await pipeline(res.Body as Readable, createWriteStream(destPath));
  },

  async presignedGetUrl(key: string, expiresInSec = 900) {
    return forBrowser(
      await getSignedUrl(s3, new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key }), { expiresIn: expiresInSec }),
    );
  },

  async presignedPutUrl(key: string, contentType: string, expiresInSec = 900) {
    return forBrowser(
      await getSignedUrl(s3, new PutObjectCommand({ Bucket: env.S3_BUCKET, Key: key, ContentType: contentType }), {
        expiresIn: expiresInSec,
      }),
    );
  },

  /** Metadados do objeto, ou null se ele ainda não existe. */
  async head(key: string): Promise<{ size: number; contentType: string | undefined } | null> {
    try {
      const r = await s3.send(new HeadObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
      return { size: r.ContentLength ?? 0, contentType: r.ContentType };
    } catch (err) {
      const status = (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
      if (status === 404) return null;
      throw err;
    }
  },

  async remove(key: string) {
    await s3.send(new DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
  },
};
