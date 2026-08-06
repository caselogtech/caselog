import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { Inject, Injectable } from '@nestjs/common';
import { IssueTrackerRequestError } from '../../domain/errors/issue-tracker.error';
import { ISSUE_TRACKER_CONFIG, type IssueTrackerConfig } from '../config/issue-tracker.config';

@Injectable()
export class OutboundUrlPolicy {
  constructor(@Inject(ISSUE_TRACKER_CONFIG) private readonly config: IssueTrackerConfig) {}

  normalize(value: string): string {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) {
      throw new IssueTrackerRequestError('unavailable', 'Only HTTP and HTTPS URLs are supported');
    }
    if (url.username || url.password || url.search || url.hash) {
      throw new IssueTrackerRequestError(
        'unavailable',
        'The integration URL cannot contain credentials, a query, or a fragment',
      );
    }
    url.pathname = url.pathname.replace(/\/+$/, '');
    return url.toString().replace(/\/$/, '');
  }

  async assertAllowed(value: string): Promise<void> {
    if (this.config.allowPrivateNetworks) return;
    const rawHostname = new URL(value).hostname.toLowerCase();
    const hostname = rawHostname.startsWith('[') ? rawHostname.slice(1, -1) : rawHostname;
    if (
      hostname === 'localhost' ||
      hostname.endsWith('.localhost') ||
      hostname.endsWith('.local')
    ) {
      throw this.blocked();
    }

    const addresses = isIP(hostname)
      ? [{ address: hostname }]
      : await lookup(hostname, { all: true, verbatim: true }).catch(() => {
          throw new IssueTrackerRequestError(
            'unavailable',
            'The integration host could not resolve',
          );
        });
    if (addresses.length === 0 || addresses.some(({ address }) => this.isPrivate(address))) {
      throw this.blocked();
    }
  }

  private isPrivate(address: string): boolean {
    const normalized = address.toLowerCase();
    const mappedIpv4 = this.mappedIpv4(normalized);
    if (mappedIpv4) return this.isPrivate(mappedIpv4);
    if (isIP(normalized) === 6) {
      const firstGroup = Number.parseInt(normalized.split(':')[0] ?? '', 16);
      return (
        normalized === '::1' ||
        normalized === '::' ||
        (firstGroup & 0xffc0) === 0xfe80 ||
        (firstGroup & 0xfe00) === 0xfc00 ||
        (firstGroup & 0xff00) === 0xff00 ||
        normalized.startsWith('2001:db8:')
      );
    }

    const octets = normalized.split('.').map(Number);
    if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet))) return false;
    const [first = -1, second = -1, third = -1] = octets;
    return (
      first === 0 ||
      first === 10 ||
      first === 127 ||
      (first === 100 && second >= 64 && second <= 127) ||
      (first === 169 && second === 254) ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 0 && third === 0) ||
      (first === 192 && second === 0 && third === 2) ||
      (first === 192 && second === 168) ||
      (first === 198 && (second === 18 || second === 19)) ||
      (first === 198 && second === 51 && third === 100) ||
      (first === 203 && second === 0 && third === 113) ||
      first >= 224
    );
  }

  private mappedIpv4(address: string): string | null {
    if (!address.startsWith('::ffff:')) return null;
    const suffix = address.slice('::ffff:'.length);
    if (suffix.includes('.')) return suffix;
    const groups = suffix.split(':');
    if (groups.length !== 2) return null;
    const high = Number.parseInt(groups[0] ?? '', 16);
    const low = Number.parseInt(groups[1] ?? '', 16);
    if (![high, low].every((value) => Number.isInteger(value) && value >= 0 && value <= 0xffff)) {
      return null;
    }
    return `${high >> 8}.${high & 0xff}.${low >> 8}.${low & 0xff}`;
  }

  private blocked(): IssueTrackerRequestError {
    return new IssueTrackerRequestError('unavailable', 'The integration host is not allowed');
  }
}
