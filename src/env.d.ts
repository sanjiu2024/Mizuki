/// <reference types="astro/client" />
/// <reference path="../.astro/types.d.ts" />

interface ImportMetaEnv {
  // 123网盘WebDAV配置
  readonly PAN123_USERNAME: string;
  readonly PAN123_PASSWORD: string;
  readonly PAN123_WEBDAV_URL: string;
  readonly PAN123_USE_KV?: string;
  readonly PAN123_KV_NAMESPACE_ID?: string;
  
  // 现有环境变量
  readonly ENABLE_CONTENT_SYNC: string;
  readonly CONTENT_REPO_URL: string;
  readonly CONTENT_DIR: string;
  readonly INDEXNOW_KEY: string;
  readonly INDEXNOW_HOST: string;
  readonly BILI_SESSDATA: string;
  
  // 负载均衡器配置
  readonly PUBLIC_HK_SERVER_URL?: string;
  readonly PUBLIC_CF_OPTIMIZED_URL?: string;
  readonly PUBLIC_SPEED_TEST_ENDPOINT?: string;
  readonly PUBLIC_LOAD_BALANCER_CACHE_DURATION?: string;
  readonly PUBLIC_LOAD_BALANCER_TEST_INTERVAL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}