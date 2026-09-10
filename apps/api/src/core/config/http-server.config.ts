import { z } from 'zod';

export function createHttpServerConfig(): { trustProxy: number } {
  const hops = z.coerce
    .number()
    .int()
    .min(0)
    .max(5)
    .default(0)
    .parse(process.env.API_TRUST_PROXY_HOPS);
  return { trustProxy: hops };
}
