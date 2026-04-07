const CLIENT_KEY_PATTERN = /(live_ck_[A-Za-z0-9]+|test_ck_[A-Za-z0-9]+)/g;
const SECRET_KEY_PATTERN = /(live_sk_[A-Za-z0-9]+|test_sk_[A-Za-z0-9]+)/g;

function getLastMatchedKey(
  rawValue: string | undefined,
  envName: string,
  pattern: RegExp
) {
  const value = rawValue?.trim();

  if (!value) {
    throw new Error(`${envName} 없음`);
  }

  const matches = value.match(pattern);

  if (!matches?.length) {
    throw new Error(`${envName} 형식 오류`);
  }

  return matches[matches.length - 1];
}

export function getNormalizedTossClientKey(rawValue: string | undefined) {
  return getLastMatchedKey(
    rawValue,
    "NEXT_PUBLIC_TOSS_CLIENT_KEY",
    CLIENT_KEY_PATTERN
  );
}

export function getNormalizedTossSecretKey(rawValue: string | undefined) {
  return getLastMatchedKey(rawValue, "TOSS_SECRET_KEY", SECRET_KEY_PATTERN);
}
