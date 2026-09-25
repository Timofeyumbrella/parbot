// @vitest-environment node
import { describe, expect, it } from 'vitest';

import {
  assertPublicUrl,
  BlockedHostError,
  isBlockedAddress,
  isBlockedHostname,
  memoizeLookup,
  publicLookup,
} from './guard';

describe('isBlockedAddress', () => {
  it('refuses loopback, private, link-local, carrier NAT and reserved IPv4 ranges', () => {
    for (const address of [
      '127.0.0.1',
      '127.8.8.8',
      '10.0.0.5',
      '172.16.0.1',
      '172.31.255.255',
      '192.168.1.1',
      '169.254.169.254',
      '100.64.0.1',
      '0.0.0.0',
      '192.0.0.1',
      '192.0.2.1',
      '198.18.0.1',
      '198.51.100.7',
      '203.0.113.9',
      '224.0.0.1',
      '240.0.0.1',
      '255.255.255.255',
    ]) {
      expect(isBlockedAddress(address), address).toBe(true);
    }
  });

  it('allows ordinary public IPv4 addresses', () => {
    for (const address of [
      '93.184.216.34',
      '172.15.0.1',
      '172.32.0.1',
      '100.63.0.1',
      '100.128.0.1',
      '8.8.8.8',
      '11.0.0.1',
    ]) {
      expect(isBlockedAddress(address), address).toBe(false);
    }
  });

  it('refuses IPv6 loopback, unspecified, unique local, link-local, multicast and mapped private addresses', () => {
    for (const address of [
      '::1',
      '::',
      'fc00::1',
      'fd12:3456::1',
      'fe80::1',
      'fe80::1%en0',
      'ff02::1',
      '2001:db8::1',
      '::ffff:127.0.0.1',
      '::ffff:10.0.0.1',
      '::ffff:7f00:1',
      '64:ff9b::192.168.0.1',
      '::127.0.0.1',
    ]) {
      expect(isBlockedAddress(address), address).toBe(true);
    }
  });

  it('allows public IPv6 addresses, including mapped public IPv4', () => {
    for (const address of [
      '2606:2800:220:1:248:1893:25c8:1946',
      '2a00:1450:4001:80e::200e',
      '::ffff:93.184.216.34',
      '64:ff9b::8.8.8.8',
    ]) {
      expect(isBlockedAddress(address), address).toBe(false);
    }
  });

  it('treats anything unparseable as blocked', () => {
    expect(isBlockedAddress('not-an-ip')).toBe(true);
    expect(isBlockedAddress('1.2.3')).toBe(true);
    expect(isBlockedAddress('::ffff:999.1.1.1')).toBe(true);
  });
});

describe('isBlockedHostname', () => {
  it('refuses names that only ever mean this machine or this network', () => {
    for (const name of [
      'localhost',
      'LOCALHOST.',
      'api.localhost',
      'printer.local',
      'metadata.google.internal',
      'db.internal',
      'router.home.arpa',
      'ip6-localhost',
      '[::1]',
      '127.0.0.1',
      '169.254.169.254',
      '',
    ]) {
      expect(isBlockedHostname(name), name).toBe(true);
    }
  });

  it('allows public names and public literal addresses', () => {
    for (const name of [
      'docs.example.com',
      'localhost.example.com',
      'internal-docs.example.com',
      '93.184.216.34',
      '[2606:2800:220:1:248:1893:25c8:1946]',
    ]) {
      expect(isBlockedHostname(name), name).toBe(false);
    }
  });
});

describe('assertPublicUrl', () => {
  it('resolves the name and refuses when any answer is private', async () => {
    await expect(
      assertPublicUrl('https://docs.example.com/guide', publicLookup),
    ).resolves.toBeUndefined();
    await expect(
      assertPublicUrl('https://docs.example.com/guide', async () => ['93.184.216.34', '10.0.0.4']),
    ).rejects.toThrow('the address points at a private or internal network');
    await expect(
      assertPublicUrl('https://docs.example.com/guide', async () => ['fd00::1']),
    ).rejects.toBeInstanceOf(BlockedHostError);
  });

  it('refuses blocked names before resolving anything', async () => {
    let looked = 0;
    const lookup = async () => {
      looked += 1;

      return ['93.184.216.34'];
    };

    await expect(assertPublicUrl('http://localhost:3000/', lookup)).rejects.toThrow(
      'private or internal network',
    );
    await expect(
      assertPublicUrl('http://169.254.169.254/latest/meta-data/', lookup),
    ).rejects.toThrow('private or internal network');
    await expect(assertPublicUrl('http://[::1]/', lookup)).rejects.toThrow(
      'private or internal network',
    );
    await expect(assertPublicUrl('ftp://docs.example.com/', lookup)).rejects.toThrow(
      'private or internal network',
    );
    expect(looked).toBe(0);
  });

  it('reports a name that does not resolve', async () => {
    await expect(
      assertPublicUrl('https://nowhere.example.com/', async () => {
        throw new Error('ENOTFOUND');
      }),
    ).rejects.toThrow('the host could not be found');
    await expect(assertPublicUrl('https://nowhere.example.com/', async () => [])).rejects.toThrow(
      'the host could not be found',
    );
  });
});

describe('memoizeLookup', () => {
  it('resolves each name once and forgets failures', async () => {
    const calls: string[] = [];
    let fail = true;
    const lookup = memoizeLookup(async (name) => {
      calls.push(name);

      if (name === 'flaky.example.com' && fail) {
        fail = false;
        throw new Error('ENOTFOUND');
      }

      return ['93.184.216.34'];
    });

    await lookup('docs.example.com');
    await lookup('docs.example.com');
    await expect(lookup('flaky.example.com')).rejects.toThrow();
    await expect(lookup('flaky.example.com')).resolves.toEqual(['93.184.216.34']);

    expect(calls).toEqual(['docs.example.com', 'flaky.example.com', 'flaky.example.com']);
  });
});
