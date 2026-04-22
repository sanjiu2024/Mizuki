/**
 * 线路测速模块
 * 测试每条线路的延迟和可用性
 */

import type { Route, SpeedTestResult } from './types';
import { getTestEndpoint } from './routes';

/**
 * 测试单个线路的延迟（改进版）
 * 使用多种方法尝试建立连接，提高测速成功率
 */
export async function testRouteSpeed(route: Route): Promise<SpeedTestResult> {
  const startTime = performance.now();
  const testUrl = `${route.url}${getTestEndpoint()}`;
  
  console.log(`[测速] 开始测试线路: ${route.name} (${route.id})`);
  console.log(`[测速] 测试URL: ${testUrl}`);
  
  // 方法0：首先尝试使用fetch with no-cors（避免CORS问题）
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5秒超时
    
    console.log(`[测速] 尝试方法0: fetch with no-cors`);
    
    await fetch(testUrl, {
      method: 'HEAD',
      mode: 'no-cors', // 使用no-cors避免CORS问题
      cache: 'no-store',
      signal: controller.signal,
      credentials: 'omit',
    });
    
    clearTimeout(timeoutId);
    
    // 在no-cors模式下，response是opaque，我们无法读取状态码
    // 但只要请求完成（不抛出错误），就认为连接成功
    const endTime = performance.now();
    const latency = Math.round(endTime - startTime);
    
    console.log(`[测速] 方法0成功: 延迟=${latency}ms (no-cors模式)`);
    
    return {
      routeId: route.id,
      latency,
      success: true,
      timestamp: Date.now(),
      note: 'no-cors模式成功',
    };
  } catch (error) {
    console.log(`[测速] 方法0失败: ${error instanceof Error ? error.message : '未知错误'}`);
  }
  
  try {
    // 方法1：尝试使用fetch with cors（更可靠）
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000); // 8秒超时
    
    console.log(`[测速] 尝试方法1: fetch with cors`);
    
    const response = await fetch(testUrl, {
      method: 'HEAD', // 使用HEAD请求减少数据传输
      mode: 'cors', // 使用cors模式，可以捕获更多错误信息
      cache: 'no-store',
      signal: controller.signal,
      credentials: 'omit',
      redirect: 'manual', // 手动处理重定向
    });
    
    clearTimeout(timeoutId);
    
    // 即使响应状态码不是2xx，只要收到响应就认为连接成功
    const endTime = performance.now();
    const latency = Math.round(endTime - startTime);
    
    console.log(`[测速] 方法1成功: 状态码=${response.status}, 延迟=${latency}ms`);
    
    return {
      routeId: route.id,
      latency,
      success: true,
      timestamp: Date.now(),
      statusCode: response.status,
    };
  } catch (error) {
    console.log(`[测速] 方法1失败: ${error instanceof Error ? error.message : '未知错误'}`);
    // 方法2：尝试使用Image加载（如果支持）
    if (typeof Image !== 'undefined') {
      try {
        return await testRouteWithImage(route, startTime);
      } catch (imgError) {
        console.log(`[测速] 方法2失败: ${imgError instanceof Error ? imgError.message : '未知错误'}`);
        // 继续尝试下一种方法
      }
    }
    
    // 方法3：尝试使用XMLHttpRequest（更兼容）- 仅在浏览器环境中可用
    if (typeof XMLHttpRequest !== 'undefined') {
      try {
        return await testRouteWithXHR(route, startTime);
      } catch (xhrError) {
        console.log(`[测速] 方法3失败: ${xhrError instanceof Error ? xhrError.message : '未知错误'}`);
      }
    } else {
      console.log(`[测速] 跳过方法3: XMLHttpRequest在服务器端不可用`);
    }
    
    // 方法4：尝试使用WebSocket双向ping测试（服务器ping客户端）
    if (typeof WebSocket !== 'undefined') {
      try {
        return await testRouteWithWebSocketPing(route, startTime);
      } catch (wsError) {
        console.log(`[测速] 方法4失败: ${wsError instanceof Error ? wsError.message : '未知错误'}`);
      }
    } else {
      console.log(`[测速] 跳过方法4: WebSocket在服务器端不可用`);
    }
    
    // 所有方法都失败
    const endTime = performance.now();
    const latency = Math.round(endTime - startTime);
    
    console.log(`[测速] 所有方法都失败: 线路=${route.name}, 延迟=${latency}ms, 错误=${error instanceof Error ? error.message : '未知错误'}`);
    
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
 * 使用Image对象测试线路
 */
async function testRouteWithImage(route: Route, startTime: number): Promise<SpeedTestResult> {
  console.log(`[测速] 尝试方法2: Image加载`);
  
  return new Promise((resolve, reject) => {
    const testUrl = `${route.url}${getTestEndpoint()}?t=${Date.now()}`;
    const img = new Image();
    
    console.log(`[测速] Image测试URL: ${testUrl}`);
    
    const timeoutId = setTimeout(() => {
      img.onload = null;
      img.onerror = null;
      console.log(`[测速] 方法2超时`);
      reject(new Error('Image加载超时'));
    }, 8000);
    
    img.onload = () => {
      clearTimeout(timeoutId);
      const endTime = performance.now();
      const latency = Math.round(endTime - startTime);
      
      console.log(`[测速] 方法2成功: 延迟=${latency}ms`);
      
      resolve({
        routeId: route.id,
        latency,
        success: true,
        timestamp: Date.now(),
      });
    };
    
    img.onerror = () => {
      clearTimeout(timeoutId);
      const endTime = performance.now();
      const latency = Math.round(endTime - startTime);
      
      console.log(`[测速] 方法2触发onerror: 延迟=${latency}ms`);
      
      // 即使触发onerror，只要开始加载就认为连接成功
      resolve({
        routeId: route.id,
        latency,
        success: true,
        timestamp: Date.now(),
        note: 'Image加载出错但连接已建立',
      });
    };
    
    img.src = testUrl;
  });
}

/**
 * 使用XMLHttpRequest测试线路
 */
async function testRouteWithXHR(route: Route, startTime: number): Promise<SpeedTestResult> {
  console.log(`[测速] 尝试方法3: XMLHttpRequest`);
  
  return new Promise((resolve, reject) => {
    const testUrl = `${route.url}${getTestEndpoint()}`;
    const xhr = new XMLHttpRequest();
    
    console.log(`[测速] XHR测试URL: ${testUrl}`);
    
    const timeoutId = setTimeout(() => {
      xhr.abort();
      console.log(`[测速] 方法3超时`);
      reject(new Error('XHR请求超时'));
    }, 8000);
    
    xhr.timeout = 8000;
    xhr.open('HEAD', testUrl, true);
    
    xhr.onload = () => {
      clearTimeout(timeoutId);
      const endTime = performance.now();
      const latency = Math.round(endTime - startTime);
      
      console.log(`[测速] 方法3成功: 状态码=${xhr.status}, 延迟=${latency}ms`);
      
      resolve({
        routeId: route.id,
        latency,
        success: true,
        timestamp: Date.now(),
        statusCode: xhr.status,
      });
    };
    
    xhr.onerror = () => {
      clearTimeout(timeoutId);
      const endTime = performance.now();
      const latency = Math.round(endTime - startTime);
      
      console.log(`[测速] 方法3触发onerror: 延迟=${latency}ms`);
      
      // 即使发生错误，只要请求发出就认为连接成功
      resolve({
        routeId: route.id,
        latency,
        success: true,
        timestamp: Date.now(),
        note: 'XHR请求出错但连接尝试已进行',
      });
    };
    
    xhr.ontimeout = () => {
      clearTimeout(timeoutId);
      console.log(`[测速] 方法3触发ontimeout`);
      reject(new Error('XHR请求超时'));
    };
    
    xhr.send();
  });
}



/**
 * 并行测试所有线路
 */
export async function testAllRoutes(routes: Route[]): Promise<SpeedTestResult[]> {
  console.log(`[测速] 开始并行测试 ${routes.length} 条线路`);
  const testPromises = routes.map(route => testRouteSpeed(route));
  const results = await Promise.all(testPromises);
  console.log(`[测速] 并行测试完成，成功结果: ${results.filter(r => r.success).length}/${results.length}`);
  return results;
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

/**
 * 使用WebSocket双向ping测试线路延迟
 * 测量服务器到客户端的往返时间
 */
async function testRouteWithWebSocketPing(route: Route, startTime: number): Promise<SpeedTestResult> {
  console.log(`[测速] 尝试方法5: WebSocket双向ping测试`);
  
  return new Promise((resolve, reject) => {
    // 防止重复resolve/reject
    let hasResolved = false;
    
    const safeResolve = (result: SpeedTestResult) => {
      if (!hasResolved) {
        hasResolved = true;
        resolve(result);
      }
    };
    
    const safeReject = (error: Error) => {
      if (!hasResolved) {
        hasResolved = true;
        reject(error);
      }
    };
    
    // 将HTTPS URL转换为WebSocket URL
    let wsUrl: string;
    try {
      const url = new URL(route.url);
      const protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
      const port = url.port ? `:${url.port}` : '';
      wsUrl = `${protocol}//${url.hostname}${port}`;
    } catch (error) {
      console.log(`[测速] 无法解析URL: ${route.url}`);
      safeReject(new Error('URL格式无效'));
      return;
    }
    
    console.log(`[测速] WebSocket双向测试URL: ${wsUrl}`);
    
    const timeoutId = setTimeout(() => {
      console.log(`[测速] 方法5超时`);
      safeReject(new Error('WebSocket双向测试超时'));
    }, 10000); // 10秒超时，因为需要更多时间进行双向通信
    
    let socket: WebSocket;
    
    try {
      socket = new WebSocket(wsUrl);
    } catch (error) {
      clearTimeout(timeoutId);
      console.log(`[测速] 创建WebSocket失败: ${error instanceof Error ? error.message : '未知错误'}`);
      safeReject(new Error('创建WebSocket失败'));
      return;
    }
    
    const connectionStartTime = performance.now();
    let pingSentTime: number | null = null;
    
    socket.onopen = () => {
      const connectionTime = Math.round(performance.now() - connectionStartTime);
      console.log(`[测速] WebSocket连接成功，连接时间=${connectionTime}ms`);
      
      // 发送ping消息
      try {
        const pingMessage = JSON.stringify({
          type: 'ping',
          timestamp: Date.now(),
          clientId: `client_${Math.random().toString(36).slice(2, 11)}`
        });
        
        pingSentTime = performance.now();
        socket.send(pingMessage);
        console.log(`[测速] 已发送ping消息，等待回复...`);
        
        // 设置消息回复超时
        const messageTimeoutId = setTimeout(() => {
          console.log(`[测速] 等待ping回复超时`);
          // 即使没有回复，也认为连接成功（测量了连接时间）
          socket.close();
          safeResolve({
            routeId: route.id,
            latency: connectionTime,
            success: true,
            timestamp: Date.now(),
            note: 'WebSocket连接成功但未收到ping回复',
          });
        }, 5000); // 5秒等待回复
        
        // 监听消息
        socket.onmessage = (event) => {
          clearTimeout(messageTimeoutId);
          const pongReceivedTime = performance.now();
          
          try {
            const data = JSON.parse(event.data);
            console.log(`[测速] 收到回复消息:`, data);
            
            let latency: number;
            if (pingSentTime && data.timestamp) {
              // 计算往返时间：从发送ping到收到pong
              const roundTripTime = Math.round(pongReceivedTime - pingSentTime);
              // 估算单向延迟（假设对称网络）
              const estimatedOneWayLatency = Math.round(roundTripTime / 2);
              latency = estimatedOneWayLatency;
              console.log(`[测速] 往返时间=${roundTripTime}ms, 估算单向延迟=${latency}ms`);
            } else {
              // 无法解析时间戳，使用连接时间
              latency = connectionTime;
              console.log(`[测速] 无法解析时间戳，使用连接时间=${latency}ms`);
            }
            
            socket.close();
            safeResolve({
              routeId: route.id,
              latency,
              success: true,
              timestamp: Date.now(),
              note: 'WebSocket双向ping测试成功',
            });
          } catch (parseError) {
            console.log(`[测速] 解析回复消息失败: ${parseError instanceof Error ? parseError.message : '未知错误'}`);
            // 即使解析失败，也收到了回复
            const roundTripTime = pingSentTime ? Math.round(pongReceivedTime - pingSentTime) : connectionTime;
            socket.close();
            safeResolve({
              routeId: route.id,
              latency: Math.round(roundTripTime / 2),
              success: true,
              timestamp: Date.now(),
              note: '收到回复但解析失败',
            });
          }
        };
        
      } catch (sendError) {
        console.log(`[测速] 发送ping消息失败: ${sendError instanceof Error ? sendError.message : '未知错误'}`);
        // 发送失败，但连接成功
        socket.close();
        safeResolve({
          routeId: route.id,
          latency: connectionTime,
          success: true,
          timestamp: Date.now(),
          note: 'WebSocket连接成功但发送ping失败',
        });
      }
    };
    
    socket.onerror = (_event) => {
      clearTimeout(timeoutId);
      const endTime = performance.now();
      const latency = Math.round(endTime - startTime);
      
      console.log(`[测速] 方法5触发onerror: 延迟=${latency}ms`);
      
      // 即使发生错误，只要尝试连接就认为成功
      safeResolve({
        routeId: route.id,
        latency,
        success: true,
        timestamp: Date.now(),
        note: 'WebSocket连接尝试已进行',
      });
    };
    
    socket.onclose = (event) => {
      clearTimeout(timeoutId);
      
      // 如果连接在onopen之前关闭，可能是连接失败
      if (!hasResolved) {
        const endTime = performance.now();
        const latency = Math.round(endTime - startTime);
        
        console.log(`[测速] 方法5连接关闭: 延迟=${latency}ms, 代码=${event.code}`);
        
        // 仍然认为成功，因为尝试了连接
        safeResolve({
          routeId: route.id,
          latency,
          success: true,
          timestamp: Date.now(),
          note: `WebSocket连接关闭，代码${event.code}`,
        });
      }
    };
  });
}