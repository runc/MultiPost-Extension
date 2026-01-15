/**
 * 录屏数据类型定义和管理工具
 */

const RECORDER_EXTENSION_ID = chrome.i18n.getMessage("recorderExtensionId");
const RECORDER_DATA_STORAGE_KEY = "multipost_recorder_data";
const RECORDER_VIDEO_CACHE_KEY_PREFIX = "multipost_recorder_video_";

export interface RecordingMetadata {
  id: string;
  title: string;
  format: "webm" | "mp4";
  size: number;
  duration: number;
  timestamp: number;
  width?: number;
  height?: number;
  chunkCount?: number;
  subtitles?: { format: "vtt" | "srt"; content: string };
  description?: string;
  tags?: string[];
  thumbnail?: string;
  payload?: object;
  // 视频缓存标记
  videoCached?: boolean; // 视频是否已缓存到本地
  videoCachedAt?: number; // 缓存时间戳
}

export { RECORDER_EXTENSION_ID, RECORDER_DATA_STORAGE_KEY, RECORDER_VIDEO_CACHE_KEY_PREFIX };

/**
 * 从录屏插件拉取视频数据并自动缓存
 */
export async function pullRecordingVideo(recordingId: string): Promise<Blob> {
  console.log("[recorder.ts] pullRecordingVideo 开始:", recordingId);
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(
      () => {
        console.error("[recorder.ts] 传输超时");
        chrome.storage.onChanged.removeListener(storageListener);
        if (pollIntervalId) clearInterval(pollIntervalId);
        reject(new Error("Transfer timeout"));
      },
      5 * 60 * 1000,
    ); // 5分钟超时

    let pollIntervalId: number | null = null;

    const storageListener = (changes: { [key: string]: chrome.storage.StorageChange }, areaName: string) => {
      console.log("[recorder.ts] storage 事件触发, areaName:", areaName, "changes keys:", Object.keys(changes));

      if (changes[`recorder_transfer_${recordingId}`]) {
        console.log("[recorder.ts] 收到 storage 变化事件:", changes[`recorder_transfer_${recordingId}`]);
        const { newValue } = changes[`recorder_transfer_${recordingId}`];
        chrome.storage.onChanged.removeListener(storageListener);
        if (pollIntervalId) clearInterval(pollIntervalId);
        clearTimeout(timeoutId);

        if (newValue.status === "complete" && newValue.savedToIndexedDB) {
          console.log("[recorder.ts] 视频已保存到 IndexedDB，开始读取...");
          // 直接从 IndexedDB 读取
          getCachedRecordingVideo(recordingId)
            .then((blob) => {
              if (blob) {
                console.log("[recorder.ts] 从 IndexedDB 读取成功:", blob.size, "bytes");
                resolve(blob);
              } else {
                console.error("[recorder.ts] IndexedDB 中未找到视频");
                reject(new Error("Video not found in IndexedDB"));
              }
            })
            .catch((error) => {
              console.error("[recorder.ts] 从 IndexedDB 读取失败:", error);
              reject(error);
            });
        } else if (newValue.status === "error") {
          console.error("[recorder.ts] 传输错误:", newValue.error);
          reject(new Error(newValue.error));
        }
      }
    };

    console.log("[recorder.ts] 添加 storage 监听器");
    chrome.storage.onChanged.addListener(storageListener);

    // 备用方案：定期轮询 IndexedDB，防止 storage 事件未触发
    pollIntervalId = window.setInterval(async () => {
      console.log("[recorder.ts] 轮询检查 IndexedDB 中是否有视频...");
      try {
        const blob = await getCachedRecordingVideo(recordingId);
        if (blob) {
          console.log("[recorder.ts] 轮询检测到视频已缓存:", blob.size, "bytes");
          chrome.storage.onChanged.removeListener(storageListener);
          if (pollIntervalId) clearInterval(pollIntervalId);
          clearTimeout(timeoutId);
          resolve(blob);
        }
      } catch (error) {
        console.error("[recorder.ts] 轮询检查出错:", error);
      }
    }, 1000); // 每秒检查一次

    // 发送拉取请求
    console.log("[recorder.ts] 发送 RECORDER_PULL_RECORDING 消息...");
    chrome.runtime
      .sendMessage(RECORDER_EXTENSION_ID, {
        type: "RECORDER_PULL_RECORDING",
        recordingId: recordingId,
        payload: {
          publish: {
            action: "sync",
            platform: "multipost",
          },
        },
      })
      .then((response) => {
        console.log("[recorder.ts] 收到拉取响应:", response);
        if (!response?.ok) {
          chrome.storage.onChanged.removeListener(storageListener);
          if (pollIntervalId) clearInterval(pollIntervalId);
          clearTimeout(timeoutId);
          reject(new Error(response?.error || "Failed to pull recording"));
        }
      })
      .catch((error) => {
        console.error("[recorder.ts] 发送消息失败:", error);
        chrome.storage.onChanged.removeListener(storageListener);
        if (pollIntervalId) clearInterval(pollIntervalId);
        clearTimeout(timeoutId);
        reject(error);
      });
  });
}

/**
 * 缓存视频到本地存储（IndexedDB）
 * 注意: pullRecordingVideo 已经由 background.ts 自动缓存，此函数主要用于手动缓存场景
 */
export async function cacheRecordingVideo(recordingId: string, blob: Blob): Promise<void> {
  const cacheKey = `${RECORDER_VIDEO_CACHE_KEY_PREFIX}${recordingId}`;

  // 将 Blob 转为 ArrayBuffer 存储
  const arrayBuffer = await blob.arrayBuffer();

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
      const transaction = db.transaction(["videos"], "readwrite");
      const store = transaction.objectStore("videos");

      const putRequest = store.put(
        {
          data: arrayBuffer,
          mimeType: blob.type,
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
    };
  });
}

/**
 * 从本地缓存获取视频
 */
export async function getCachedRecordingVideo(recordingId: string): Promise<Blob | null> {
  const cacheKey = `${RECORDER_VIDEO_CACHE_KEY_PREFIX}${recordingId}`;
  console.log("[recorder.ts] getCachedRecordingVideo:", recordingId, "key:", cacheKey);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open("MultiPostRecorderCache", 1);

    request.onerror = () => {
      console.error("[recorder.ts] IndexedDB 打开失败:", request.error);
      reject(request.error);
    };

    request.onupgradeneeded = (event) => {
      console.log("[recorder.ts] IndexedDB 需要升级，创建 videos store");
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains("videos")) {
        db.createObjectStore("videos");
      }
    };

    request.onsuccess = () => {
      console.log("[recorder.ts] IndexedDB 打开成功");
      const db = request.result;
      const transaction = db.transaction(["videos"], "readonly");
      const store = transaction.objectStore("videos");
      const getRequest = store.get(cacheKey);

      getRequest.onsuccess = () => {
        db.close();
        const result = getRequest.result;
        if (result) {
          console.log("[recorder.ts] 从缓存获取成功:", result.size, "bytes");
          const blob = new Blob([result.data], { type: result.mimeType });
          resolve(blob);
        } else {
          console.log("[recorder.ts] 缓存中没有该视频");
          resolve(null);
        }
      };

      getRequest.onerror = () => {
        console.error("[recorder.ts] 从缓存读取失败:", getRequest.error);
        db.close();
        reject(getRequest.error);
      };
    };
  });
}

/**
 * 删除缓存的视频
 */
export async function deleteCachedRecordingVideo(recordingId: string): Promise<void> {
  const cacheKey = `${RECORDER_VIDEO_CACHE_KEY_PREFIX}${recordingId}`;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open("MultiPostRecorderCache", 1);

    request.onerror = () => reject(request.error);

    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction(["videos"], "readwrite");
      const store = transaction.objectStore("videos");
      const deleteRequest = store.delete(cacheKey);

      deleteRequest.onsuccess = () => {
        db.close();
        resolve();
      };

      deleteRequest.onerror = () => {
        db.close();
        reject(deleteRequest.error);
      };
    };
  });
}

/**
 * 清理过期的视频缓存（默认7天）
 */
export async function cleanupExpiredVideoCache(maxAgeDays = 7): Promise<number> {
  const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;
  const now = Date.now();
  let deletedCount = 0;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open("MultiPostRecorderCache", 1);

    request.onerror = () => reject(request.error);

    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction(["videos"], "readwrite");
      const store = transaction.objectStore("videos");
      const getAllRequest = store.openCursor();

      getAllRequest.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor) {
          const value = cursor.value;
          if (value.cachedAt && now - value.cachedAt > maxAgeMs) {
            cursor.delete();
            deletedCount++;
          }
          cursor.continue();
        } else {
          db.close();
          resolve(deletedCount);
        }
      };

      getAllRequest.onerror = () => {
        db.close();
        reject(getAllRequest.error);
      };
    };
  });
}

/**
 * 获取视频缓存的总大小
 */
export async function getVideoCacheSize(): Promise<number> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("MultiPostRecorderCache", 1);

    request.onerror = () => reject(request.error);

    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction(["videos"], "readonly");
      const store = transaction.objectStore("videos");
      const getAllRequest = store.openCursor();
      let totalSize = 0;

      getAllRequest.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor) {
          const value = cursor.value;
          if (value.size) {
            totalSize += value.size;
          }
          cursor.continue();
        } else {
          db.close();
          resolve(totalSize);
        }
      };

      getAllRequest.onerror = () => {
        db.close();
        reject(getAllRequest.error);
      };
    };
  });
}
