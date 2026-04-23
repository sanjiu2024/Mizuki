import type { APIRoute } from 'astro';

// 条件预渲染：在Cloudflare Pages上使用服务器端渲染，本地构建时预渲染为静态占位符
export const prerender = import.meta.env.CF_PAGES !== "1";

// 下载统计辅助函数
async function incrementDownloadCount(filePath: string): Promise<void> {
  try {
    // 检查是否启用KV缓存
    const useKv = import.meta.env.PAN123_USE_KV === 'true';
    if (!useKv) return;

    const kv = (globalThis as any).PAN123_CACHE;
    if (!kv) return;

    const statsKey = `pan123:stats:${filePath}`;
    const totalKey = 'pan123:stats:total';
    
    // 增加文件下载计数
    const fileCount = await kv.get(statsKey);
    const newFileCount = (parseInt(fileCount) || 0) + 1;
    await kv.put(statsKey, newFileCount.toString());
    
    // 增加总下载计数
    const totalCount = await kv.get(totalKey);
    const newTotalCount = (parseInt(totalCount) || 0) + 1;
    await kv.put(totalKey, newTotalCount.toString());
  } catch (error) {
    console.error('下载统计更新失败:', error);
  }
}

/**
 * 手动解析URL查询参数（解决Astro查询参数丢失问题）
 */
function parseQueryParams(urlString: string): URLSearchParams {
  try {
    const url = new URL(urlString);
    return url.searchParams;
  } catch (error) {
    console.warn('[PAN123-DOWNLOAD] URL解析失败，尝试手动解析:', error);
    const queryStart = urlString.indexOf('?');
    if (queryStart === -1) {
      return new URLSearchParams();
    }
    const queryString = urlString.substring(queryStart + 1);
    return new URLSearchParams(queryString);
  }
}

/**
 * 从请求中提取文件路径（混合方案）
 * 支持多种方式：
 * 1. GET/HEAD查询参数
 * 2. URL路径参数（备用方案）
 */
function extractFilePath(request: Request, url: URL): string | null {
  const urlString = url.toString();
  console.log('[PAN123-DOWNLOAD] 请求方法:', request.method);
  console.log('[PAN123-DOWNLOAD] 请求URL:', urlString);
  
  // 手动解析查询参数（解决Astro bug）
  const searchParams = parseQueryParams(urlString);
  console.log('[PAN123-DOWNLOAD] 手动解析的查询参数:', Object.fromEntries(searchParams.entries()));
  
  // 方法1：尝试从查询参数获取（GET/HEAD请求）
  if (request.method === 'GET' || request.method === 'HEAD') {
    const queryPath = searchParams.get('path');
    if (queryPath) {
      console.log('[PAN123-DOWNLOAD] 从查询参数获取路径:', queryPath);
      return queryPath;
    }
    
    // 方法2：尝试从URL路径解析（备用方案）
    // URL格式: /api/pan123/download/电脑.zip
    const pathMatch = url.pathname.match(/\/api\/pan123\/download\/(.+)/);
    if (pathMatch) {
      const pathParam = decodeURIComponent(pathMatch[1]);
      console.log('[PAN123-DOWNLOAD] 从URL路径获取路径:', pathParam);
      return '/' + pathParam;
    }
  }
  
  console.log('[PAN123-DOWNLOAD] 无法提取文件路径');
  return null;
}

// 支持GET和HEAD请求
export const GET: APIRoute = async ({ request, url }) => {
  return handleDownload(request, url, 'GET');
};

export const HEAD: APIRoute = async ({ request, url }) => {
  return handleDownload(request, url, 'HEAD');
};

async function handleDownload(request: Request, url: URL, method: string) {
  try {
    // 检查是否在Cloudflare Pages环境
    // 如果不在Cloudflare上，返回静态占位符响应（用于本地构建）
    if (import.meta.env.CF_PAGES !== "1") {
      console.log('[PAN123-DOWNLOAD] 非Cloudflare环境，返回静态占位符响应');
      if (method === 'HEAD') {
        return new Response(null, {
          status: 200,
          headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            'Content-Disposition': 'attachment; filename="%E7%94%B5%E8%84%91.zip"',
            'Content-Length': '10884414382',
            'X-Environment': 'static-build',
          },
        });
      } else {
        return new Response('这是123网盘文件的静态占位符内容。实际部署到Cloudflare Pages后，此端点将代理下载真实文件。', {
          status: 200,
          headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            'Content-Disposition': 'attachment; filename="%E7%94%B5%E8%84%91.zip"',
            'Content-Length': '10884414382',
            'X-Environment': 'static-build',
          },
        });
      }
    }
    
    // 提取文件路径
    const filePath = extractFilePath(request, url);
    
    console.log('[PAN123-DOWNLOAD] 最终文件路径:', filePath);
    
    if (!filePath) {
      return new Response(JSON.stringify({ error: '文件路径参数缺失' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 从环境变量获取123网盘凭证
    const username = import.meta.env.PAN123_USERNAME || '15973658027';
    const password = import.meta.env.PAN123_PASSWORD || 'kbdut2da';
    let baseUrl = import.meta.env.PAN123_WEBDAV_URL || 'https://webdav.123pan.cn/webdav';
    // 确保基础URL以斜杠结尾，以便正确追加相对路径
    if (!baseUrl.endsWith('/')) {
      baseUrl += '/';
    }

    // 构建完整的WebDAV URL
    // 规范化文件路径：移除开头的斜杠，避免替换基础URL的路径
    const normalizedPath = filePath.startsWith('/') ? filePath.substring(1) : filePath;
    console.log('[PAN123-DOWNLOAD] 基础URL:', baseUrl);
    console.log('[PAN123-DOWNLOAD] 规范化路径:', normalizedPath);
    const webdavUrl = new URL(normalizedPath, baseUrl as string).toString();
    
    // 创建Basic认证头
    const credentials = btoa(`${username}:${password}`);
    const authHeader = `Basic ${credentials}`;

    console.log('[PAN123-DOWNLOAD] 请求WebDAV URL:', webdavUrl);

    // 向123网盘发起请求
    const response = await fetch(webdavUrl, {
      method,
      headers: {
        'Authorization': authHeader,
        'Accept': '*/*',
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        return new Response(JSON.stringify({ error: '文件不存在', path: filePath }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      
      return new Response(
        JSON.stringify({ 
          error: `无法下载文件: ${response.status} ${response.statusText}`,
          path: filePath 
        }),
        {
          status: response.status,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // 更新下载统计（异步，不阻塞响应）
    incrementDownloadCount(filePath).catch(err => {
      console.error('下载统计更新失败:', err);
    });

    // 构建响应头
    const headers = new Headers();
    
    // 复制原始响应头
    response.headers.forEach((value, key) => {
      // 跳过一些不需要的头
      if (!['content-encoding', 'transfer-encoding', 'connection'].includes(key.toLowerCase())) {
        headers.set(key, value);
      }
    });
    
    // 添加CORS头
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    // 添加下载相关头
    const fileName = filePath.split('/').pop() || 'download';
    headers.set('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
    
    // 添加缓存控制头
    headers.set('Cache-Control', 'public, max-age=3600'); // 缓存1小时

    if (method === 'HEAD') {
      // HEAD请求只返回头信息
      return new Response(null, {
        status: 200,
        headers,
      });
    } else {
      // GET请求返回文件内容
      return new Response(response.body, {
        status: 200,
        headers,
      });
    }

  } catch (error) {
    console.error('下载文件时出错:', error);
    
    return new Response(
      JSON.stringify({ 
        error: '服务器内部错误',
        message: error instanceof Error ? error.message : '未知错误'
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}