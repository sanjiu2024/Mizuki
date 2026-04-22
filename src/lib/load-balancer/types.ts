/**
 * 负载均衡器类型定义
 */

export interface Route {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  priority: number;
  lastTestTime?: number;
  lastLatency?: number;
  avgLatency?: number;
  successRate?: number;
}

export interface SpeedTestResult {
  routeId: string;
  latency: number;
  success: boolean;
  timestamp: number;
  error?: string;
  statusCode?: number;
  note?: string;
}

export interface LoadBalancerConfig {
  routes: Route[];
  testEndpoint?: string;
  testInterval?: number;
  cacheDuration?: number;
  fallbackRouteId?: string;
  enableCache?: boolean;
}

export interface LoadBalancerStats {
  selectedRoute: Route | null;
  allRoutes: Route[];
  testResults: SpeedTestResult[];
  lastTestTime: number;
}