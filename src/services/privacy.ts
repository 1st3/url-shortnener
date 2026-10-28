export function sanitizeReferrer(referrerHeader?: string): string | null {
  if (!referrerHeader) return null;
  try {
    const url = new URL(referrerHeader);
    return `${url.origin}${url.pathname}`.slice(0, 255);
  } catch {
    // If not a valid parseable URL, return stripped/truncated string
    return referrerHeader.split('?')[0].slice(0, 255);
  }
}

export function sanitizeUserAgent(userAgentHeader?: string): string | null {
  if (!userAgentHeader) return null;
  return userAgentHeader.slice(0, 128);
}

export function extractCountry(cfCountryHeader?: string | string[]): string | null {
  if (!cfCountryHeader) return null;
  const value = Array.isArray(cfCountryHeader) ? cfCountryHeader[0] : cfCountryHeader;
  if (!value || value.length > 10) return null;
  return value.toUpperCase();
}
