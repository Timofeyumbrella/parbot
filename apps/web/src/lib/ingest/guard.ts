/**
 * Keeps the crawler on the public internet. What it fetches becomes readable through chat, so a
 * start page, a link or a redirect must never point the server at itself, at a neighbour on the
 * private network or at a cloud metadata service. Hostnames are checked first, then every
 * address the name resolves to.
 */
import { lookup as dnsLookup } from 'node:dns/promises';
import { isIP } from 'node:net';

/** Every address a hostname resolves to. Injected by tests, which serve fake hosts. */
export type HostLookup = (hostname: string) => Promise<string[]>;

export const defaultLookup: HostLookup = async (hostname) =>
  (await dnsLookup(hostname, { all: true, verbatim: true })).map((entry) => entry.address);

/** Resolves ordinary public addresses for any name; for tests that serve fake hosts. */
export const publicLookup: HostLookup = () => Promise.resolve(['93.184.216.34']);

export class BlockedHostError extends Error {
  readonly hostname: string;

  constructor(hostname: string, reason: string) {
    super(reason);
    this.name = 'BlockedHostError';
    this.hostname = hostname;
  }
}

export const BLOCKED_REASON = 'the address points at a private or internal network';
export const UNRESOLVED_REASON = 'the host could not be found';

const BLOCKED_HOSTNAMES = new Set(['localhost', 'ip6-localhost', 'ip6-loopback', 'metadata', 'metadata.google.internal']);
const BLOCKED_SUFFIXES = ['.localhost', '.local', '.internal', '.localdomain', '.home.arpa', '.arpa'];

const parseIpv4 = (text: string): number[] | null => {
  const parts = text.split('.');

  if (parts.length !== 4) {
    return null;
  }

  const octets = parts.map((part) => (/^\d{1,3}$/.test(part) ? Number(part) : -1));

  return octets.every((octet) => octet >= 0 && octet <= 255) ? octets : null;
};

/** Eight 16-bit groups, with an embedded IPv4 tail folded into the last two. */
const parseIpv6 = (text: string): number[] | null => {
  let ip = text.split('%')[0]!;
  const lastColon = ip.lastIndexOf(':');

  if (lastColon !== -1 && ip.slice(lastColon + 1).includes('.')) {
    const tail = parseIpv4(ip.slice(lastColon + 1));

    if (!tail) {
      return null;
    }

    const [a, b, c, d] = tail as [number, number, number, number];

    ip = `${ip.slice(0, lastColon + 1)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }

  const halves = ip.split('::');

  if (halves.length > 2) {
    return null;
  }

  const groupsOf = (part: string) => (part === '' ? [] : part.split(':').map((group) => (/^[0-9a-f]{1,4}$/i.test(group) ? Number.parseInt(group, 16) : -1)));
  const head = groupsOf(halves[0]!);
  const tail = halves.length === 2 ? groupsOf(halves[1]!) : [];

  if ([...head, ...tail].some((group) => group < 0)) {
    return null;
  }

  const missing = 8 - head.length - tail.length;

  if (missing < 0 || (halves.length === 1 && missing !== 0)) {
    return null;
  }

  return [...head, ...new Array<number>(missing).fill(0), ...tail];
};

const isBlockedIpv4 = ([a, b, c]: number[]) =>
  a === 0 || // "this" network
  a === 10 || // private
  a === 127 || // loopback
  (a === 100 && b! >= 64 && b! <= 127) || // carrier-grade NAT
  (a === 169 && b === 254) || // link-local, where cloud metadata lives
  (a === 172 && b! >= 16 && b! <= 31) || // private
  (a === 192 && b === 168) || // private
  (a === 192 && b === 0 && (c === 0 || c === 2)) || // IETF assignments, TEST-NET-1
  (a === 198 && (b === 18 || b === 19)) || // benchmarking
  (a === 198 && b === 51 && c === 100) || // TEST-NET-2
  (a === 203 && b === 0 && c === 113) || // TEST-NET-3
  a! >= 224; // multicast, reserved, broadcast

const isBlockedIpv6 = (groups: number[]) => {
  const [g0, g1, g2, g3, g4, g5, g6, g7] = groups as [number, number, number, number, number, number, number, number];
  const embeddedIpv4 = [g6 >> 8, g6 & 0xff, g7 >> 8, g7 & 0xff];

  if (g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0) {
    // ::, ::1, IPv4-compatible and IPv4-mapped (::ffff:a.b.c.d) addresses.
    return g5 === 0xffff ? isBlockedIpv4(embeddedIpv4) : true;
  }

  if (g0 === 0x64 && g1 === 0xff9b && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0) {
    // NAT64 (64:ff9b::/96) reaches IPv4 through a translator.
    return isBlockedIpv4(embeddedIpv4);
  }

  return (
    (g0 & 0xfe00) === 0xfc00 || // unique local
    (g0 & 0xffc0) === 0xfe80 || // link-local
    (g0 & 0xff00) === 0xff00 || // multicast
    (g0 === 0x2001 && g1 === 0x0db8) // documentation
  );
};

/** True for loopback, private, link-local, multicast and otherwise reserved addresses. */
export const isBlockedAddress = (address: string) => {
  const version = isIP(address);

  if (version === 4) {
    const octets = parseIpv4(address);

    return octets ? isBlockedIpv4(octets) : true;
  }

  if (version === 6) {
    const groups = parseIpv6(address);

    return groups ? isBlockedIpv6(groups) : true;
  }

  return true;
};

/** True for names that only ever mean "this machine" or "this network". */
export const isBlockedHostname = (hostname: string) => {
  const name = hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '').toLowerCase();

  if (!name || BLOCKED_HOSTNAMES.has(name) || BLOCKED_SUFFIXES.some((suffix) => name.endsWith(suffix))) {
    return true;
  }

  return isIP(name) !== 0 && isBlockedAddress(name);
};

/**
 * Throws a BlockedHostError unless the URL's host is a public name resolving only to public
 * addresses. Every address is checked: a name that mixes a public and a private answer is refused.
 */
export const assertPublicUrl = async (url: string, lookup: HostLookup = defaultLookup) => {
  let parsed: URL;

  try {
    parsed = new URL(url);
  } catch {
    throw new BlockedHostError(url, 'the address is not valid');
  }

  const hostname = parsed.hostname.replace(/^\[|\]$/g, '');

  if ((parsed.protocol !== 'http:' && parsed.protocol !== 'https:') || isBlockedHostname(hostname)) {
    throw new BlockedHostError(hostname, BLOCKED_REASON);
  }

  if (isIP(hostname)) {
    return;
  }

  let addresses: string[];

  try {
    addresses = await lookup(hostname);
  } catch {
    throw new BlockedHostError(hostname, UNRESOLVED_REASON);
  }

  if (addresses.length === 0) {
    throw new BlockedHostError(hostname, UNRESOLVED_REASON);
  }

  if (addresses.some(isBlockedAddress)) {
    throw new BlockedHostError(hostname, BLOCKED_REASON);
  }
};

/** Remembers each name's verdict for the length of one crawl, so a site is resolved once. */
export const memoizeLookup = (lookup: HostLookup): HostLookup => {
  const cache = new Map<string, Promise<string[]>>();

  return (hostname) => {
    let pending = cache.get(hostname);

    if (!pending) {
      pending = lookup(hostname);
      cache.set(hostname, pending);
      pending.catch(() => cache.delete(hostname));
    }

    return pending;
  };
};
