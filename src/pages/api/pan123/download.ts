import type { APIRoute } from 'astro';

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

export const GET: APIRoute = async ({ url }) => {
  try {
    // 从查询参数获取文件路径
    const filePath = url.searchParams.get('path');
    
    if (!filePath) {
      return new Response(JSON.stringify({ error: '文件路径参数缺失' }), {
        status: 400,
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

    // 向123网盘发起请求
    const response = await fetch(webdavUrl, {
      method: 'GET',
      headers: {
        'Authorization': authHeader,
        'Accept': '*/*',
      },
    });

    if (!response.ok) {
      return new Response(
        JSON.stringify({ 
          error: `无法获取文件: ${response.status} ${response.statusText}`,
          path: filePath 
        }),
        {
          status: response.status,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // 获取文件信息和内容
    const contentLength = response.headers.get('Content-Length');
    const contentType = response.headers.get('Content-Type') || 'application/octet-stream';
    const lastModified = response.headers.get('Last-Modified');
    const fileData = await response.arrayBuffer();

    // 从路径中提取文件名
    const pathParts = filePath.split('/');
    const fileName = pathParts[pathParts.length - 1] || 'download';

    // 异步更新下载统计（不阻塞响应）
    incrementDownloadCount(filePath).catch(error => {
      console.error('下载统计更新失败:', error);
    });

    // 返回文件下载
    return new Response(fileData, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': contentLength || String(fileData.byteLength),
        'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName)}"`,
        'Cache-Control': 'public, max-age=3600',
        'Last-Modified': lastModified || new Date().toISOString(),
      },
    });

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
};

// 支持HEAD请求获取文件信息
export const HEAD: APIRoute = async ({ url }) => {
  try {
    const filePath = url.searchParams.get('path');
    
    if (!filePath) {
      return new Response(null, {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const username = import.meta.env.PAN123_USERNAME || '15973658027';
    const password = import.meta.env.PAN123_PASSWORD || 'kbdut2da';
    const baseUrl = import.meta.env.PAN123_WEBDAV_URL || 'https://webdav.123pan.cn/webdav';

    const webdavUrl = new URL(filePath, baseUrl).toString();
    const credentials = btoa(`${username}:${password}`);
    const authHeader = `Basic ${credentials}`;

    const response = await fetch(webdavUrl, {
      method: 'HEAD',
      headers: {
        'Authorization': authHeader,
        'Accept': '*/*',
      },
    });

    if (!response.ok) {
      return new Response(null, {
        status: response.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 从路径中提取文件名
    const pathParts = filePath.split('/');
    const fileName = pathParts[pathParts.length - 1] || 'download';

    // 返回文件信息头
    return new Response(null, {
      status: 200,
      headers: {
        'Content-Type': response.headers.get('Content-Type') || 'application/octet-stream',
        'Content-Length': response.headers.get('Content-Length') || '0',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName)}"`,
        'Cache-Control': 'public, max-age=3600',
        'Last-Modified': response.headers.get('Last-Modified') || new Date().toISOString(),
      },
    });

  } catch (error) {
    console.error('获取文件信息时出错:', error);
    return new Response(null, { status: 500 });
  }
};