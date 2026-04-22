/**
 * 负载均衡器主模块
 * 管理线路测速、选择最快线路、提供URL重写功能
 */

import type { Route, SpeedTestResult, LoadBalancerConfig, LoadBalancerStats } from './types';
import { getRoutes, validateRoute } from './routes';
import { testAllRoutes, selectFastestRoute, updateAllRouteStats } from './speed-test';

export class LoadBalancer {
  private config: LoadBalancerConfig;
  private routes: Route[] = [];
  private selectedRoute: Route | null = null;
  private testResults: SpeedTestResult[] = [];
  private lastTestTime: number = 0;
  private cacheKey = 'load-balancer-cache';
  
  constructor(config?: Partial<LoadBalancerConfig>) {
    this.config = {
      routes: getRoutes(),
      testEndpoint: '/favicon.ico',
      testInterval: 300000, // 5分钟
      cacheDuration: 3600000, // 1小时
      fallbackRouteId: 'cf-default',
      enableCache: true,
      ...config,
    };
    
    this.routes = this.config.routes.filter(route => {
      const isValid = validateRoute(route);
      if (!isValid && route.enabled) {
        console.warn(`线路 ${route.name} (${route.id}) 配置无效，已禁用`);
      }
      return isValid && route.enabled;
    });
    
    this.loadFromCache();
  }
  
  /**
   * 初始化负载均衡器
   */
  async initialize(): Promise<void> {
    if (this.shouldRunTest()) {
      await this.runSpeedTest();
    } else if (this.selectedRoute) {
      console.log(`使用缓存的线路: ${this.selectedRoute.name}`);
    } else {
      await this.runSpeedTest();
    }
  }
  
  /**
   * 运行速度测试
   */
  async runSpeedTest(): Promise<void> {
    console.log('开始线路测速...');
    console.log(`测速线路数量: ${this.routes.length}`);
    this.routes.forEach((route, i) => {
      console.log(`线路${i + 1}: ${route.name} (${route.id}) - ${route.url}`);
    });
    
    try {
      this.testResults = await testAllRoutes(this.routes);
      this.lastTestTime = Date.now();
      
      console.log(`测速完成，结果数量: ${this.testResults.length}`);
      
      // 更新线路统计数据
      this.routes = updateAllRouteStats(this.routes, this.testResults);
      
      // 选择最快线路
      this.selectedRoute = selectFastestRoute(this.routes, this.testResults);
      
      // 如果没有成功线路，使用备用线路
      if (!this.selectedRoute && this.config.fallbackRouteId) {
        this.selectedRoute = this.routes.find(route => route.id === this.config.fallbackRouteId) || null;
        console.log(`没有成功线路，使用备用线路: ${this.config.fallbackRouteId}`);
      }
      
      // 保存到缓存
      this.saveToCache();
      
      this.logTestResults();
    } catch (error) {
      console.error('测速过程中发生错误:', error);
      throw error;
    }
  }
  
  /**
   * 获取最快线路
   */
  getFastestRoute(): Route | null {
    return this.selectedRoute;
  }
  
  /**
   * 获取所有线路
   */
  getAllRoutes(): Route[] {
    return [...this.routes];
  }
  
  /**
   * 获取测试结果
   */
  getTestResults(): SpeedTestResult[] {
    return [...this.testResults];
  }
  
  /**
   * 获取统计信息
   */
  getStats(): LoadBalancerStats {
    return {
      selectedRoute: this.selectedRoute,
      allRoutes: this.routes,
      testResults: this.testResults,
      lastTestTime: this.lastTestTime,
    };
  }
  
  /**
   * 重写URL到最快线路
   */
  rewriteUrl(originalUrl: string): string {
    if (!this.selectedRoute || !originalUrl) {
      return originalUrl;
    }
    
    try {
      const url = new URL(originalUrl);
      const selectedUrl = new URL(this.selectedRoute.url);
      
      // 替换域名部分，保留路径和查询参数
      url.protocol = selectedUrl.protocol;
      url.hostname = selectedUrl.hostname;
      url.port = selectedUrl.port;
      
      return url.toString();
    } catch {
      // 如果URL解析失败，尝试简单替换
      if (originalUrl.startsWith('/')) {
        // 相对路径
        return `${this.selectedRoute.url}${originalUrl}`;
      }
      
      return originalUrl;
    }
  }
  
  /**
   * 手动选择线路
   */
  selectRoute(routeId: string): boolean {
    const route = this.routes.find(r => r.id === routeId);
    if (route) {
      this.selectedRoute = route;
      this.saveToCache();
      return true;
    }
    return false;
  }
  
  /**
   * 检查是否需要运行测试
   */
  private shouldRunTest(): boolean {
    if (!this.config.enableCache) {
      return true;
    }
    
    const now = Date.now();
    const timeSinceLastTest = now - this.lastTestTime;
    
    // 如果从未测试过，或者缓存已过期，或者没有选中线路
    if (this.lastTestTime === 0 || timeSinceLastTest > this.config.cacheDuration! || !this.selectedRoute) {
      return true;
    }
    
    return false;
  }
  
  /**
   * 从缓存加载
   */
  private loadFromCache(): void {
    if (!this.config.enableCache || typeof localStorage === 'undefined') {
      return;
    }
    
    try {
      const cached = localStorage.getItem(this.cacheKey);
      if (cached) {
        const data = JSON.parse(cached);
        
        // 检查缓存是否过期
        const now = Date.now();
        if (now - data.timestamp < this.config.cacheDuration!) {
          this.selectedRoute = data.selectedRoute;
          this.lastTestTime = data.lastTestTime;
          this.routes = data.routes || this.routes;
          this.testResults = data.testResults || [];
        }
      }
    } catch (error) {
      console.warn('加载缓存失败:', error);
    }
  }
  
  /**
   * 保存到缓存
   */
  private saveToCache(): void {
    if (!this.config.enableCache || typeof localStorage === 'undefined') {
      return;
    }
    
    try {
      const data = {
        selectedRoute: this.selectedRoute,
        lastTestTime: this.lastTestTime,
        routes: this.routes,
        testResults: this.testResults,
        timestamp: Date.now(),
      };
      
      localStorage.setItem(this.cacheKey, JSON.stringify(data));
    } catch (error) {
      console.warn('保存缓存失败:', error);
    }
  }
  
  /**
   * 记录测试结果
   */
  private logTestResults(): void {
    console.group('线路测速结果');
    
    this.testResults.forEach(result => {
      const route = this.routes.find(r => r.id === result.routeId);
      const status = result.success ? '✓' : '✗';
      const latency = result.latency ? `${result.latency}ms` : '超时';
      console.log(`${status} ${route?.name}: ${latency} ${result.error ? `(${result.error})` : ''}`);
    });
    
    if (this.selectedRoute) {
      console.log(`最快线路: ${this.selectedRoute.name}`);
    } else {
      console.warn('没有可用的线路');
    }
    
    console.groupEnd();
  }
}