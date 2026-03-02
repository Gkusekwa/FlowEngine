import { Injectable } from '@nestjs/common';
import * as dns from 'dns';
import * as net from 'net';

const BLOCKED_IPV4_RANGES = [
  { prefix: '127.', description: 'loopback' },
  { prefix: '10.', description: 'private (10/8)' },
  { prefix: '169.254.', description: 'link-local' },
  { prefix: '0.', description: 'unspecified' },
];

const BLOCKED_IPV4_172 = { min: 16, max: 31 }; // 172.16.0.0/12
const BLOCKED_IPV4_192 = '192.168.'; // 192.168.0.0/16

const BLOCKED_IPV6 = ['::1', '::'];
const BLOCKED_IPV6_PREFIXES = ['fc', 'fd', 'fe80'];

@Injectable()
export class SsrfGuard {
  async validateUrl(url: string): Promise<void> {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new Error('INTEGRATION_SSRF_BLOCKED: Invalid URL');
    }

    // Only allow http and https
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error(`INTEGRATION_SSRF_BLOCKED: Scheme '${parsed.protocol}' not allowed`);
    }

    const hostname = parsed.hostname;

    // Block if hostname is an IP directly
    if (net.isIPv4(hostname)) {
      this.checkIpv4(hostname);
      return;
    }
    if (net.isIPv6(hostname)) {
      this.checkIpv6(hostname);
      return;
    }

    // DNS pre-resolution
    const addresses = await this.resolveHostname(hostname);
    for (const addr of addresses) {
      if (net.isIPv4(addr)) {
        this.checkIpv4(addr);
      } else if (net.isIPv6(addr)) {
        this.checkIpv6(addr);
      }
    }
  }

  private checkIpv4(ip: string): void {
    for (const range of BLOCKED_IPV4_RANGES) {
      if (ip.startsWith(range.prefix)) {
        throw new Error(`INTEGRATION_SSRF_BLOCKED: IP ${ip} is in blocked range (${range.description})`);
      }
    }

    // Check 172.16.0.0/12
    if (ip.startsWith('172.')) {
      const second = parseInt(ip.split('.')[1], 10);
      if (second >= BLOCKED_IPV4_172.min && second <= BLOCKED_IPV4_172.max) {
        throw new Error(`INTEGRATION_SSRF_BLOCKED: IP ${ip} is in blocked range (private 172.16/12)`);
      }
    }

    // Check 192.168.0.0/16
    if (ip.startsWith(BLOCKED_IPV4_192)) {
      throw new Error(`INTEGRATION_SSRF_BLOCKED: IP ${ip} is in blocked range (private 192.168/16)`);
    }
  }

  private checkIpv6(ip: string): void {
    const normalized = ip.toLowerCase();
    if (BLOCKED_IPV6.includes(normalized)) {
      throw new Error(`INTEGRATION_SSRF_BLOCKED: IP ${ip} is blocked`);
    }
    for (const prefix of BLOCKED_IPV6_PREFIXES) {
      if (normalized.startsWith(prefix)) {
        throw new Error(`INTEGRATION_SSRF_BLOCKED: IP ${ip} is in blocked range`);
      }
    }
  }

  private async resolveHostname(hostname: string): Promise<string[]> {
    const addresses: string[] = [];

    try {
      const ipv4 = await dns.promises.resolve4(hostname);
      addresses.push(...ipv4);
    } catch {
      // No A records
    }

    try {
      const ipv6 = await dns.promises.resolve6(hostname);
      addresses.push(...ipv6);
    } catch {
      // No AAAA records
    }

    if (addresses.length === 0) {
      throw new Error(`INTEGRATION_SSRF_BLOCKED: Could not resolve hostname '${hostname}'`);
    }

    return addresses;
  }
}
