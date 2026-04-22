/**
 * 负载均衡线路配置
 * 用户需要根据实际情况配置这些线路
 */

import type { Route } from './types';

// 获取当前网站域名（用于Cloudflare默认线路）
const getCurrentDomain = (): string => {
  if (typeof window !== 'undefined') {
    return window.location.origin;
  }
  // 默认使用环境变量或回退值
  return import.meta.env.SITE || 'https://your-domain.com';
};

/**
 * 默认线路配置
 * 用户需要根据实际情况修改这些配置
 */
export const defaultRoutes: Route[] = [
  {
    id: 'cf-default',
    name: 'Cloudflare默认线路',
    url: getCurrentDomain(), // 自动获取当前域名
    enabled: true,
    priority: 1,
  },
  {
    id: 'hk-server',
    name: '香港服务器线路',
    url: 'https://your-hk-server.com', // 用户需要配置香港服务器地址
    enabled: false, // 默认禁用，用户配置后启用
    priority: 2,
  },
];

/**
 * 获取线路配置
 * 允许用户通过环境变量覆盖配置
 */
export function getRoutes(): Route[] {
  const routes = [...defaultRoutes];
  
  // 从环境变量读取香港服务器配置
  const hkServerUrl = import.meta.env.PUBLIC_HK_SERVER_URL;
  if (hkServerUrl) {
    const hkRoute = routes.find(route => route.id === 'hk-server');
    if (hkRoute) {
      hkRoute.url = hkServerUrl;
      hkRoute.enabled = true;
    }
  }
  
  return routes.filter(route => route.enabled);
}

/**
 * 验证线路配置
 */
export function validateRoute(route: Route): boolean {
  if (!route.url) {
    console.warn(`线路 ${route.name} (${route.id}) 缺少URL`);
    return false;
  }
  
  try {
    new URL(route.url);
    return true;
  } catch {
    console.warn(`线路 ${route.name} (${route.id}) URL格式无效: ${route.url}`);
    return false;
  }
}

/**
 * 获取测试端点
 * 用于测速的小文件路径
 */
export function getTestEndpoint(): string {
  return import.meta.env.PUBLIC_SPEED_TEST_ENDPOINT || '/favicon.ico';
}