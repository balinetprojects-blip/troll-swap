import type { NextRequest } from 'next/server';

const UPSTREAM_BASE = (process.env.JUPITER_UPSTREAM_URL ?? 'https://lite-api.jup.ag/swap/v1').replace(/\/$/, '');
const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
  'Access-Control-Max-Age': '86400',
};

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function applyCors(headers: Headers) {
  Object.entries(CORS_HEADERS).forEach(([key, value]) => {
    headers.set(key, value);
  });
}

async function proxy(
  request: NextRequest,
  paramsPromise: Promise<any>
) {
  const params = (await paramsPromise) as { path?: string[] };
  const segments = params?.path ?? [];
  const targetUrl = new URL(`${segments.join('/')}`, `${UPSTREAM_BASE}/`);
  request.nextUrl.searchParams.forEach((value, key) => {
    targetUrl.searchParams.append(key, value);
  });

  const headers = new Headers();
  const forwardHeaders = ['content-type', 'accept', 'authorization'];
  forwardHeaders.forEach((name) => {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  });
  if (!headers.has('accept')) headers.set('accept', 'application/json');

  const init: RequestInit = {
    method: request.method,
    headers,
    cache: 'no-store',
  };

  if (request.method !== 'GET' && request.method !== 'HEAD' && request.method !== 'OPTIONS') {
    const body = await request.text();
    if (body) init.body = body;
  }

  try {
    const upstreamResponse = await fetch(targetUrl.toString(), init);
    const responseHeaders = new Headers(upstreamResponse.headers);
    applyCors(responseHeaders);

    if (upstreamResponse.status >= 400) {
      const errorBody = await upstreamResponse.text();
      console.error('[jupiter-proxy]', upstreamResponse.status, errorBody);
      responseHeaders.delete('content-encoding');
      responseHeaders.delete('content-length');
      return new Response(errorBody, {
        status: upstreamResponse.status,
        statusText: upstreamResponse.statusText,
        headers: responseHeaders,
      });
    }

    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      headers: responseHeaders,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown proxy error';
    const headers = new Headers({
      'Content-Type': 'application/json',
    });
    applyCors(headers);
    return new Response(JSON.stringify({ error: 'Jupiter proxy failed', message }), { status: 502, headers });
  }
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<any> }
) {
  return proxy(request, context.params);
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<any> }
) {
  return proxy(request, context.params);
}

export async function OPTIONS() {
  const headers = new Headers();
  applyCors(headers);
  return new Response(null, { status: 204, headers });
}
