import type { APIRoute } from 'astro';

export const GET: APIRoute = async ({ url }) => {
  return new Response(JSON.stringify({ message: 'Test API works', query: Object.fromEntries(url.searchParams.entries()) }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};