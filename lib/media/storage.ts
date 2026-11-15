import 'server-only';
import {
  S3Client, HeadObjectCommand, GetObjectCommand, CopyObjectCommand, DeleteObjectCommand
} from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { NookError } from '@/lib/nooks/errors';

export const UPLOAD_SECONDS = 120;
export function storageConfig() {
  const endpoint = process.env.NEON_STORAGE_ENDPOINT ?? process.env.AWS_ENDPOINT_URL_S3;
  const accessKeyId = process.env.NEON_STORAGE_ACCESS_KEY_ID ?? process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.NEON_STORAGE_SECRET_ACCESS_KEY ?? process.env.AWS_SECRET_ACCESS_KEY;
  const region = process.env.NEON_STORAGE_REGION ?? process.env.AWS_REGION ?? 'us-east-2';
  const bucket = process.env.SOLIBRA_MEDIA_BUCKET;
  const unavailable = () => { throw new NookError(503, 'INTERNAL_ERROR', 'Private Nook storage is not configured.'); };
  if (!endpoint || !accessKeyId || !secretAccessKey || bucket !== 'solibra-private' || region !== 'us-east-2') return unavailable();
  try {
    const url = new URL(endpoint);
    if (url.protocol !== 'https:' || !/^br-[a-z0-9-]+\.storage\.c-\d+\.us-east-2\.aws\.neon\.tech$/.test(url.hostname) ||
        url.username || url.password || url.port || url.search || url.hash || !['', '/'].includes(url.pathname)) return unavailable();
  } catch { return unavailable(); }
  return { endpoint, accessKeyId, secretAccessKey, region, bucket };
}
function client() {
  const config = storageConfig();
  return { bucket: config.bucket, s3: new S3Client({
    endpoint: config.endpoint, region: config.region, forcePathStyle: true,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    requestChecksumCalculation: 'WHEN_REQUIRED', maxAttempts: 1
  }) };
}
async function safely<T>(operation: () => Promise<T>): Promise<T> {
  try { return await operation(); } catch (error) {
    if (error instanceof NookError) throw error;
    const status = (error as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode;
    if (status === 404) throw new NookError(404, 'NOT_FOUND', 'Nook media not found.');
    // Do not propagate SDK errors, request URLs, signed fields, or credentials to logs.
    throw new NookError(503, 'INTERNAL_ERROR', 'Private Nook storage is unavailable. Retry later.');
  }
}
const sendOptions = () => ({ abortSignal: AbortSignal.timeout(15_000) });

export const storage = {
  async signUpload(key: string, contentType: string, byteSize: number) {
    return safely(async () => {
      const { s3, bucket } = client();
      return createPresignedPost(s3, {
        Bucket: bucket, Key: key, Expires: UPLOAD_SECONDS,
        Fields: { 'Content-Type': contentType, 'Cache-Control': 'private, no-store' },
        Conditions: [['content-length-range', byteSize, byteSize],
          ['eq', '$Content-Type', contentType], ['eq', '$Cache-Control', 'private, no-store']]
      });
    });
  },
  async head(key: string) {
    return safely(async () => {
      const { s3, bucket } = client();
      const row = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }), sendOptions());
      if (!Number.isSafeInteger(row.ContentLength) || !row.ContentLength || !row.ContentType) {
        throw new NookError(503, 'INTERNAL_ERROR', 'Private Nook media metadata is unavailable.');
      }
      return { byteSize: row.ContentLength, contentType: row.ContentType };
    });
  },
  async copy(source: string, destination: string) {
    return safely(async () => {
      const { s3, bucket } = client();
      // Preserve actual upload metadata; completion validates the copied snapshot.
      await s3.send(new CopyObjectCommand({
        Bucket: bucket, Key: destination,
        CopySource: `${bucket}/${source.split('/').map(encodeURIComponent).join('/')}`,
        MetadataDirective: 'COPY'
      }), sendOptions());
    });
  },
  async get(key: string, range?: string) {
    return safely(async () => {
      const { s3, bucket } = client();
      const row = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key, Range: range }), sendOptions());
      if (!row.Body) throw new NookError(503, 'INTERNAL_ERROR', 'Private Nook media is unavailable.');
      return row.Body.transformToWebStream();
    });
  },
  async remove(key: string) {
    return safely(async () => {
      const { s3, bucket } = client();
      await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }), sendOptions());
    });
  }
};
