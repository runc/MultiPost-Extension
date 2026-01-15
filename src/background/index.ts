import { Storage } from "@plasmohq/storage";
import { getAllAccountInfo } from "~sync/account";
import {
  // injectScriptsToTabs,
  type SyncData,
  type SyncDataPlatform,
  createTabsForPlatforms,
  getPlatformInfos,
} from "~sync/common";
import QuantumEntanglementKeepAlive from "../utils/keep-alive";
import { linkExtensionMessageHandler } from "./services/api";
import {
  addTabsManagerMessages,
  tabsManagerHandleTabRemoved,
  tabsManagerHandleTabUpdated,
  tabsManagerMessageHandler,
} from "./services/tabs";
import { trustDomainMessageHandler } from "./services/trust-domain";

const storage = new Storage({
  area: "local",
});

async function initDefaultTrustedDomains() {
  const trustedDomains = await storage.get<Array<{ id: string; domain: string }>>("trustedDomains");
  if (!trustedDomains) {
    await storage.set("trustedDomains", [
      {
        id: crypto.randomUUID(),
        domain: "multipost.app",
      },
    ]);
  }
}

chrome.runtime.onInstalled.addListener((object) => {
  if (object.reason === chrome.runtime.OnInstalledReason.INSTALL) {
    // 首次安装时打开本地的 Options 页面而不是外部网站
    chrome.runtime.openOptionsPage();
  }
  initDefaultTrustedDomains();
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });
});

// Listen Message || 监听消息 || START
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  defaultMessageHandler(request, sender, sendResponse);
  tabsManagerMessageHandler(request, sender, sendResponse);
  trustDomainMessageHandler(request, sender, sendResponse);
  linkExtensionMessageHandler(request, sender, sendResponse);
  return true;
});
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  tabsManagerHandleTabUpdated(tabId, changeInfo, tab);
});
chrome.tabs.onRemoved.addListener((tabId) => {
  tabsManagerHandleTabRemoved(tabId);
});
// Listen Message || 监听消息 || END

// Message Handler || 消息处理器 || START
let currentSyncData: SyncData | null = null;
let currentPublishPopup: chrome.windows.Window | null = null;
const defaultMessageHandler = (request, _sender, sendResponse) => {
  if (request.action === "MULTIPOST_EXTENSION_CHECK_SERVICE_STATUS") {
    sendResponse({ extensionId: chrome.runtime.id });
  }
  if (request.action === "MULTIPOST_EXTENSION_PUBLISH") {
    const data = request.data as SyncData;
    currentSyncData = data;
    (async () => {
      currentPublishPopup = await chrome.windows.create({
        url: chrome.runtime.getURL("tabs/publish.html"),
        type: "popup",
        width: 800,
        height: 600,
      });
    })();
  }
  if (request.action === "MULTIPOST_EXTENSION_PLATFORMS") {
    getPlatformInfos().then((platforms) => {
      sendResponse({ platforms });
    });
  }
  if (request.action === "MULTIPOST_EXTENSION_GET_ACCOUNT_INFOS") {
    getAllAccountInfo().then((accountInfo) => {
      sendResponse({ accountInfo });
    });
  }
  if (request.action === "MULTIPOST_EXTENSION_OPEN_OPTIONS") {
    chrome.runtime.openOptionsPage();
    sendResponse({ extensionId: chrome.runtime.id });
  }
  if (request.action === "MULTIPOST_EXTENSION_REFRESH_ACCOUNT_INFOS") {
    chrome.windows.create({
      url: chrome.runtime.getURL("tabs/refresh-accounts.html"),
      type: "popup",
      width: 800,
      height: 600,
      focused: request.data.isFocused || false,
    });
  }
  if (request.action === "MULTIPOST_EXTENSION_PUBLISH_REQUEST_SYNC_DATA") {
    sendResponse({ syncData: currentSyncData });
  }
  if (request.action === "MULTIPOST_EXTENSION_PUBLISH_NOW") {
    const data = request.data as SyncData;
    if (Array.isArray(data.platforms) && data.platforms.length > 0) {
      (async () => {
        try {
          const tabs = await createTabsForPlatforms(data);
          // await injectScriptsToTabs(tabs, data);

          addTabsManagerMessages({
            syncData: data,
            tabs: tabs.map((t: { tab: chrome.tabs.Tab; platformInfo: SyncDataPlatform }) => ({
              tab: t.tab,
              platformInfo: t.platformInfo,
            })),
          });

          // for (const t of tabs) {
          //   if (t.tab.id) {
          //     await chrome.tabs.update(t.tab.id, { active: true });
          //     await new Promise((resolve) => setTimeout(resolve, 2000));
          //   }
          // }
          if (currentPublishPopup) {
            await chrome.windows.update(currentPublishPopup.id, { focused: true });
          }

          sendResponse({
            tabs: tabs.map((t: { tab: chrome.tabs.Tab; platformInfo: SyncDataPlatform }) => ({
              tab: t.tab,
              platformInfo: t.platformInfo,
            })),
          });
        } catch (error) {
          console.error("创建标签页或分组时出错:", error);
        }
      })();
    }
  }
};
// 方案一：完全独立模式 - 禁用API服务，不依赖外部服务器
// 如需启用云端同步功能，取消注释下面这一行：
// starter(1000 * 30);
// Message Handler || 消息处理器 || END

// Keep Alive || 保活机制 || START
const quantumKeepAlive = new QuantumEntanglementKeepAlive();
quantumKeepAlive.startEntanglementProcess();
// Keep Alive || 保活机制 || END

// Recorder Extension Integration || 录屏插件集成 || START
const _RECORDER_EXTENSION_ID = "ngcainoampabonfpbfeklebaeoolpamm";
const VIDEO_TRANSFER_PORT_NAME = "recorder-bot-video-transfer";
const RECORDER_VIDEO_CACHE_KEY_PREFIX = "multipost_recorder_video_";

type VideoTransferPortMessage =
  | { type: "VIDEO_TRANSFER_INIT"; data: { metadata: any } }
  | { type: "VIDEO_TRANSFER_READY"; data: { id: string } }
  | { type: "VIDEO_TRANSFER_CHUNK"; data: { id: string; index: number; chunk: ArrayBuffer } }
  | { type: "VIDEO_TRANSFER_CHUNK_ACK"; data: { id: string; index: number } }
  | { type: "VIDEO_TRANSFER_FINISH"; data: { id: string } }
  | { type: "VIDEO_TRANSFER_COMPLETE"; data: { id: string } }
  | { type: "VIDEO_TRANSFER_ERROR"; data: { id: string; error: string } };

// 保存视频到 IndexedDB
function saveVideoToIndexedDB(recordingId: string, blob: Blob, mimeType: string): Promise<void> {
  const cacheKey = `${RECORDER_VIDEO_CACHE_KEY_PREFIX}${recordingId}`;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open("MultiPostRecorderCache", 1);

    request.onerror = () => reject(request.error);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains("videos")) {
        db.createObjectStore("videos");
      }
    };

    request.onsuccess = () => {
      const db = request.result;

      // 将 Blob 转为 ArrayBuffer
      blob.arrayBuffer().then((arrayBuffer) => {
        const transaction = db.transaction(["videos"], "readwrite");
        const store = transaction.objectStore("videos");

        const putRequest = store.put(
          {
            data: arrayBuffer,
            mimeType: mimeType,
            size: blob.size,
            cachedAt: Date.now(),
          },
          cacheKey,
        );

        putRequest.onsuccess = () => {
          db.close();
          resolve();
        };

        putRequest.onerror = () => {
          db.close();
          reject(putRequest.error);
        };
      });
    };
  });
}

// 处理来自录屏插件的外部连接
chrome.runtime.onConnectExternal.addListener((port) => {
  if (port.name !== VIDEO_TRANSFER_PORT_NAME) return;

  let metadata: any = null;
  let chunks: ArrayBuffer[] | Array<ArrayBuffer | undefined> = [];

  const fail = (error: string) => {
    try {
      if (metadata?.id) {
        port.postMessage({
          type: "VIDEO_TRANSFER_ERROR",
          data: { id: metadata.id, error },
        } satisfies VideoTransferPortMessage);
      }
    } finally {
      port.disconnect();
    }
  };

  port.onMessage.addListener((message: VideoTransferPortMessage) => {
    if (message.type === "VIDEO_TRANSFER_INIT") {
      metadata = message.data.metadata;
      console.log("[background] 收到 VIDEO_TRANSFER_INIT, metadata:", JSON.stringify(metadata));
      chunks = new Array<ArrayBuffer | undefined>(metadata.chunkCount || 0);
      port.postMessage({
        type: "VIDEO_TRANSFER_READY",
        data: { id: metadata.id },
      } satisfies VideoTransferPortMessage);
      return;
    }

    if (!metadata) return;

    if (message.type === "VIDEO_TRANSFER_CHUNK") {
      if (message.data.id !== metadata.id) return;
      if (message.data.index < 0 || message.data.index >= metadata.chunkCount) {
        fail(`Invalid chunk index ${message.data.index}`);
        return;
      }
      chunks[message.data.index] = message.data.chunk;
      port.postMessage({
        type: "VIDEO_TRANSFER_CHUNK_ACK",
        data: { id: metadata.id, index: message.data.index },
      } satisfies VideoTransferPortMessage);

      // 更新传输进度到 storage
      const progress = Math.round(((message.data.index + 1) / metadata.chunkCount) * 100);
      chrome.storage.local.set({
        [`recorder_progress_${metadata.id}`]: progress,
      });
      return;
    }

    if (message.type === "VIDEO_TRANSFER_FINISH") {
      if (message.data.id !== metadata.id) return;
      const missingIndex = (chunks as Array<ArrayBuffer | undefined>).findIndex((c) => !c);
      if (missingIndex !== -1) {
        fail(`Missing chunk at index ${missingIndex}`);
        return;
      }

      const mimeType = metadata.format === "mp4" ? "video/mp4" : "video/webm";
      const blob = new Blob(chunks as Array<ArrayBuffer>, { type: mimeType });

      console.log("[background] 视频接收完成，直接保存到 IndexedDB...");
      console.log("[background] metadata.id:", metadata.id);
      console.log("[background] metadata.payload:", metadata.payload);

      // 尝试从 payload 中获取原始的 recordingId
      const originalRecordingId = metadata.payload?.recordingId || metadata.recordingId || metadata.id;
      console.log("[background] 使用 recordingId:", originalRecordingId);

      // 直接保存到 IndexedDB，避免 chrome.storage.local 的大小限制
      saveVideoToIndexedDB(originalRecordingId, blob, mimeType)
        .then(() => {
          console.log("[background] 视频已保存到 IndexedDB:", originalRecordingId);
          // 先清除旧的传输状态，确保触发 change 事件
          const transferKey = `recorder_transfer_${originalRecordingId}`;
          chrome.storage.local.remove(transferKey, () => {
            console.log("[background] 已清除旧的传输状态:", transferKey);
            // 通知前端视频传输完成
            chrome.storage.local.set(
              {
                [transferKey]: {
                  status: "complete",
                  savedToIndexedDB: true,
                  mimeType: mimeType,
                  timestamp: Date.now(),
                },
              },
              () => {
                console.log("[background] 传输状态已通知:", transferKey);
              },
            );
          });
        })
        .catch((error) => {
          console.error("[background] 保存到 IndexedDB 失败:", error);
          chrome.storage.local.set({
            [`recorder_transfer_${originalRecordingId}`]: {
              status: "error",
              error: `Failed to save to IndexedDB: ${error.message}`,
            },
          });
        });

      port.postMessage({
        type: "VIDEO_TRANSFER_COMPLETE",
        data: { id: metadata.id },
      } satisfies VideoTransferPortMessage);
      port.disconnect();

      console.log("Received video from recorder:", { metadata, size: blob.size });
    }
  });
});
// Recorder Extension Integration || 录屏插件集成 || END
