# 负载均衡器配置指南

## 概述

本负载均衡器系统允许您的网站在三条线路之间自动选择最快线路：
1. **Cloudflare默认线路** - 您的网站当前使用的Cloudflare CDN
2. **Cloudflare优选线路** - 使用优选IP的Cloudflare线路
3. **香港服务器线路** - 自建香港服务器线路

每次访问网站时，系统会自动测试三条线路的延迟，并选择最快的线路提供服务。

## 快速开始

### 1. 环境变量配置

在项目根目录创建或编辑 `.env` 文件，添加以下配置：

```env
# 香港服务器URL（必须配置）
# 示例：https://www.hscraft.online:10222 （使用非标准HTTPS端口10222）
# 注意：香港服务器HTTP端口为10115，HTTPS端口为10222
PUBLIC_HK_SERVER_URL=https://www.hscraft.online:10222

# Cloudflare优选线路URL（可选，默认使用提供的优选域名）
PUBLIC_CF_OPTIMIZED_URL=https://youxuan.cf.090227.xyz

# 测速端点（可选，默认使用/favicon.ico）
PUBLIC_SPEED_TEST_ENDPOINT=/favicon.ico
```

### 2. 在页面中使用

在您的Astro组件中引入负载均衡器：

```astro
---
import { createLoadBalancer } from '../lib/load-balancer';
const balancer = await createLoadBalancer();
const fastestRoute = balancer.getFastestRoute();
---

<!-- 显示当前使用的线路 -->
<div class="load-balancer-status">
  <p>当前线路: {fastestRoute?.name || '未选择'}</p>
  <p>线路URL: {fastestRoute?.url || '无'}</p>
</div>

<!-- 使用重写后的URL -->
<a href={balancer.rewriteUrl('/api/data')}>访问API</a>
```

### 3. 全局集成

在布局文件中集成，自动重写所有链接：

```astro
---
// src/layouts/Layout.astro
import { createLoadBalancer } from '../lib/load-balancer';
const balancer = await createLoadBalancer();
---

<html lang="zh-CN">
  <head>
    <script>
      // 将负载均衡器实例暴露给全局
      window.loadBalancer = {
        rewriteUrl: (url) => {
          // 这里可以使用从服务器传递的数据
          const fastestRouteUrl = '<%= fastestRoute?.url %>';
          if (fastestRouteUrl && url.startsWith('/')) {
            return `${fastestRouteUrl}${url}`;
          }
          return url;
        }
      };
    </script>
  </head>
  <body>
    <slot />
  </body>
</html>
```

## 香港服务器线路配置

### 方案一：使用Nginx反向代理

#### 1. 服务器要求
- 香港服务器（推荐CN2 GIA线路）
- Ubuntu 20.04+ / CentOS 7+
- 公网IP地址
- 域名（可选，建议使用）

#### 2. 安装Nginx

```bash
# Ubuntu/Debian
sudo apt update
sudo apt install nginx -y

# CentOS/RHEL
sudo yum install epel-release -y
sudo yum install nginx -y
```

#### 3. 配置Nginx反向代理

创建配置文件 `/etc/nginx/sites-available/your-site`：

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name your-hk-server.com; # 替换为您的域名或IP，例如：www.hscraft.online
    
    # 重定向到HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name your-hk-server.com; # 替换为您的域名，例如：www.hscraft.online
    
    # SSL证书（使用Let's Encrypt）
    ssl_certificate /etc/letsencrypt/live/your-hk-server.com/fullchain.pem; # 替换为您的域名
    ssl_certificate_key /etc/letsencrypt/live/your-hk-server.com/privkey.pem; # 替换为您的域名
    
    # SSL配置
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512;
    ssl_prefer_server_ciphers off;
    
    # 反向代理到您的Cloudflare Pages网站
    location / {
        proxy_pass https://your-cloudflare-pages-site.pages.dev;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # 优化设置
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
        proxy_buffering off;
        proxy_cache off;
    }
    
    # 静态文件缓存
    location ~* \.(jpg|jpeg|png|gif|ico|css|js|webp)$ {
        proxy_pass https://your-cloudflare-pages-site.pages.dev;
        proxy_cache hk_cache;
        proxy_cache_valid 200 302 1h;
        proxy_cache_valid 404 1m;
        add_header X-Cache-Status $upstream_cache_status;
    }
}

# 缓存配置
proxy_cache_path /var/cache/nginx levels=1:2 keys_zone=hk_cache:10m max_size=1g inactive=60m use_temp_path=off;
```

#### 4. 启用站点并重启Nginx

```bash
# 创建符号链接
sudo ln -s /etc/nginx/sites-available/your-site /etc/nginx/sites-enabled/

# 测试配置
sudo nginx -t

# 重启Nginx
sudo systemctl restart nginx
```

#### 5. 配置防火墙

```bash
# 开放端口
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw reload
```

### 方案二：使用Caddy服务器（更简单）

#### 1. 安装Caddy

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install caddy
```

#### 2. 配置Caddy

编辑 `/etc/caddy/Caddyfile`：

```caddy
your-hk-server.com { # 替换为您的域名，例如：www.hscraft.online
    reverse_proxy https://your-cloudflare-pages-site.pages.dev {
        header_up Host {upstream_hostport}
        header_up X-Real-IP {remote_host}
    }
    
    # 自动HTTPS
    tls {
        dns cloudflare {env.CLOUDFLARE_API_TOKEN}
    }
}
```

#### 3. 重启Caddy

```bash
sudo systemctl restart caddy
```

### 方案三：使用Cloudflare Tunnel（无需公网IP）

#### 1. 安装Cloudflared

```bash
# Ubuntu/Debian
wget -q https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i cloudflared-linux-amd64.deb

# CentOS/RHEL
sudo yum install https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-x86_64.rpm
```

#### 2. 登录Cloudflare

```bash
cloudflared tunnel login
```

#### 3. 创建隧道

```bash
cloudflared tunnel create hk-tunnel
```

#### 4. 配置隧道

创建配置文件 `~/.cloudflared/config.yml`：

```yaml
tunnel: <隧道ID>
credentials-file: /root/.cloudflared/<隧道ID>.json

ingress:
  - hostname: your-hk-server.com # 替换为您的域名，例如：www.hscraft.online
    service: https://your-cloudflare-pages-site.pages.dev
  - service: http_status:404
```

#### 5. 运行隧道

```bash
# 测试运行
cloudflared tunnel run hk-tunnel

# 作为服务运行
sudo cloudflared service install
sudo systemctl start cloudflared
```

### 方案四：NAT转发配置

如果您的香港服务器位于NAT网络后，有以下几种解决方案：

#### 情况一：路由器有公网IP且支持端口映射（推荐）

如果您的路由器有公网IP并且您有路由器管理权限，可以直接配置端口映射：

1. **登录路由器管理界面**
   - 通常访问 `http://192.168.1.1` 或 `http://192.168.0.1`
   - 使用管理员账号密码登录

2. **查找端口映射/虚拟服务器设置**
   - 不同路由器名称可能不同：端口转发、端口映射、虚拟服务器、NAT设置等

3. **添加端口映射规则**
   ```
   外部端口：80,443 (或自定义端口如8080,8443)
   内部IP地址：香港服务器的内网IP（如192.168.1.100）
   内部端口：80,443
   协议：TCP
   启用：是
   ```

4. **配置动态DNS（如果使用域名）**
   - 如果您的公网IP是动态的，需要配置DDNS服务
   - 常见DDNS服务：花生壳、no-ip、dynDNS
   - 在路由器或服务器上配置DDNS客户端

5. **验证端口映射**
   ```bash
   # 从外部网络测试
   curl -I http://您的公网IP:80
   curl -I https://您的公网IP:443
   ```

#### 情况二：路由器无公网IP或无法配置端口映射

如果您的路由器没有公网IP（如小区宽带、企业网络）或无法配置端口映射，需要使用内网穿透工具。

### 方案五：使用FRP内网穿透（高级方案）

如果上述端口映射不可用，可以使用FRP（Fast Reverse Proxy）进行内网穿透。

#### 1. 准备公网服务器
您需要一台具有公网IP的服务器作为FRP服务端（可以是便宜的VPS，如阿里云、腾讯云等）。

#### 2. 在公网服务器安装FRP服务端

```bash
# 下载FRP
wget https://github.com/fatedier/frp/releases/download/v0.52.3/frp_0.52.3_linux_amd64.tar.gz
tar -zxvf frp_0.52.3_linux_amd64.tar.gz
cd frp_0.52.3_linux_amd64

# 配置服务端
cat > frps.ini << EOF
[common]
bind_port = 7000
bind_addr = 0.0.0.0

# 网页管理界面
dashboard_port = 7500
dashboard_user = admin
dashboard_pwd = your_password

# 认证令牌
token = your_token_123456

# HTTP服务端口（Nginx将代理到此端口）
vhost_http_port = 8080
EOF

# 配置防火墙（如果启用）
sudo ufw allow 7000/tcp  # FRP控制端口
sudo ufw allow 7500/tcp  # 管理界面端口
sudo ufw allow 8080/tcp  # HTTP服务端口
sudo ufw allow 80/tcp    # Nginx HTTP端口
sudo ufw allow 443/tcp   # Nginx HTTPS端口
sudo ufw reload

# 启动服务端
./frps -c frps.ini
```

#### 3. 在香港服务器（NAT内网）安装FRP客户端

```bash
# 下载FRP
wget https://github.com/fatedier/frp/releases/download/v0.52.3/frp_0.52.3_linux_amd64.tar.gz
tar -zxvf frp_0.52.3_linux_amd64.tar.gz
cd frp_0.52.3_linux_amd64

# 配置客户端
cat > frpc.ini << EOF
[common]
server_addr = your-public-server-ip  # 公网服务器IP
server_port = 7000
token = your_token_123456

# Web服务映射（HTTP）
[web]
type = http
local_port = 80
local_ip = 127.0.0.1
custom_domains = your-hk-server.com # 替换为您的域名，例如：www.hscraft.online
EOF

# 启动客户端
./frpc -c frpc.ini
```

#### 4. 配置Nginx反向代理（在公网服务器上）

在公网服务器上安装Nginx，配置反向代理到FRP端口：

```nginx
server {
    listen 80;
    server_name your-hk-server.com; # 替换为您的域名，例如：www.hscraft.online
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl;
    server_name your-hk-server.com; # 替换为您的域名，例如：www.hscraft.online
    
    ssl_certificate /etc/letsencrypt/live/your-hk-server.com/fullchain.pem; # 替换为您的域名
    ssl_certificate_key /etc/letsencrypt/live/your-hk-server.com/privkey.pem; # 替换为您的域名
    
    location / {
        proxy_pass http://127.0.0.1:8080;  # FRP映射的端口
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

#### 5. 配置系统服务（可选）

创建systemd服务以便开机自启：

```bash
# 服务端
sudo cat > /etc/systemd/system/frps.service << EOF
[Unit]
Description=FRP Server
After=network.target

[Service]
Type=simple
User=root
ExecStart=/path/to/frps -c /path/to/frps.ini
Restart=on-failure

[Install]
WantedBy=multi-user.target
EOF

# 客户端
sudo cat > /etc/systemd/system/frpc.service << EOF
[Unit]
Description=FRP Client
After=network.target

[Service]
Type=simple
User=root
ExecStart=/path/to/frpc -c /path/to/frpc.ini
Restart=on-failure

[Install]
WantedBy=multi-user.target
EOF

# 启用服务
sudo systemctl daemon-reload
sudo systemctl enable frps
sudo systemctl enable frpc
sudo systemctl start frps
sudo systemctl start frpc
```

#### 6. 验证连接

访问 `http://your-public-server-ip:7500` 使用admin/your_password登录FRP管理界面，查看连接状态。

### NAT转发方案选择建议

根据您的网络环境，选择合适的NAT转发方案：

| 网络环境 | 推荐方案 | 说明 |
|---------|---------|------|
| **有公网IP，可配置路由器** | **端口映射**（方案四情况一） | 最简单直接，性能最好，无需额外服务器 |
| **无公网IP，有VPS预算** | **FRP内网穿透**（方案五） | 稳定可靠，需要额外公网服务器 |
| **无公网IP，无VPS预算** | **Cloudflare Tunnel**（方案三） | 免费，无需公网服务器，但依赖Cloudflare |
| **企业网络，有防火墙限制** | **Nginx/Caddy反向代理**（方案一/二） | 需要香港服务器有公网IP或VPN连接 |
| **快速测试/临时使用** | **临时FRP/ngrok** | 使用免费内网穿透服务临时测试 |

**决策流程：**
1. 检查路由器是否有公网IP：访问 `https://www.ip138.com` 查看IP，与路由器WAN口IP对比
2. 尝试配置端口映射：如果有公网IP且能登录路由器
3. 如果端口映射不可用：考虑FRP（有VPS）或Cloudflare Tunnel（无VPS）
4. 如果香港服务器有公网IP：直接使用Nginx/Caddy反向代理

**性能对比：**
- **端口映射**：延迟最低，带宽最大（直接转发）
- **FRP**：中等延迟，依赖公网服务器带宽
- **Cloudflare Tunnel**：延迟较高，但全球加速
- **反向代理**：延迟取决于香港服务器网络质量

## 测试线路

### 手动测试

在浏览器控制台中运行：

```javascript
import('/src/lib/load-balancer/index.ts').then(async module => {
  const balancer = await module.createLoadBalancer();
  await balancer.runSpeedTest();
  const stats = balancer.getStats();
  console.log('测速结果:', stats);
});
```

### 自动测试

负载均衡器会自动：
1. 首次访问时测试所有线路
2. 缓存结果1小时
3. 缓存过期后重新测试
4. 线路失败时自动切换到备用线路

## 高级配置

### 自定义线路

在代码中自定义线路：

```typescript
import { LoadBalancer } from '../lib/load-balancer';

const customConfig = {
  routes: [
    {
      id: 'custom-1',
      name: '自定义线路1',
      url: 'https://custom1.example.com',
      enabled: true,
      priority: 1,
    },
    {
      id: 'custom-2', 
      name: '自定义线路2',
      url: 'https://custom2.example.com',
      enabled: true,
      priority: 2,
    },
  ],
  testInterval: 600000, // 10分钟
  cacheDuration: 1800000, // 30分钟
};

const balancer = new LoadBalancer(customConfig);
```

### 监控和日志

启用详细日志：

```javascript
const balancer = new LoadBalancer({
  enableCache: true,
});

// 监听线路变化
setInterval(async () => {
  await balancer.runSpeedTest();
  const stats = balancer.getStats();
  
  // 发送到监控系统
  fetch('/api/monitor', {
    method: 'POST',
    body: JSON.stringify(stats),
  });
}, 300000); // 每5分钟
```

## 故障排除

### 常见问题

1. **香港服务器无法访问**
   - 检查防火墙设置（确保端口10115和10222开放）
   - 验证域名解析（例如：`nslookup www.hscraft.online`）
   - 测试服务器连通性：`curl -I https://your-hk-server.com:10222`（使用HTTPS端口10222）
   - 如果使用非标准端口，确保URL中包含端口号（如`https://www.hscraft.online:10222`）

2. **测速失败**
   - 检查CORS设置
   - 验证测试端点可访问
   - 检查网络连接

3. **线路切换不及时**
   - 调整`testInterval`和`cacheDuration`
   - 检查本地存储是否被清除

4. **性能问题**
   - 减少测速频率
   - 使用更小的测试文件
   - 启用缓存

### 调试信息

在浏览器控制台查看调试信息：

```javascript
localStorage.getItem('load-balancer-cache')
```

## 性能优化建议

1. **测速优化**
   - 使用小文件（如favicon.ico）进行测试
   - 并行测试所有线路
   - 设置合理的超时时间（3-5秒）

2. **缓存策略**
   - 成功线路缓存1小时
   - 失败线路5分钟后重试
   - 使用localStorage持久化缓存

3. **回退机制**
   - 所有线路失败时使用Cloudflare默认线路
   - 线路恢复后自动切换回最快线路
   - 定期验证线路可用性

## 安全注意事项

1. **HTTPS必需**
   - 所有线路必须使用HTTPS
   - 验证SSL证书有效性
   - 避免中间人攻击

2. **输入验证**
   - 验证所有URL格式
   - 过滤恶意输入
   - 限制重写范围

3. **隐私保护**
   - 测速数据仅存储在本地
   - 不收集用户个人信息
   - 定期清理缓存数据

## 更新日志

### v1.0.0 (2024-01-01)
- 初始版本发布
- 支持三条线路负载均衡
- 自动测速和线路选择
- 本地缓存支持
- 香港服务器配置指南

---

**注意**：本系统需要用户自行配置香港服务器。配置前请确保您有服务器的访问权限和基本的Linux操作知识。