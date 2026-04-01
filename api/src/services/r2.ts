import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { config } from "../config";

let client: S3Client | null = null;

const normalizeR2Key = (key: string): string => {
  const cleaned = key.replace(/^\/+/, "");
  if (cleaned.includes("/")) return cleaned;
  return cleaned.startsWith("audios/") ? cleaned : `audios/${cleaned}`;
};

const getClient = (): S3Client => {
  if (client) return client;
  if (
    !config.cloudflareAccountId ||
    !config.cloudflareAccessKeyId ||
    !config.cloudflareSecretAccessKey
  ) {
    throw new Error("Cloudflare R2 credentials not configured");
  }
  client = new S3Client({
    region: config.cloudflareR2Region ?? "auto",
    endpoint:
      config.cloudflareR2Endpoint ??
      `https://${config.cloudflareAccountId}.r2.cloudflarestorage.com`,
    forcePathStyle: true,
    credentials: {
      accessKeyId: config.cloudflareAccessKeyId,
      secretAccessKey: config.cloudflareSecretAccessKey,
    },
  });
  return client;
};

export async function uploadToR2(
  key: string,
  body: Buffer | Uint8Array,
  contentType: string,
): Promise<string> {
  const bucket = config.cloudflareBucketName;
  if (!bucket) throw new Error("CLOUDFLARE_BUCKET_NAME not configured");
  const normalizedKey = normalizeR2Key(key);

  try {
    await getClient().send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: normalizedKey,
        Body: body,
        ContentType: contentType,
      }),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const lowered = message.toLowerCase();
    if (lowered.includes("access denied") || lowered.includes("accessdenied")) {
      throw new Error(
        "Access Denied no R2: valide CLOUDFLARE_ACCESS_KEY_ID/CLOUDFLARE_SECRET_ACCESS_KEY, permissao Object Write no bucket e CLOUDFLARE_BUCKET_NAME.",
      );
    }
    throw error;
  }

  const publicUrl = config.cloudflarePublicUrl;
  if (publicUrl) {
    return `${publicUrl.replace(/\/+$/, "")}/${normalizedKey}`;
  }
  return `https://${config.cloudflareAccountId}.r2.cloudflarestorage.com/${bucket}/${normalizedKey}`;
}

export async function uploadFileToR2(
  key: string,
  body: Buffer | Uint8Array,
  contentType: string,
): Promise<string> {
  const bucket = config.cloudflareBucketName;
  if (!bucket) throw new Error("CLOUDFLARE_BUCKET_NAME not configured");

  try {
    await getClient().send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const lowered = message.toLowerCase();
    if (lowered.includes("access denied") || lowered.includes("accessdenied")) {
      throw new Error(
        "Access Denied no R2: valide CLOUDFLARE_ACCESS_KEY_ID/CLOUDFLARE_SECRET_ACCESS_KEY, permissao Object Write no bucket e CLOUDFLARE_BUCKET_NAME.",
      );
    }
    throw error;
  }

  const publicUrl = config.cloudflarePublicUrl;
  if (publicUrl) {
    return `${publicUrl.replace(/\/+$/, "")}/${key}`;
  }
  return `https://${config.cloudflareAccountId}.r2.cloudflarestorage.com/${bucket}/${key}`;
}

export interface R2StreamResult {
  body: ReadableStream;
  contentType: string;
  contentLength?: number;
}

export interface R2ObjectResult {
  body: Uint8Array;
  contentType: string;
  contentLength?: number;
}

export async function getStreamFromR2(key: string): Promise<R2StreamResult> {
  const bucket = config.cloudflareBucketName;
  if (!bucket) throw new Error("CLOUDFLARE_BUCKET_NAME not configured");

  const result = await getClient().send(
    new GetObjectCommand({ Bucket: bucket, Key: key }),
  );

  if (!result.Body) throw new Error("R2 returned empty body");

  const webStream = result.Body.transformToWebStream();
  return {
    body: webStream,
    contentType: result.ContentType ?? "application/octet-stream",
    contentLength: result.ContentLength,
  };
}

export async function getObjectFromR2(key: string): Promise<R2ObjectResult> {
  const bucket = config.cloudflareBucketName;
  if (!bucket) throw new Error("CLOUDFLARE_BUCKET_NAME not configured");

  const result = await getClient().send(
    new GetObjectCommand({ Bucket: bucket, Key: key }),
  );

  if (!result.Body) throw new Error("R2 returned empty body");

  return {
    body: await result.Body.transformToByteArray(),
    contentType: result.ContentType ?? "application/octet-stream",
    contentLength: result.ContentLength,
  };
}

export async function deleteFromR2(key: string): Promise<void> {
  const bucket = config.cloudflareBucketName;
  if (!bucket) throw new Error("CLOUDFLARE_BUCKET_NAME not configured");
  const normalizedKey = normalizeR2Key(key);

  await getClient().send(
    new DeleteObjectCommand({
      Bucket: bucket,
      Key: normalizedKey,
    }),
  );
}
