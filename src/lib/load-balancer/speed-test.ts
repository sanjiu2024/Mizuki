/**
 * 线路测速模块
 * 测试每条线路的延迟和可用性
 */

import type { Route, SpeedTestResult } from './types';
import { getTestEndpoint } from './routes';

/**
 * 测试单个线路的延迟
 */
export async function testRouteSpeed(route: Route): Promise<SpeedTestResult> {
  const startTime = performance.now();
  const testUrl = `${route.url}${getTestEndpoint()}`;
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5秒超时
    
    const _response = await fetch(testUrl, {
      method: 'HEAD', // 使用HEAD请求减少数据传输
      mode: 'no-cors', // 避免CORS问题
      cache: 'no-store',
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    
    const endTime = performance.now();
    const latency = Math.round(endTime - startTime);
    
    return {
      routeId: route.id,
      latency,
      success: true,
      timestamp: Date.now(),
    };
  } catch (error) {
    const endTime = performance.now();
    const latency = Math.round(endTime - startTime);
    
    return {
      routeId: route.id,
      latency,
      success: false,
      timestamp: Date.now(),
      error: error instanceof Error ? error.message : '未知错误',
    };
  }
}

/**
 * 并行测试所有线路
 */
export async function testAllRoutes(routes: Route[]): Promise<SpeedTestResult[]> {
  const testPromises = routes.map(route => testRouteSpeed(route));
  return Promise.all(testPromises);
}

/**
 * 选择最快线路（基于延迟）
 */
export function selectFastestRoute(
  routes: Route[],
  testResults: SpeedTestResult[]
): Route | null {
  // 过滤成功的测试结果
  const successfulResults = testResults.filter(result => result.success);
  
  if (successfulResults.length === 0) {
    return null;
  }
  
  // 按延迟排序
  successfulResults.sort((a, b) => a.latency - b.latency);
  
  // 找到对应的线路
  const fastestResult = successfulResults[0];
  const fastestRoute = routes.find(route => route.id === fastestResult.routeId);
  
  return fastestRoute || null;
}

/**
 * 更新线路统计数据
 */
export function updateRouteStats(
  route: Route,
  testResult: SpeedTestResult
): Route {
  const updatedRoute = { ...route };
  
  updatedRoute.lastTestTime = testResult.timestamp;
  updatedRoute.lastLatency = testResult.latency;
  
  // 计算平均延迟（简单移动平均）
  if (testResult.success) {
    if (updatedRoute.avgLatency === undefined) {
      updatedRoute.avgLatency = testResult.latency;
    } else {
      // 加权平均，新结果权重0.3，历史平均权重0.7
      updatedRoute.avgLatency = Math.round(
        updatedRoute.avgLatency * 0.7 + testResult.latency * 0.3
      );
    }
    
    // 计算成功率
    if (updatedRoute.successRate === undefined) {
      updatedRoute.successRate = testResult.success ? 100 : 0;
    } else {
      // 简单成功率计算
      const successIncrement = testResult.success ? 1 : 0;
      updatedRoute.successRate = Math.round(
        (updatedRoute.successRate * 0.8 + (successIncrement * 100 * 0.2))
      );
    }
  }
  
  return updatedRoute;
}

/**
 * 批量更新线路统计数据
 */
export function updateAllRouteStats(
  routes: Route[],
  testResults: SpeedTestResult[]
): Route[] {
  return routes.map(route => {
    const routeResult = testResults.find(result => result.routeId === route.id);
    if (routeResult) {
      return updateRouteStats(route, routeResult);
    }
    return route;
  });
}