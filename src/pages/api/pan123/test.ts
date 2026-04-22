import type { APIRoute } from 'astro';

// 条件预渲染：在Cloudflare Pages上使用服务器端渲染，本地构建时预渲染为静态占位符
export const prerender = import.meta.env.CF_PAGES !== "1";

export const GET: APIRoute = async ({ url }) => {
  // 检查是否在Cloudflare Pages环境
  // 如果不在Cloudflare上，返回静态测试数据
  if (import.meta.env.CF_PAGES !== "1") {
    return new Response(JSON.stringify({ 
      message: 'Test API works (static build)', 
      query: Object.fromEntries(url.searchParams.entries()),
      environment: 'static-build',
      note: 'This is a static placeholder. Real API will work on Cloudflare Pages.'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'X-Environment': 'static-build' },
    });
  }
  
  return new Response(JSON.stringify({ message: 'Test API works', query: Object.fromEntries(url.searchParams.entries()) }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};