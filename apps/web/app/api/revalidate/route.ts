import { revalidateTag } from 'next/cache';
import { NextResponse } from 'next/server';

import { env } from 'lib/env';

export async function POST(request: Request) {
  const secret = request.headers.get('x-revalidation-secret');

  if (secret !== env.REVALIDATION_SECRET) {
    return NextResponse.json({ error: 'Invalid secret' }, { status: 401 });
  }

  // { expire: 0 } forces immediate expiration; 'max'/'days' only mark stale (SWR)
  // and can serve the old manifest on the very next visit.
  revalidateTag('manifest', { expire: 0 });

  return NextResponse.json({ revalidated: true });
}
