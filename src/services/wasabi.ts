import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const bucket = process.env.AWS_S3_BUCKET_NAME;
const region = process.env.AWS_S3_REGION;
const endpoint = process.env.AWS_S3_ENDPOINT;
const accessKeyId = process.env.AWS_S3_ACCESS_KEY_ID;
const secretAccessKey = process.env.AWS_S3_SECRET_ACCESS_KEY;

const client =
  bucket && region && accessKeyId && secretAccessKey
    ? new S3Client({
        region,
        credentials: { accessKeyId, secretAccessKey },
        ...(endpoint ? { endpoint } : {}),
        forcePathStyle: true,
        requestChecksumCalculation: 'WHEN_REQUIRED',
        responseChecksumValidation: 'WHEN_REQUIRED',
      })
    : null;

export function isWasabiConfigured(): boolean {
  return client !== null;
}

export function getWasabiPublicUrl(key: string): string | null {
  if (!bucket || !region) return null;
  return `https://s3.${region}.wasabisys.com/${bucket}/${key}`;
}

export async function createPresignedUploadUrl(
  key: string,
  contentType = 'application/octet-stream',
  expiresIn = 900,
): Promise<string> {
  if (!client || !bucket) throw new Error('Wasabi client not configured');
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType,
  });
  return getSignedUrl(client, command, { expiresIn });
}

export async function createPresignedReadUrl(
  key: string,
  expiresIn = 3600,
): Promise<string> {
  if (!client || !bucket) throw new Error('Wasabi client not configured');
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
  });
  return getSignedUrl(client, command, { expiresIn });
}

/**
 * Extract the S3 key from a stored URL or raw key.
 * Handles both path-style and virtual-hosted-style URLs.
 */
export function extractKeyFromUrl(urlOrKey: string): string {
  if (!urlOrKey.startsWith('http')) return urlOrKey;
  try {
    const url = new URL(urlOrKey);
    // Path-style: /bucket/key or just /key
    const pathParts = url.pathname.split('/').filter(Boolean);
    if (pathParts[0] === bucket) {
      return pathParts.slice(1).join('/');
    }
    return pathParts.join('/');
  } catch {
    return urlOrKey;
  }
}

export async function deleteFromWasabi(key: string): Promise<void> {
  if (!client || !bucket) throw new Error('Wasabi client not configured');
  const normalized = key.startsWith('http')
    ? key.split('/').slice(3).join('/')
    : key;
  const command = new DeleteObjectCommand({
    Bucket: bucket,
    Key: normalized,
  });
  await client.send(command);
}
