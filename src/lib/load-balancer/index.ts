/**
 * 负载均衡器模块入口
 */

import { LoadBalancer as LoadBalancerClass } from './balancer';
export * from './types';
export * from './routes';
export * from './speed-test';
export * from './balancer';

// 默认导出负载均衡器类
export { LoadBalancer } from './balancer';

// 工具函数：创建并初始化负载均衡器
export async function createLoadBalancer(config?: Partial<import('./types').LoadBalancerConfig>) {
  const balancer = new LoadBalancerClass(config);
  await balancer.initialize();
  return balancer;
}

// 工具函数：获取最快线路URL
export async function getFastestRouteUrl(config?: Partial<import('./types').LoadBalancerConfig>): Promise<string | null> {
  const balancer = await createLoadBalancer(config);
  const route = balancer.getFastestRoute();
  return route?.url || null;
}

// 工具函数：重写URL到最快线路
export async function rewriteToFastestUrl(originalUrl: string, config?: Partial<import('./types').LoadBalancerConfig>): Promise<string> {
  const balancer = await createLoadBalancer(config);
  return balancer.rewriteUrl(originalUrl);
}