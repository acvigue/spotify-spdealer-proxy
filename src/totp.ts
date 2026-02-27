interface SpotifyTOTPSecretItem {
  [version: string]: number[];
}

const getSpotifyTOTPSecret = async () => {
  const url = 'https://git.gay/thereallo/totp-secrets/raw/branch/main/secrets/secretDict.json';
  const resp = await fetch(url);
  if (resp.status !== 200) {
    throw new Error(`Failed to fetch Spotify TOTP secret (${resp.status})`);
  }
  const data: SpotifyTOTPSecretItem = await resp.json();

  let latestVersion = -1;
  let latestItem: { version: string, secret: number[] } | null = null;
  for (const key of Object.keys(data)) {
    const version = parseInt(key);
    if (version > latestVersion) {
      latestVersion = version;
      latestItem = { version: key, secret: data[key] };
    }
  }

  if (!latestItem) {
    throw new Error("No valid Spotify TOTP secret found");
  }

  return latestItem;
};

const base32Encode = (bytes: Uint8Array): string => {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let result = '';
  let bits = 0;
  let value = 0;

  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;

    while (bits >= 5) {
      result += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    result += alphabet[(value << (5 - bits)) & 31];
  }

  while (result.length % 8 !== 0) {
    result += '=';
  }

  return result;
};

const base32Decode = (encoded: string): Uint8Array => {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let value = 0;
  const output: number[] = [];

  for (const char of encoded.toUpperCase()) {
    if (char === '=') break;

    const index = alphabet.indexOf(char);
    if (index === -1) throw new Error('Invalid base32 character');

    value = (value << 5) | index;
    bits += 5;

    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return new Uint8Array(output);
};

const processSecret = (cipherBytes: number[]): Uint8Array => {
  const transformed = cipherBytes.map((e, t) => e ^ ((t % 33) + 9));
  const joined = transformed.map(num => num.toString()).join('');

  const encoder = new TextEncoder();
  const utf8Bytes = encoder.encode(joined);
  const hexStr = Array.from(utf8Bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  const hexBytes: number[] = [];
  for (let i = 0; i < hexStr.length; i += 2) {
    hexBytes.push(parseInt(hexStr.substr(i, 2), 16));
  }

  const secret = base32Encode(new Uint8Array(hexBytes)).replace(/=+$/, '');
  return base32Decode(secret);
};

const generateTOTP = async (cipherBytes: number[], timeStep: number = 30, digits: number = 6): Promise<string> => {
  const key = processSecret(cipherBytes);

  const time = Math.floor(Date.now() / 1000 / timeStep);

  const timeBuffer = new ArrayBuffer(8);
  const timeView = new DataView(timeBuffer);
  timeView.setUint32(4, time, false);

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key,
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('HMAC', cryptoKey, timeBuffer);
  const hmac = new Uint8Array(signature);

  const offset = hmac[hmac.length - 1] & 0x0f;
  const truncated = (
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff)
  ) >>> 0;

  const otp = (truncated % Math.pow(10, digits)).toString().padStart(digits, '0');
  return otp;
};

export const getSpotifyTOTP = async () => {
  const { secret, version } = await getSpotifyTOTPSecret();
  return {
    totp: await generateTOTP(secret, 30, 6),
    version
  };
};
