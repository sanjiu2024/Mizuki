import type { APIRoute } from 'astro';
import { createPan123Client } from '../../lib/pan123-webdav';

// 条件预渲染：在Cloudflare Pages上使用服务器端渲染，本地构建时预渲染为静态占位符
export const prerender = import.meta.env.CF_PAGES !== "1";

export interface FileInfoResponse {
  path: string;
  name: string;
  size: number;
  lastModified: string;
  isDirectory: boolean;
  mimeType?: string;
  downloadUrl: string;
}

interface CachedFileInfo {
  data: FileInfoResponse | FileInfoResponse[];
  timestamp: number;
  expiresAt: number;
}

// 缓存时间：1小时（3600秒）
const CACHE_TTL = 3600;

// KV缓存辅助函数
async function getFromCache(key: string): Promise<CachedFileInfo | null> {
  try {
    // 检查是否启用KV缓存
    const useKv = import.meta.env.PAN123_USE_KV === 'true';
    if (!useKv) return null;

    // 在Cloudflare Workers环境中，KV通过环境变量绑定
    // 这里使用全局的KV命名空间
    const kv = (globalThis as any).PAN123_CACHE;
    if (!kv) return null;

    const cached = await kv.get(key, { type: 'json' });
    if (!cached) return null;

    // 检查缓存是否过期
    if (cached.expiresAt < Date.now()) {
      await kv.delete(key); // 删除过期缓存
      return null;
    }

    return cached;
  } catch (error) {
    console.error('KV缓存读取失败:', error);
    return null;
  }
}

async function setToCache(key: string, data: FileInfoResponse | FileInfoResponse[]): Promise<void> {
  try {
    // 检查是否启用KV缓存
    const useKv = import.meta.env.PAN123_USE_KV === 'true';
    if (!useKv) return;

    const kv = (globalThis as any).PAN123_CACHE;
    if (!kv) return;

    const cacheData: CachedFileInfo = {
      data,
      timestamp: Date.now(),
      expiresAt: Date.now() + CACHE_TTL * 1000,
    };

    await kv.put(key, JSON.stringify(cacheData), {
      expirationTtl: CACHE_TTL,
    });
  } catch (error) {
    console.error('KV缓存写入失败:', error);
  }
}

/**
 * 手动解析URL查询参数（解决Astro查询参数丢失问题）
 */
function parseQueryParams(urlString: string): URLSearchParams {
  try {
    // 尝试使用URL API解析
    const url = new URL(urlString);
    return url.searchParams;
  } catch (error) {
    // 如果URL不完整，手动解析查询字符串
    console.warn('[PAN123-INFO] URL解析失败，尝试手动解析:', error);
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
 * 1. POST请求体中的JSON
 * 2. GET查询参数（手动解析）
 * 3. URL路径参数（备用方案）
 */
function extractFilePath(request: Request, url: URL): string {
  const urlString = url.toString();
  console.log('[PAN123-INFO] 请求方法:', request.method);
  console.log('[PAN123-INFO] 请求URL:', urlString);
  
  // 手动解析查询参数（解决Astro bug）
  const searchParams = parseQueryParams(urlString);
  console.log('[PAN123-INFO] 手动解析的查询参数:', Object.fromEntries(searchParams.entries()));
  console.log('[PAN123-INFO] Astro提供的查询参数:', Object.fromEntries(url.searchParams.entries()));
  
  let filePath = '/';
  
  // 方法1：尝试从查询参数获取（GET请求）
  if (request.method === 'GET') {
    const queryPath = searchParams.get('path');
    if (queryPath) {
      console.log('[PAN123-INFO] 从查询参数获取路径:', queryPath);
      return queryPath;
    }
    
    // 方法2：尝试从URL路径解析（备用方案）
    // URL格式: /api/pan123/info/电脑.zip
    const pathMatch = url.pathname.match(/\/api\/pan123\/info\/(.+)/);
    if (pathMatch) {
      const pathParam = decodeURIComponent(pathMatch[1]);
      console.log('[PAN123-INFO] 从URL路径获取路径:', pathParam);
      return '/' + pathParam;
    }
  }
  
  // 方法3：对于POST请求，从请求体获取
  if (request.method === 'POST') {
    // 注意：这里需要异步处理，但为了简化先返回默认值
    console.log('[PAN123-INFO] POST请求，需要在处理函数中从请求体获取');
  }
  
  console.log('[PAN123-INFO] 使用默认路径:', filePath);
  return filePath;
}

/**
 * 解析WebDAV XML响应
 */
function parseWebDAVResponse(xmlText: string, basePath: string, baseUrl: string): FileInfoResponse[] {
  const files: FileInfoResponse[] = [];
  
  // 简单的XML解析
  const responseRegex = /<D:response>[\s\S]*?<\/D:response>/g;
  const responses = xmlText.match(responseRegex) || [];

  for (const response of responses) {
    try {
      // 提取href
      const hrefMatch = response.match(/<D:href>([\s\S]*?)<\/D:href>/);
      if (!hrefMatch) continue;

      let href = hrefMatch[1];
      // 解码URL编码的路径
      href = decodeURIComponent(href);
      
      // 移除baseUrl部分，获取相对路径
      const baseUrlObj = new URL(baseUrl);
      if (href.startsWith(baseUrlObj.pathname)) {
        href = href.substring(baseUrlObj.pathname.length);
      }
      
      // 跳过当前目录
      if (href === basePath || href === basePath + '/') {
        continue;
      }

      // 提取文件信息
      const displayNameMatch = response.match(/<D:displayname>([\s\S]*?)<\/D:displayname>/);
      const contentLengthMatch = response.match(/<D:getcontentlength>([\s\S]*?)<\/D:getcontentlength>/);
      const lastModifiedMatch = response.match(/<D:getlastmodified>([\s\S]*?)<\/D:getlastmodified>/);
      const resourceTypeMatch = response.match(/<D:resourcetype>([\s\S]*?)<\/D:resourcetype>/);
      const contentTypeMatch = response.match(/<D:getcontenttype>([\s\S]*?)<\/D:getcontenttype>/);

      const name = displayNameMatch ? displayNameMatch[1] : href.split('/').pop() || href;
      const size = contentLengthMatch ? parseInt(contentLengthMatch[1], 10) : 0;
      const lastModified = lastModifiedMatch ? lastModifiedMatch[1] : new Date().toISOString();
      const isDirectory = resourceTypeMatch ? resourceTypeMatch[1].includes('<D:collection/>') : false;
      const mimeType = contentTypeMatch ? contentTypeMatch[1] : undefined;

      files.push({
        path: href,
        name,
        size,
        lastModified,
        isDirectory,
        mimeType,
        downloadUrl: isDirectory ? '' : `/api/pan123/download?path=${encodeURIComponent(href)}`,
      });
    } catch (error) {
      console.warn('Failed to parse WebDAV response item:', error);
    }
  }

  return files;
}

// 支持GET和POST请求
export const GET: APIRoute = async ({ request, url }) => {
  return handleRequest(request, url, 'GET');
};

export const POST: APIRoute = async ({ request, url }) => {
  return handleRequest(request, url, 'POST');
};

async function handleRequest(request: Request, url: URL, method: string) {
  try {
    // 检查是否在Cloudflare Pages环境
    // 如果不在Cloudflare上，返回静态占位符数据（用于本地构建）
    if (import.meta.env.CF_PAGES !== "1") {
      console.log('[PAN123-INFO] 非Cloudflare环境，返回静态占位符数据');
      const placeholderData = {
        path: "/电脑.zip",
        name: "电脑.zip",
        size: 10884414382,
        lastModified: "2026-04-22T18:34:42.917Z",
        isDirectory: false,
        mimeType: "text/plain; charset=utf-8",
        downloadUrl: "/api/pan123/download?path=%2F%E7%94%B5%E8%84%91.zip"
      };
      return new Response(JSON.stringify(placeholderData), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'X-Environment': 'static-build' },
      });
    }
    
    let filePath = '/';
    const listDirectory = url.searchParams.get('list') === 'true';
    
    // 根据请求方法提取文件路径
    if (method === 'POST') {
      try {
        const body = await request.json();
        filePath = body.path || '/';
        console.log('[PAN123-INFO] 从POST请求体获取路径:', filePath);
      } catch (error) {
        console.warn('[PAN123-INFO] 无法解析POST请求体，使用默认路径');
      }
    } else {
      // GET请求：使用混合提取方法
      filePath = extractFilePath(request, url);
    }
    
    console.log('[PAN123-INFO] 最终文件路径:', filePath);
    console.log('[PAN123-INFO] 是否列出目录:', listDirectory);

    // 构建缓存键
    const cacheKey = `pan123:${filePath}:${listDirectory ? 'list' : 'info'}`;
    
    // 尝试从缓存获取
    const cached = await getFromCache(cacheKey);
    if (cached) {
      console.log('[PAN123-INFO] 使用缓存数据');
      return new Response(JSON.stringify(cached.data), {
        status: 200,
        headers: { 
          'Content-Type': 'application/json',
          'X-Cache': 'HIT'
        },
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
    console.log('[PAN123-INFO] 基础URL:', baseUrl);
    console.log('[PAN123-INFO] 规范化路径:', normalizedPath);
    const webdavUrl = new URL(normalizedPath, baseUrl as string).toString();
    console.log('[PAN123-INFO] WebDAV URL:', webdavUrl);
    
    // 创建Basic认证头
    const credentials = btoa(`${username}:${password}`);
    const authHeader = `Basic ${credentials}`;

    if (listDirectory) {
      // 获取目录列表
      const response = await fetch(webdavUrl, {
        method: 'PROPFIND',
        headers: {
          'Authorization': authHeader,
          'Depth': '1',
          'Content-Type': 'application/xml',
        },
        body: `<?xml version="1.0" encoding="utf-8" ?>
<propfind xmlns="DAV:">
  <prop>
    <getcontentlength xmlns="DAV:"/>
    <getlastmodified xmlns="DAV:"/>
    <displayname xmlns="DAV:"/>
    <resourcetype xmlns="DAV:"/>
    <getcontenttype xmlns="DAV:"/>
  </prop>
</propfind>`,
      });

      if (!response.ok) {
        return new Response(
          JSON.stringify({ 
            error: `无法获取目录列表: ${response.status} ${response.statusText}`,
            path: filePath 
          }),
          {
            status: response.status,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }

      const xmlText = await response.text();
      const files = parseWebDAVResponse(xmlText, filePath, baseUrl);
      
      const result = { 
        path: filePath,
        isDirectory: true,
        files 
      };
      
      // 缓存目录列表结果
      await setToCache(cacheKey, files);
      
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { 
          'Content-Type': 'application/json',
          'X-Cache': 'MISS'
        },
      });
    } else {
      // 获取单个文件信息
      const response = await fetch(webdavUrl, {
        method: 'HEAD',
        headers: {
          'Authorization': authHeader,
          'Accept': '*/*',
        },
      });

      if (!response.ok) {
        if (response.status === 404) {
          return new Response(
            JSON.stringify({ 
              error: '文件不存在',
              path: filePath 
            }),
            {
              status: 404,
              headers: { 'Content-Type': 'application/json' },
            }
          );
        }
        
        return new Response(
          JSON.stringify({ 
            error: `无法获取文件信息: ${response.status} ${response.statusText}`,
            path: filePath 
          }),
          {
            status: response.status,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }

      const contentLength = response.headers.get('Content-Length');
      const lastModified = response.headers.get('Last-Modified');
      const contentType = response.headers.get('Content-Type');

      // 从路径中提取文件名
      const pathParts = filePath.split('/');
      const name = pathParts[pathParts.length - 1] || filePath;

      const fileInfo: FileInfoResponse = {
        path: filePath,
        name,
        size: contentLength ? parseInt(contentLength, 10) : 0,
        lastModified: lastModified || new Date().toISOString(),
        isDirectory: false,
        mimeType: contentType || undefined,
        downloadUrl: `/api/pan123/download?path=${encodeURIComponent(filePath)}`,
      };

      // 缓存文件信息结果
      await setToCache(cacheKey, fileInfo);

      return new Response(JSON.stringify(fileInfo), {
        status: 200,
        headers: { 
          'Content-Type': 'application/json',
          'X-Cache': 'MISS'
        },
      });
    }

  } catch (error) {
    console.error('获取文件信息时出错:', error);
    
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