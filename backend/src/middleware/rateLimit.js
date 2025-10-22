const stores = new Map();

const cleanupIntervalMs = 60_000;
let cleanupScheduled = false;

function scheduleCleanup() {
  if (cleanupScheduled) return;
  cleanupScheduled = true;
  setTimeout(() => {
    const now = Date.now();
    for (const [key, store] of stores) {
      for (const [id, entry] of store.entries()) {
        if (entry.resetTime <= now) {
          store.delete(id);
        }
      }
      if (store.size === 0) {
        stores.delete(key);
      }
    }
    cleanupScheduled = false;
    if (stores.size > 0) {
      scheduleCleanup();
    }
  }, cleanupIntervalMs).unref?.();
}

export function createRateLimiter({
  windowMs,
  max,
  keyGenerator = (req) => req.ip,
  message = 'Too many requests, please try again later.',
  statusCode = 429,
}) {
  if (!windowMs || !max) {
    throw new Error('windowMs and max are required');
  }

  if (!stores.has(windowMs)) {
    stores.set(windowMs, new Map());
  }

  const store = stores.get(windowMs);

  return function rateLimiter(req, res, next) {
    const key = keyGenerator(req);
    const now = Date.now();
    let entry = store.get(key);

    if (!entry || entry.resetTime <= now) {
      entry = { count: 0, resetTime: now + windowMs };
      store.set(key, entry);
      scheduleCleanup();
    }

    entry.count += 1;

    const remaining = max - entry.count;
    res.setHeader('X-RateLimit-Limit', String(max));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(remaining, 0)));
    res.setHeader('X-RateLimit-Reset', String(Math.floor(entry.resetTime / 1000)));

    if (entry.count > max) {
      if (req.log) {
        req.log.warn(
          {
            rateLimit: {
              key,
              windowMs,
              max,
            },
          },
          'rate limit exceeded',
        );
      }
      return res.status(statusCode).json({ error: message });
    }

    return next();
  };
}
