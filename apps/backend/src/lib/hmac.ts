import { Buffer } from "node:buffer";
import { createHmac, timingSafeEqual } from "node:crypto";

const DEFAULT_TOLERANCE_SECONDS = 300;

export function signPayload(secret: string, timestamp: string, rawBody: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
}

export function verifySignature(
  secret: string,
  timestamp: string,
  rawBody: string,
  signature: string,
  toleranceSeconds: number = DEFAULT_TOLERANCE_SECONDS,
): boolean {
  if (!/^\d+$/.test(timestamp)) {
    return false;
  }

  const timestampSeconds = Number(timestamp);
  if (!Number.isSafeInteger(timestampSeconds)) {
    return false;
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSeconds - timestampSeconds) > toleranceSeconds) {
    return false;
  }

  const expected = signPayload(secret, timestamp, rawBody);
  if (signature.length !== expected.length || !/^[0-9a-f]+$/i.test(signature)) {
    return false;
  }

  const expectedBytes = Buffer.from(expected, "hex");
  const signatureBytes = Buffer.from(signature, "hex");
  if (expectedBytes.length !== signatureBytes.length) {
    return false;
  }

  return timingSafeEqual(expectedBytes, signatureBytes);
}
