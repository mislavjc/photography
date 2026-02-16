import { revalidateTag } from 'next/cache';
import { after } from 'next/server';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const secret = request.headers.get('x-revalidation-secret');

  if (secret !== process.env.REVALIDATION_SECRET) {
    return NextResponse.json({ error: 'Invalid secret' }, { status: 401 });
  }

  // Run revalidation after the response is sent (non-blocking)
  after(() => {
    revalidateTag('manifest', 'days');
  });

  return NextResponse.json({ revalidated: true });
}
