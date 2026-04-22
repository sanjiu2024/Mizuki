# 123网盘集成使用手册

本文档详细说明如何在Mizuki博客中集成123网盘WebDAV功能，实现在文章中直接引用和下载123网盘中的文件。

## 功能概述

通过本集成，您可以在Markdown文章中：
1. 使用特定语法引用123网盘中的文件
2. 自动获取文件信息（大小、修改时间）
3. 生成可点击的下载链接
4. 支持文件缓存（通过Cloudflare KV，可选）

## 环境配置

### 1. 配置环境变量

复制 `.env.example` 文件为 `.env`，并配置以下变量：

```env
# 123网盘WebDAV配置
PAN123_USERNAME=X          # 您的123网盘账号（手机号）
PAN123_PASSWORD=X             # 您的123网盘密码
PAN123_WEBDAV_URL=X  # WebDAV地址

# 可选：Cloudflare KV缓存配置
# PAN123_USE_KV=false                # 是否启用KV缓存
# PAN123_KV_NAMESPACE_ID=your_kv_namespace_id  # KV命名空间ID
```

### 2. 部署到Cloudflare

确保您的网站已部署到Cloudflare Pages，并正确配置环境变量：

1. 在Cloudflare Dashboard中进入您的Pages项目
2. 进入 **Settings** → **Environment variables**
3. 添加上述环境变量（生产环境）
4. 重新部署项目

## 使用方法

### 在Markdown文章中使用

#### 方法一：文件卡片组件（推荐）

使用 `::pan123` 或 `::pan123-file` 指令创建美观的文件卡片：

````markdown
::pan123{path="/文档/项目报告.pdf"}

::pan123-file{
  path="/视频/教程.mp4",
  name="视频教程下载",
  icon="material-symbols:video-file"
}
````

**参数说明：**
- `path`：**必需**，文件在123网盘中的完整路径
- `name`：可选，自定义显示的文件名
- `icon`：可选，自定义图标（使用Iconify图标名称）

#### 方法二：内联链接组件

使用 `::pan123-link` 指令创建简洁的内联下载链接：

````markdown
点击此处下载 [::pan123-link{path="/文档/手册.pdf"}] 文件。

或者使用自定义名称：[::pan123-link{path="/软件/安装包.exe" name="下载安装包"}]
````

**参数说明：**
- `path`：**必需**，文件在123网盘中的完整路径
- `name`：可选，自定义显示的链接文本

#### 方法三：直接API调用（高级）

您也可以直接使用API接口：

```markdown
[下载文件](/api/pan123/download?path=/文档/报告.pdf)
```

### 在Astro组件中使用

在 `.astro` 或 `.svelte` 文件中使用 `Pan123File` 组件：

```astro
---
import { Pan123File } from '@/components/features/pan123';
---

<Pan123File 
  path="/文档/项目报告.pdf" 
  name="项目最终报告"
  icon="material-symbols:description"
/>
```

## API接口

系统提供了以下API接口：

### 1. 获取文件信息
```
GET /api/pan123/info?path=文件路径
```

**查询参数：**
- `path`：文件路径（必需）
- `list`：设为 `true` 可获取目录列表（可选）

**响应示例：**
```json
{
  "path": "/文档/报告.pdf",
  "name": "报告.pdf",
  "size": 1048576,
  "lastModified": "2024-01-15T10:30:00Z",
  "isDirectory": false,
  "mimeType": "application/pdf",
  "downloadUrl": "/api/pan123/download?path=/文档/报告.pdf"
}
```

### 2. 下载文件
```
GET /api/pan123/download?path=文件路径
```

此接口会直接返回文件内容，设置正确的 `Content-Disposition` 头以便下载。

## 文件路径示例

假设您的123网盘目录结构如下：
```
/
├── 文档/
│   ├── 报告.pdf
│   └── 计划书.docx
├── 图片/
│   ├── 封面.jpg
│   └── 截图.png
└── 软件/
    └── 工具.zip
```

对应的路径写法：
- `::pan123{path="/文档/报告.pdf"}`
- `::pan123{path="/图片/封面.jpg"}`
- `::pan123{path="/软件/工具.zip"}`

## 样式自定义

123网盘组件使用以下CSS类，您可以在自定义CSS中覆盖：

### 文件卡片组件
- `.card-pan123` - 卡片容器
- `.pan123-header` - 头部区域
- `.pan123-icon` - 图标区域
- `.pan123-filename` - 文件名
- `.pan123-filepath` - 文件路径
- `.pan123-fileinfo` - 文件信息区域
- `.pan123-download-btn` - 下载按钮

### 内联链接组件
- `.pan123-inline-link` - 内联链接
- `.pan123-link-text` - 链接文本
- `.pan123-link-size` - 文件大小标签

## 故障排除

### 常见问题

1. **文件无法加载**
   - 检查环境变量配置是否正确
   - 确认文件路径是否存在
   - 查看浏览器控制台错误信息

2. **认证失败**
   - 确认123网盘账号密码正确
   - 检查WebDAV服务是否正常
   - 验证网络连接

3. **样式不显示**
   - 确认 `pan123.css` 已正确导入
   - 检查CSS类名是否正确
   - 查看元素样式计算

### 调试方法

1. 打开浏览器开发者工具（F12）
2. 查看Network标签页中的API请求
3. 检查Console标签页中的错误信息
4. 验证环境变量是否正确加载

## 性能优化

### 启用Cloudflare KV缓存（可选）

Cloudflare KV缓存可以显著提高文件信息查询性能，减少对123网盘API的直接调用。

#### 配置步骤

1. **创建KV命名空间**
   - 在Cloudflare Dashboard中进入 **Workers & Pages** → **KV**
   - 点击 **Create namespace**，名称设为 `pan123_cache`
   - 复制生成的命名空间ID

2. **配置 `wrangler.toml`**
   - 项目根目录已包含 `wrangler.toml` 文件
   - 文件已配置KV绑定 `PAN123_CACHE`
   - 如需自定义命名空间ID，请更新文件中的 `id` 字段

3. **配置环境变量**
   ```env
   # 启用KV缓存
   PAN123_USE_KV=true
   
   # KV命名空间ID（可选，如使用默认配置可不设置）
   # PAN123_KV_NAMESPACE_ID=your_namespace_id
   ```

4. **部署到Cloudflare**
   - 使用Wrangler CLI部署：`npx wrangler deploy`
   - 或在Cloudflare Pages设置中绑定KV命名空间

#### 缓存策略

- **文件信息缓存**：1小时（3600秒）
- **目录列表缓存**：1小时（3600秒）
- **文件内容**：不缓存，直接代理下载
- **下载统计**：永久存储，记录每个文件的下载次数

#### 下载统计功能

启用KV缓存后，系统会自动记录：
- 每个文件的下载次数
- 总下载次数
- 统计信息存储在KV中，键名格式：
  - `pan123:stats:文件路径` - 单个文件统计
  - `pan123:stats:total` - 总下载统计

#### 监控缓存状态

您可以通过以下方式监控缓存：
1. Cloudflare Dashboard中的KV查看器
2. 检查API响应头中的 `X-Cache` 状态
3. 查看服务器日志中的缓存命中/未命中信息

### 缓存清除

如需手动清除缓存，可通过Cloudflare Dashboard操作或重新部署项目。

## 安全注意事项

1. **凭证安全**
   - 不要将 `.env` 文件提交到版本控制
   - 在Cloudflare中使用环境变量存储敏感信息
   - 定期更换密码

2. **访问控制**
   - API接口仅代理已认证的用户请求
   - 文件路径会进行URL编码防止注入
   - 响应头设置适当的安全策略

3. **日志记录**
   - 所有API请求会记录错误信息
   - 不记录敏感数据（如文件内容）
   - 生产环境建议启用更详细的日志

## 更新与维护

### 版本兼容性

- 当前版本：v1.0.0
- 兼容Mizuki主题版本：v9.0+
- 依赖：Astro 6.1+, Cloudflare Pages

### 更新方法

1. 拉取最新代码
2. 更新环境变量（如有变更）
3. 重新构建和部署
4. 测试核心功能

## 支持与反馈

如遇到问题或有改进建议：

1. 查看本文档的故障排除部分
2. 检查GitHub Issues中是否有类似问题
3. 提交新的Issue并提供详细信息：
   - 错误信息
   - 复现步骤
   - 环境信息
   - 相关截图

---

**最后更新：** 2024年1月  
**文档版本：** 1.0.0