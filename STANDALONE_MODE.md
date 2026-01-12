# 独立模式改造说明

本次改造实现了 MultiPost Extension 的完全独立运行，无需依赖外部服务器（localhost:3000 或 multipost.app）。

## 改动文件清单

### 1. **src/options/index.tsx** ✅
**操作**: 恢复了本地UI版本（原 `index_old.tsx`）
- **改动**: 
  - 将原来的外部跳转版本备份为 `index.external.tsx.bak`
  - 恢复 `index_old.tsx` 为主文件，包含完整的本地编辑界面
  - 禁用了外部Web应用推广弹窗（`isWebAppModalOpen` 默认值改为 `false`）
- **功能**: 提供动态、文章、视频、播客四种内容类型的本地编辑界面

### 2. **src/popup/index.tsx** ✅
**改动**: 移除外部网站跳转，改为打开本地 Options 页面
```typescript
// 之前：跳转到外部网站
chrome.tabs.create({ url: `${BASE_URL}/dashboard/publish` });

// 现在：打开本地 Options 页面
chrome.runtime.openOptionsPage();
window.close();
```

### 3. **src/background/index.ts** ✅
**改动**: 
1. **禁用 API 服务**（第148-150行）
   ```typescript
   // 方案一：完全独立模式 - 禁用API服务，不依赖外部服务器
   // 如需启用云端同步功能，取消注释下面这一行：
   // starter(1000 * 30);
   ```

2. **修改安装引导**（第41-42行）
   ```typescript
   // 之前：跳转外部网站
   chrome.tabs.create({ url: 'https://multipost.app/on-install' });
   
   // 现在：打开本地 Options 页面
   chrome.runtime.openOptionsPage();
   ```

## 功能变化

### ✅ 保留的核心功能
- ✅ 动态发布（文本、图片、视频）
- ✅ 文章发布（HTML/Markdown、封面图）
- ✅ 短视频发布（视频、封面、标签）
- ✅ 播客发布
- ✅ 30+ 平台支持
- ✅ 平台账号管理
- ✅ 本地存储设置
- ✅ 批量发布功能
- ✅ 发布进度跟踪

### ❌ 禁用的功能
- ❌ API Key 验证
- ❌ 云端任务下发
- ❌ 扩展使用数据同步
- ❌ 服务器端的定期 ping

## 使用方式

### 启动发布流程
1. 点击浏览器工具栏的扩展图标（Popup）
2. 自动打开本地的发布管理界面（Options 页面）
3. 选择内容类型（动态/文章/视频/播客）
4. 编辑内容并选择目标平台
5. 点击"开始同步"按钮

### 恢复云端同步功能
如需重新启用云端同步，只需：
1. 打开 `src/background/index.ts`
2. 取消注释第150行：`starter(1000 * 30);`
3. 重新构建扩展

## 文件备份

- `src/options/index.external.tsx.bak` - 原外部跳转版本的备份

## 测试建议

1. **基本功能测试**
   - 点击扩展图标是否正常打开 Options 页面
   - 首次安装是否正常打开引导页面

2. **发布流程测试**
   - 动态发布：创建带图片/视频的动态
   - 文章发布：导入/粘贴HTML内容
   - 视频发布：上传视频和封面
   - 验证所有平台选择器正常工作

3. **平台账号测试**
   - 刷新账号信息功能
   - 各平台登录状态检测

## 注意事项

1. **开发环境**: 运行 `pnpm dev` 进行开发测试
2. **生产构建**: 运行 `pnpm build` 构建生产版本
3. **保留的外部链接**: 文档链接、关于页面等外部资源链接仍然保留，不影响核心功能

## 兼容性

- ✅ 完全兼容现有的平台注入脚本
- ✅ 完全兼容现有的账号管理系统
- ✅ 完全兼容现有的存储系统
- ✅ 保持原有的消息通信架构

---

**改造完成时间**: 2025-12-02  
**改造方案**: 方案一 - 完全独立模式
