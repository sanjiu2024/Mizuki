/**
 * 负载均衡器组件类型定义
 */

export interface LoadBalancerStatusProps {
  /**
   * 是否显示详细统计信息
   */
  showDetails?: boolean;
  
  /**
   * 是否自动刷新
   */
  autoRefresh?: boolean;
  
  /**
   * 刷新间隔（毫秒）
   */
  refreshInterval?: number;
  
  /**
   * 自定义CSS类名
   */
  className?: string;
}