/**
 * 123网盘文件组件类型定义
 */

export interface Pan123FileProps {
  /** 文件在123网盘中的路径 */
  path: string;
  /** 自定义显示的文件名（可选） */
  name?: string;
  /** 自定义图标（可选） */
  icon?: string;
  /** CSS类名（可选） */
  className?: string;
}

export interface Pan123FileInfo {
  /** 文件路径 */
  path: string;
  /** 文件名 */
  name: string;
  /** 文件大小（字节） */
  size: number;
  /** 最后修改时间 */
  lastModified: string;
  /** 是否为目录 */
  isDirectory: boolean;
  /** MIME类型 */
  mimeType?: string;
  /** 下载URL */
  downloadUrl: string;
}

export interface Pan123ApiResponse {
  /** 文件信息 */
  data?: Pan123FileInfo;
  /** 目录下的文件列表（当请求目录时） */
  files?: Pan123FileInfo[];
  /** 错误信息 */
  error?: string;
  /** 请求路径 */
  path?: string;
}