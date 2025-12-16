import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET;

// Encode (store safely in DB)
export function encodeData(data: string) {
  return jwt.sign({ data }, JWT_SECRET);
}

// Decode (retrieve original value)
export function decodeData(token: string) {
  const decoded = jwt.verify(token, JWT_SECRET) as { data: string };
  return decoded.data;
}

// Encode multiple credentials
export function encodeCredentials(
  apiKey: string,
  apiSecret: string,
  apiPassphrase?: string,
  apiKeyVersion?: string
) {
  return {
    apiKey: encodeData(apiKey),
    apiSecret: encodeData(apiSecret),
    apiPassphrase: apiPassphrase ? encodeData(apiPassphrase) : undefined,
    apiKeyVersion,
  };
}

// Decode multiple credentials
export function decodeCredentials(
  apiKey: string,
  apiSecret: string,
  apiPassphrase: string,
  apiKeyVersion: string
) {
  return {
    apiKey: decodeData(apiKey),
    apiSecret: decodeData(apiSecret),
    apiPassphrase: apiPassphrase ? decodeData(apiPassphrase) : undefined,
    apiKeyVersion,
  };
}
