/// <reference types="mdast" />
import { h } from "hastscript";

/**
 * 创建123网盘文件下载组件
 *
 * @param {Object} properties - 组件属性
 * @param {string} properties.path - 文件在123网盘中的路径
 * @param {string} [properties.name] - 自定义显示的文件名（可选）
 * @param {string} [properties.icon] - 自定义图标（可选）
 * @param {import('mdast').RootContent[]} children - 子元素
 * @returns {import('mdast').Parent} 创建的123网盘文件组件
 */
export function Pan123FileComponent(properties, children) {
  if (Array.isArray(children) && children.length !== 0) {
    return h("div", { class: "hidden" }, [
      '无效的指令。("pan123" 指令必须是叶子类型 "::pan123{path=\\"文件路径\\"}")',
    ]);
  }

  if (!properties.path) {
    return h(
      "div",
      { class: "hidden" },
      '无效的文件路径。("path" 属性必须提供文件路径)',
    );
  }

  const filePath = properties.path;
  const displayName = properties.name || filePath.split('/').pop() || filePath;
  const icon = properties.icon || "material-symbols:download";
  const cardUuid = `P123${Math.random().toString(36).slice(-6)}`; // 避免冲突

  // 构建API URL
  const apiUrl = `/api/pan123/info?path=${encodeURIComponent(filePath)}`;
  const downloadUrl = `/api/pan123/download?path=${encodeURIComponent(filePath)}`;

  // 文件图标
  const nIcon = h("div", { class: "pan123-icon" }, [
    h("span", { class: "iconify", "data-icon": icon }),
  ]);

  // 文件名和路径
  const nFileName = h("div", { class: "pan123-filename" }, displayName);
  const nFilePath = h("div", { class: "pan123-filepath" }, filePath);

  // 文件信息区域（初始显示加载中）
  const nFileSize = h(`span#${cardUuid}-size`, { class: "pan123-filesize" }, "加载中...");
  const nLastModified = h(`span#${cardUuid}-modified`, { class: "pan123-modified" }, "加载中...");

  const nFileInfo = h("div", { class: "pan123-fileinfo" }, [
    h("div", { class: "pan123-info-row" }, [
      h("span", { class: "pan123-info-label" }, "大小:"),
      nFileSize,
    ]),
    h("div", { class: "pan123-info-row" }, [
      h("span", { class: "pan123-info-label" }, "修改时间:"),
      nLastModified,
    ]),
  ]);

  // 下载按钮
  const nDownloadButton = h(
    "a",
    {
      class: "pan123-download-btn",
      href: downloadUrl,
      target: "_blank",
      rel: "noopener noreferrer",
      "data-path": filePath,
    },
    [
      h("span", { class: "iconify", "data-icon": "material-symbols:download" }),
      h("span", { class: "pan123-btn-text" }, "下载文件"),
    ]
  );

  // 加载脚本
  const nScript = h(
    `script#${cardUuid}-script`,
    { type: "text/javascript", defer: true },
    `
    (function() {
      const apiUrl = '${apiUrl}';
      const cardId = '${cardUuid}';
      const filePath = '${filePath}';
      
      fetch(apiUrl, { referrerPolicy: "no-referrer" })
        .then(response => {
          if (!response.ok) {
            throw new Error('HTTP error ' + response.status);
          }
          return response.json();
        })
        .then(data => {
          // 更新文件大小
          const sizeEl = document.getElementById(cardId + '-size');
          if (sizeEl && data.size) {
            sizeEl.textContent = formatFileSize(data.size);
          }
          
          // 更新修改时间
          const modifiedEl = document.getElementById(cardId + '-modified');
          if (modifiedEl && data.lastModified) {
            modifiedEl.textContent = formatDate(data.lastModified);
          }
          
          // 更新下载链接
          const downloadBtn = document.querySelector('a[data-path="' + filePath + '"]');
          if (downloadBtn && data.downloadUrl) {
            downloadBtn.href = data.downloadUrl;
          }
          
          // 移除加载状态
          const cardEl = document.getElementById(cardId + '-card');
          if (cardEl) {
            cardEl.classList.remove("pan123-loading");
            cardEl.classList.add("pan123-loaded");
          }
          
          console.log("[PAN123-FILE] 加载文件信息: " + filePath + " | " + cardId);
        })
        .catch(err => {
          console.warn("[PAN123-FILE] (错误) 加载文件信息: " + filePath + " | " + cardId, err);
          
          const cardEl = document.getElementById(cardId + '-card');
          if (cardEl) {
            cardEl.classList.remove("pan123-loading");
            cardEl.classList.add("pan123-error");
            
            const sizeEl = document.getElementById(cardId + '-size');
            if (sizeEl) sizeEl.textContent = "加载失败";
            
            const modifiedEl = document.getElementById(cardId + '-modified');
            if (modifiedEl) modifiedEl.textContent = "请检查文件路径";
          }
        });
      
      // 格式化文件大小
      function formatFileSize(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
      }
      
      // 格式化日期
      function formatDate(dateString) {
        try {
          const date = new Date(dateString);
          return date.toLocaleDateString('zh-CN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
          });
        } catch (e) {
          return dateString;
        }
      }
    })();
    `
  );

  return h(
    `div#${cardUuid}-card`,
    {
      class: "card-pan123 pan123-loading",
      "data-path": filePath,
    },
    [
      h("div", { class: "pan123-header" }, [
        nIcon,
        h("div", { class: "pan123-title" }, [
          nFileName,
          nFilePath,
        ]),
      ]),
      nFileInfo,
      h("div", { class: "pan123-footer" }, [
        nDownloadButton,
      ]),
      nScript,
    ]
  );
}

/**
 * 简化的123网盘文件链接组件（内联链接）
 * 语法: ::pan123-link{path="文件路径"}
 */
export function Pan123LinkComponent(properties, children) {
  if (!properties.path) {
    return h("span", { class: "pan123-link-error" }, "[无效文件路径]");
  }

  const filePath = properties.path;
  const displayName = properties.name || filePath.split('/').pop() || filePath;
  const downloadUrl = `/api/pan123/download?path=${encodeURIComponent(filePath)}`;
  const linkUuid = `P123L${Math.random().toString(36).slice(-6)}`;

  // 创建简单的下载链接
  const nLink = h(
    "a",
    {
      class: "pan123-inline-link",
      href: downloadUrl,
      target: "_blank",
      rel: "noopener noreferrer",
      "data-path": filePath,
      title: `下载文件: ${filePath}`,
    },
    [
      h("span", { class: "iconify", "data-icon": "material-symbols:download" }),
      h("span", { class: "pan123-link-text" }, displayName),
    ]
  );

  // 添加文件大小信息的脚本（可选）
  const nScript = h(
    `script#${linkUuid}-script`,
    { type: "text/javascript", defer: true },
    `
    (function() {
      const filePath = '${filePath}';
      const apiUrl = '/api/pan123/info?path=' + encodeURIComponent(filePath);
      const linkEl = document.querySelector('a[data-path="' + filePath + '"]');
      
      if (!linkEl) return;
      
      // 可选：获取文件大小并添加到title
      fetch(apiUrl, { referrerPolicy: "no-referrer" })
        .then(response => response.ok ? response.json() : null)
        .then(data => {
          if (data && data.size) {
            const sizeMB = (data.size / (1024 * 1024)).toFixed(2);
            linkEl.title = '下载文件: ' + data.name + ' (' + sizeMB + ' MB)';
            
            // 添加文件大小到链接文本
            const sizeSpan = document.createElement('span');
            sizeSpan.className = 'pan123-link-size';
            sizeSpan.textContent = ' (' + sizeMB + ' MB)';
            
            const textSpan = linkEl.querySelector('.pan123-link-text');
            if (textSpan) {
              textSpan.appendChild(sizeSpan);
            }
          }
        })
        .catch(err => {
          console.warn("[PAN123-LINK] 获取文件信息失败:", err);
        });
    })();
    `
  );

  return h("span", { class: "pan123-link-wrapper" }, [nLink, nScript]);
}