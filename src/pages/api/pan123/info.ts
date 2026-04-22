import type { APIRoute } from 'astro';

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

export const GET: APIRoute = async ({ url }) => {
  try {
    // 从查询参数获取文件路径
    const filePath = url.searchParams.get('path');
    const listDirectory = url.searchParams.get('list') === 'true';
    
    if (!filePath) {
      return new Response(JSON.stringify({ error: '文件路径参数缺失' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 构建缓存键
    const cacheKey = `pan123:${filePath}:${listDirectory ? 'list' : 'info'}`;
    
    // 尝试从缓存获取
    const cached = await getFromCache(cacheKey);
    if (cached) {
      return new Response(JSON.stringify(cached.data), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 从环境变量获取123网盘凭证
    const username = import.meta.env.PAN123_USERNAME || '15973658027';
    const password = import.meta.env.PAN123_PASSWORD || 'kbdut2da';
    const baseUrl = import.meta.env.PAN123_WEBDAV_URL || 'https://webdav.123pan.cn/webdav';

    // 构建完整的WebDAV URL
    const webdavUrl = new URL(filePath, baseUrl).toString();
    
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
        headers: { 'Content-Type': 'application/json' },
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
        headers: { 'Content-Type': 'application/json' },
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
};

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