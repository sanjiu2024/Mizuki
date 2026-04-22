/**
 * 123网盘WebDAV客户端
 * 用于与123网盘WebDAV API交互
 */

export interface Pan123FileInfo {
  path: string;
  name: string;
  size: number;
  lastModified: string;
  isDirectory: boolean;
  mimeType?: string;
}

export interface Pan123Config {
  username: string;
  password: string;
  baseUrl: string;
}

export class Pan123WebDAVClient {
  private config: Pan123Config;
  private authHeader: string;

  constructor(config: Pan123Config) {
    this.config = config;
    const credentials = btoa(`${config.username}:${config.password}`);
    this.authHeader = `Basic ${credentials}`;
  }

  /**
   * 获取文件信息
   * @param filePath 文件路径（相对于WebDAV根目录）
   */
  async getFileInfo(filePath: string): Promise<Pan123FileInfo | null> {
    try {
      const url = new URL(filePath, this.config.baseUrl).toString();
      
      const response = await fetch(url, {
        method: 'HEAD',
        headers: {
          'Authorization': this.authHeader,
          'Accept': '*/*',
        },
      });

      if (!response.ok) {
        if (response.status === 404) {
          return null;
        }
        throw new Error(`Failed to get file info: ${response.status} ${response.statusText}`);
      }

      const contentLength = response.headers.get('Content-Length');
      const lastModified = response.headers.get('Last-Modified');
      const contentType = response.headers.get('Content-Type');

      // 从路径中提取文件名
      const pathParts = filePath.split('/');
      const name = pathParts[pathParts.length - 1] || filePath;

      return {
        path: filePath,
        name,
        size: contentLength ? parseInt(contentLength, 10) : 0,
        lastModified: lastModified || new Date().toISOString(),
        isDirectory: false,
        mimeType: contentType || undefined,
      };
    } catch (error) {
      console.error('Error getting file info:', error);
      throw error;
    }
  }

  /**
   * 获取目录下的文件列表
   * @param directoryPath 目录路径（相对于WebDAV根目录）
   */
  async listDirectory(directoryPath: string = '/'): Promise<Pan123FileInfo[]> {
    try {
      const url = new URL(directoryPath, this.config.baseUrl).toString();
      
      // WebDAV PROPFIND请求
      const response = await fetch(url, {
        method: 'PROPFIND',
        headers: {
          'Authorization': this.authHeader,
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
        throw new Error(`Failed to list directory: ${response.status} ${response.statusText}`);
      }

      const xmlText = await response.text();
      return this.parseWebDAVResponse(xmlText, directoryPath);
    } catch (error) {
      console.error('Error listing directory:', error);
      throw error;
    }
  }

  /**
   * 解析WebDAV XML响应
   */
  private parseWebDAVResponse(xmlText: string, basePath: string): Pan123FileInfo[] {
    const files: Pan123FileInfo[] = [];
    
    // 简单的XML解析（在实际应用中可能需要更健壮的解析器）
    // 这里使用正则表达式进行简单解析
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
        const baseUrl = new URL(this.config.baseUrl);
        if (href.startsWith(baseUrl.pathname)) {
          href = href.substring(baseUrl.pathname.length);
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
        });
      } catch (error) {
        console.warn('Failed to parse WebDAV response item:', error);
      }
    }

    return files;
  }

  /**
   * 获取文件下载URL
   * @param filePath 文件路径
   * @returns 直接下载URL（需要认证）
   */
  getFileDownloadUrl(filePath: string): string {
    return new URL(filePath, this.config.baseUrl).toString();
  }

  /**
   * 验证凭证是否有效
   */
  async validateCredentials(): Promise<boolean> {
    try {
      const response = await fetch(this.config.baseUrl, {
        method: 'PROPFIND',
        headers: {
          'Authorization': this.authHeader,
          'Depth': '0',
        },
      });
      return response.ok;
    } catch (error) {
      console.error('Error validating credentials:', error);
      return false;
    }
  }
}

/**
 * 创建默认的123网盘客户端实例
 * 从环境变量读取配置
 */
export function createPan123Client(): Pan123WebDAVClient {
  const username = import.meta.env.PAN123_USERNAME || '15973658027';
  const password = import.meta.env.PAN123_PASSWORD || 'kbdut2da';
  const baseUrl = import.meta.env.PAN123_WEBDAV_URL || 'https://webdav.123pan.cn/webdav';

  return new Pan123WebDAVClient({
    username,
    password,
    baseUrl,
  });
}