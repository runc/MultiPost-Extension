import { Button, Card, CardBody, Divider } from "@heroui/react";
import { Modal, ModalBody, ModalContent, ModalHeader } from "@heroui/react";
import { Storage } from "@plasmohq/storage";
import { useStorage } from "@plasmohq/storage/hook";
import { FolderOpenIcon, RefreshCw, VideoIcon } from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Player } from "video-react";
import "video-react/dist/video-react.css";
import { ACCOUNT_INFO_STORAGE_KEY } from "~sync/account";
import { type DraftData, deleteDraft, getAllDrafts } from "~sync/draft";
import {
  RECORDER_DATA_STORAGE_KEY,
  RECORDER_EXTENSION_ID,
  type RecordingMetadata,
  getCachedRecordingVideo,
  pullRecordingVideo,
} from "~sync/recorder";
import { DraftCard } from "./DraftCard";
import { RecorderModal } from "./RecorderModal";

interface DraftListProps {
  type?: "DYNAMIC" | "VIDEO" | "ARTICLE" | "ALL";
  onEditDraft?: (draft: DraftData) => void;
  onCreateNew?: () => void;
  showRecorderSection?: boolean;
  onUseRecording?: (recording: RecordingMetadata) => void;
}

export const DraftList: React.FC<DraftListProps> = ({
  type = "ALL",
  onEditDraft,
  onCreateNew,
  showRecorderSection = true,
  onUseRecording,
}) => {
  const [drafts, setDrafts] = useState<DraftData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [recorderData, setRecorderData] = useState<RecordingMetadata[]>([]);
  const [isRecorderInstalled, setIsRecorderInstalled] = useState(true);
  const [isRecorderModalOpen, setIsRecorderModalOpen] = useState(false);
  const [previewRecording, setPreviewRecording] = useState<RecordingMetadata | null>(null);
  const [previewVideoUrl, setPreviewVideoUrl] = useState<string | null>(null);
  const [isLoadingPreviewVideo, setIsLoadingPreviewVideo] = useState(false);

  const storage = useMemo(() => new Storage({ area: "local" }), []);
  const [accountInfos] = useStorage({
    key: ACCOUNT_INFO_STORAGE_KEY,
    instance: storage,
  });

  // 加载草稿
  const loadDrafts = useCallback(async () => {
    setIsLoading(true);
    try {
      const allDrafts = await getAllDrafts();
      const filtered = type === "ALL" ? allDrafts : allDrafts.filter((d) => d.type === type);
      setDrafts(filtered);
    } catch (error) {
      console.error("加载草稿失败:", error);
    } finally {
      setIsLoading(false);
    }
  }, [type]);

  // 加载本地存储的录屏数据
  const loadRecorderData = useCallback(async () => {
    try {
      const result = await chrome.storage.local.get([RECORDER_DATA_STORAGE_KEY]);
      const storedData = result[RECORDER_DATA_STORAGE_KEY] || [];
      setRecorderData(storedData);
    } catch (error) {
      console.error("加载录屏数据失败:", error);
    }
  }, []);

  // 保存录屏数据到本地存储
  const saveRecorderData = useCallback(async (data: RecordingMetadata[]) => {
    try {
      await chrome.storage.local.set({ [RECORDER_DATA_STORAGE_KEY]: data });
      setRecorderData(data);
    } catch (error) {
      console.error("保存录屏数据失败:", error);
    }
  }, []);

  // 删除草稿
  const handleDeleteDraft = useCallback(
    async (id: string) => {
      await deleteDraft(id);
      await loadDrafts();
    },
    [loadDrafts],
  );

  // 编辑草稿
  const handleEditDraft = useCallback(
    (draft: DraftData) => {
      onEditDraft?.(draft);
    },
    [onEditDraft],
  );

  // 检查录屏插件
  const checkRecorderInstalled = useCallback(async () => {
    try {
      await chrome.runtime.sendMessage(RECORDER_EXTENSION_ID, { type: "PING" });
      setIsRecorderInstalled(true);
    } catch {
      setIsRecorderInstalled(false);
    }
  }, []);

  //同步录屏数据
  const handleSyncRecorder = useCallback(async () => {
    console.log("[DraftList] 开始同步录屏数据...");
    setIsRefreshing(true);
    try {
      console.log("[DraftList] 发送 RECORDER_LIST_RECORDINGS 消息...");

      // 添加超时机制，防止一直等待
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error("Request timeout")), 10000); // 10秒超时
      });

      const messagePromise = chrome.runtime.sendMessage(RECORDER_EXTENSION_ID, {
        type: "RECORDER_LIST_RECORDINGS",
        limit: 10,
      });

      const response = await Promise.race([messagePromise, timeoutPromise]);

      console.log("[DraftList] 收到响应:", response);

      if (response?.ok) {
        const newRecordings = response.recordings || [];
        console.log(`[DraftList] 获取到 ${newRecordings.length} 条录屏记录`);

        // 获取本地已存储的数据
        const result = await chrome.storage.local.get([RECORDER_DATA_STORAGE_KEY]);
        const existingData = result[RECORDER_DATA_STORAGE_KEY] || [];

        // 创建 ID 到录屏的映射,用于去重和更新
        const recordingMap = new Map<string, RecordingMetadata>();

        // 先添加现有数据（保留缓存状态）
        existingData.forEach((recording: RecordingMetadata) => {
          recordingMap.set(recording.id, recording);
        });

        // 更新或添加新数据(新数据会覆盖旧数据，但保留缓存信息)
        newRecordings.forEach((recording: RecordingMetadata) => {
          const existing = recordingMap.get(recording.id);
          // 如果已存在且已缓存，保留缓存状态
          if (existing?.videoCached) {
            recording.videoCached = existing.videoCached;
            recording.videoCachedAt = existing.videoCachedAt;
          }
          recordingMap.set(recording.id, recording);
        });

        // 转换回数组并按时间戳排序(最新的在前)
        const mergedData = Array.from(recordingMap.values()).sort((a, b) => b.timestamp - a.timestamp);

        // 保存到本地存储并更新状态
        await saveRecorderData(mergedData);
        console.log("[DraftList] 同步成功!");
      } else {
        console.log("[DraftList] 录屏插件未响应，检查是否安装...");
        try {
          await chrome.runtime.sendMessage(RECORDER_EXTENSION_ID, { type: "PING" });
          setIsRecorderInstalled(true);
        } catch {
          console.log("[DraftList] 录屏插件未安装");
          setIsRecorderInstalled(false);
        }
      }
    } catch (error) {
      console.error("[DraftList] 同步录屏数据失败:", error);
      try {
        await chrome.runtime.sendMessage(RECORDER_EXTENSION_ID, { type: "PING" });
        setIsRecorderInstalled(true);
      } catch {
        console.log("[DraftList] 录屏插件未安装");
        setIsRecorderInstalled(false);
      }
    } finally {
      console.log("[DraftList] 同步完成，设置 isRefreshing = false");
      setIsRefreshing(false);
    }
  }, [saveRecorderData]);

  // 删除单个录屏记录
  const handleDeleteRecording = useCallback(
    async (recordingId: string) => {
      try {
        const filtered = recorderData.filter((r) => r.id !== recordingId);
        await saveRecorderData(filtered);
      } catch (error) {
        console.error("删除录屏记录失败:", error);
      }
    },
    [recorderData, saveRecorderData],
  );

  // 使用录屏
  const handleUseRecording = useCallback(
    (recording: RecordingMetadata) => {
      if (onUseRecording) {
        onUseRecording(recording);
      }
    },
    [onUseRecording],
  );

  // 预览录屏
  const handlePreviewRecording = useCallback(async (recording: RecordingMetadata) => {
    console.log("[DraftList] 开始预览录屏:", recording.id);
    setPreviewRecording(recording);
    setIsLoadingPreviewVideo(true);
    setPreviewVideoUrl(null);

    try {
      // 先尝试从缓存获取
      console.log("[DraftList] 尝试从缓存获取视频...");
      let videoBlob = await getCachedRecordingVideo(recording.id);

      if (!videoBlob) {
        console.log("[DraftList] 缓存中没有，从录屏插件拉取...");
        // 如果缓存中没有，则从录屏插件拉取
        videoBlob = await pullRecordingVideo(recording.id);
      }

      console.log("[DraftList] 获取到视频 Blob:", videoBlob.size, "bytes");
      // 创建预览 URL
      const url = URL.createObjectURL(videoBlob);
      console.log("[DraftList] 创建预览 URL:", url);
      setPreviewVideoUrl(url);
    } catch (error) {
      console.error("[DraftList] 加载预览视频失败:", error);
      alert("加载预览视频失败");
    } finally {
      setIsLoadingPreviewVideo(false);
    }
  }, []);

  // 关闭预览时清理 URL
  const handleClosePreview = useCallback(() => {
    if (previewVideoUrl?.startsWith("blob:")) {
      URL.revokeObjectURL(previewVideoUrl);
    }
    setPreviewRecording(null);
    setPreviewVideoUrl(null);
  }, [previewVideoUrl]);

  // 从录屏导入
  const handleRecorderVideoSelect = useCallback(
    async (videoData: { name: string; url: string; type?: string; size?: number; title?: string }) => {
      // 创建视频草稿
      const newDraft: DraftData = {
        id: crypto.randomUUID(),
        type: "VIDEO",
        title: videoData.title || "",
        content: "",
        video: {
          name: videoData.name,
          url: videoData.url,
          type: videoData.type,
          size: videoData.size,
        },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const allDrafts = await getAllDrafts();
      allDrafts.unshift(newDraft);

      // 保存到 storage
      await chrome.storage.local.set({ multipost_drafts: allDrafts });

      // 刷新列表
      await loadDrafts();
      setIsRecorderModalOpen(false);
    },
    [loadDrafts],
  );

  // 初始加载
  useEffect(() => {
    loadDrafts();
    if (showRecorderSection) {
      loadRecorderData(); // 加载本地缓存的录屏数据
      checkRecorderInstalled(); // 检查录屏插件是否安装
      // 不自动同步，等用户手动点击按钮
    }
  }, [loadDrafts, showRecorderSection, loadRecorderData, checkRecorderInstalled]);

  // 监听 accountInfos 变化以刷新列表
  useEffect(() => {
    if (accountInfos) {
      loadDrafts();
    }
  }, [accountInfos, loadDrafts]);

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="flex flex-col gap-4">
      {/* 录屏数据区域 */}
      {showRecorderSection && (
        <>
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium flex items-center gap-2">
              <VideoIcon className="w-4 h-4" />
              {chrome.i18n.getMessage("draftRecorderData")}
            </h3>
            <Button
              size="sm"
              variant="flat"
              onPress={handleSyncRecorder}
              isLoading={isRefreshing}
              isDisabled={!isRecorderInstalled}
              startContent={<RefreshCw className="w-3 h-3" />}>
              {chrome.i18n.getMessage("draftSyncFromRecorder")}
            </Button>
          </div>

          {!isRecorderInstalled ? (
            <Card className="bg-default-50">
              <CardBody className="text-center py-4">
                <VideoIcon className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                <p className="text-sm text-gray-500">{chrome.i18n.getMessage("recorderNotInstalled")}</p>
              </CardBody>
            </Card>
          ) : recorderData.length === 0 ? (
            <Card className="bg-default-50">
              <CardBody className="text-center py-4">
                <p className="text-sm text-gray-500">{chrome.i18n.getMessage("recorderNoRecordings")}</p>
              </CardBody>
            </Card>
          ) : (
            <div className="flex flex-col gap-2">
              {recorderData.map((recording) => (
                <Card key={recording.id} className="hover:bg-default-100 transition-colors">
                  <CardBody className="p-3">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                      {/* Thumbnail or icon */}
                      <div className="w-full sm:w-20 h-20 bg-default-200 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden">
                        {recording.thumbnail ? (
                          <img src={recording.thumbnail} alt={recording.title} className="w-full h-full object-cover" />
                        ) : (
                          <VideoIcon className="w-8 h-8 text-default-500" />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        {/* Title */}
                        <p className="text-sm font-medium truncate mb-1">{recording.title}</p>

                        {/* Description */}
                        {recording.description && (
                          <p className="text-xs text-gray-500 line-clamp-2 mb-2">{recording.description}</p>
                        )}

                        {/* Metadata row 1: Duration, Size, Resolution */}
                        <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500 mb-1">
                          <span>{formatDuration(recording.duration)}</span>
                          <span>•</span>
                          <span>{formatFileSize(recording.size)}</span>
                          {recording.width && recording.height && (
                            <>
                              <span>•</span>
                              <span>
                                {recording.width}x{recording.height}
                              </span>
                            </>
                          )}
                          <span>•</span>
                          <span className="uppercase">{recording.format}</span>
                          <span>•</span>
                          <span>{new Date(recording.timestamp).toLocaleDateString()}</span>
                        </div>

                        {/* Tags */}
                        {recording.tags && recording.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mb-2">
                            {recording.tags.map((tag, index) => (
                              <span
                                key={index}
                                className="px-2 py-0.5 text-xs bg-default-100 rounded-full text-gray-600">
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Indicators row */}
                        <div className="flex flex-wrap gap-3 text-xs text-gray-400">
                          {recording.payload && (
                            <span>📋 {chrome.i18n.getMessage("recorderHasPayload") || "包含发布配置"}</span>
                          )}
                          {recording.subtitles && (
                            <span>
                              💬 {chrome.i18n.getMessage("recorderHasSubtitles") || "包含字幕"} (
                              {recording.subtitles.format})
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-row sm:flex-col gap-2 flex-shrink-0">
                        <Button
                          size="sm"
                          color="primary"
                          className="flex-1 sm:flex-none"
                          onPress={() => handleUseRecording(recording)}>
                          {chrome.i18n.getMessage("recorderUseVideo")}
                        </Button>
                        <Button
                          size="sm"
                          variant="flat"
                          color="secondary"
                          className="flex-1 sm:flex-none"
                          onPress={() => handlePreviewRecording(recording)}>
                          {chrome.i18n.getMessage("recorderPreviewButton") || "预览"}
                        </Button>
                        <Button
                          size="sm"
                          variant="flat"
                          color="danger"
                          className="flex-1 sm:flex-none"
                          onPress={() => {
                            if (confirm(chrome.i18n.getMessage("recorderConfirmDelete") || "确认删除此录屏记录？")) {
                              handleDeleteRecording(recording.id);
                            }
                          }}>
                          {chrome.i18n.getMessage("recorderDeleteButton") || "删除"}
                        </Button>
                      </div>
                    </div>
                  </CardBody>
                </Card>
              ))}
            </div>
          )}

          <Divider className="my-2" />
        </>
      )}

      {/* 草稿箱区域 */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium flex items-center gap-2">
          <FolderOpenIcon className="w-4 h-4" />
          {chrome.i18n.getMessage("draftBox")}
          <span className="text-xs text-gray-500">({drafts.length})</span>
        </h3>
        {onCreateNew && (
          <Button size="sm" variant="flat" onPress={onCreateNew}>
            {chrome.i18n.getMessage(
              `draftCreate${type === "ALL" ? "Dynamic" : type === "DYNAMIC" ? "Dynamic" : type === "VIDEO" ? "Video" : "Article"}`,
            )}
          </Button>
        )}
      </div>

      {isLoading ? (
        <Card className="bg-default-50">
          <CardBody className="text-center py-8">
            <p className="text-sm text-gray-500">{chrome.i18n.getMessage("recorderLoading")}</p>
          </CardBody>
        </Card>
      ) : drafts.length === 0 ? (
        <Card className="bg-default-50">
          <CardBody className="text-center py-8">
            <FolderOpenIcon className="w-12 h-12 text-gray-400 mx-auto mb-3" />
            <p className="text-sm font-medium mb-1">{chrome.i18n.getMessage("draftNoDrafts")}</p>
            <p className="text-xs text-gray-500">{chrome.i18n.getMessage("draftEmptyDesc")}</p>
          </CardBody>
        </Card>
      ) : (
        <div className="space-y-2">
          {drafts.map((draft) => (
            <DraftCard key={draft.id} draft={draft} onDelete={handleDeleteDraft} onEdit={handleEditDraft} />
          ))}
        </div>
      )}

      {/* 录屏模态框 */}
      <RecorderModal
        isOpen={isRecorderModalOpen}
        onClose={() => setIsRecorderModalOpen(false)}
        onVideoSelect={handleRecorderVideoSelect}
      />

      {/* 录屏预览模态框 */}
      <Modal isOpen={!!previewRecording} onClose={handleClosePreview} size="3xl" scrollBehavior="inside">
        <ModalContent>
          <ModalHeader className="flex flex-col gap-1">
            <h3 className="text-lg font-semibold">{previewRecording?.title}</h3>
            {previewRecording?.description && (
              <p className="text-sm text-gray-500 font-normal">{previewRecording.description}</p>
            )}
          </ModalHeader>
          <ModalBody className="pb-6">
            {/* 视频播放器 */}
            <div className="relative w-full aspect-video bg-black rounded-lg overflow-hidden mb-4">
              {isLoadingPreviewVideo ? (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-white">加载中...</div>
                </div>
              ) : previewVideoUrl ? (
                <Player>
                  <source src={previewVideoUrl} />
                </Player>
              ) : previewRecording?.thumbnail ? (
                <>
                  <img
                    src={previewRecording.thumbnail}
                    alt={previewRecording.title}
                    className="w-full h-full object-contain"
                  />
                  <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50">
                    <VideoIcon className="w-16 h-16 text-white opacity-75" />
                  </div>
                </>
              ) : (
                <div className="absolute inset-0 flex items-center justify-center">
                  <VideoIcon className="w-16 h-16 text-white opacity-50" />
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-500">{chrome.i18n.getMessage("recorderDuration") || "时长"}:</span>
                <span className="ml-2 font-medium">
                  {previewRecording && formatDuration(previewRecording.duration)}
                </span>
              </div>
              <div>
                <span className="text-gray-500">{chrome.i18n.getMessage("recorderSize") || "大小"}:</span>
                <span className="ml-2 font-medium">{previewRecording && formatFileSize(previewRecording.size)}</span>
              </div>
              {previewRecording?.width && previewRecording?.height && (
                <div>
                  <span className="text-gray-500">{chrome.i18n.getMessage("recorderResolution") || "分辨率"}:</span>
                  <span className="ml-2 font-medium">
                    {previewRecording.width}x{previewRecording.height}
                  </span>
                </div>
              )}
              <div>
                <span className="text-gray-500">{chrome.i18n.getMessage("recorderFormat") || "格式"}:</span>
                <span className="ml-2 font-medium uppercase">{previewRecording?.format}</span>
              </div>
              <div className="col-span-2">
                <span className="text-gray-500">{chrome.i18n.getMessage("recorderTimestamp") || "录制时间"}:</span>
                <span className="ml-2 font-medium">
                  {previewRecording && new Date(previewRecording.timestamp).toLocaleString()}
                </span>
              </div>
            </div>

            {previewRecording?.tags && previewRecording.tags.length > 0 && (
              <div className="mt-4">
                <div className="text-sm text-gray-500 mb-2">{chrome.i18n.getMessage("recorderTags") || "标签"}:</div>
                <div className="flex flex-wrap gap-2">
                  {previewRecording.tags.map((tag, index) => (
                    <span key={index} className="px-3 py-1 text-sm bg-default-100 rounded-full text-gray-700">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {previewRecording?.payload && (
              <div className="mt-4 p-3 bg-default-50 rounded-lg">
                <div className="text-sm text-gray-500 mb-1">
                  📋 {chrome.i18n.getMessage("recorderHasPayload") || "包含发布配置"}
                </div>
                <pre className="text-xs text-gray-600 overflow-auto max-h-32">
                  {JSON.stringify(previewRecording.payload, null, 2)}
                </pre>
              </div>
            )}

            {previewRecording?.subtitles && (
              <div className="mt-4 p-3 bg-default-50 rounded-lg">
                <div className="text-sm text-gray-500 mb-1">
                  💬 {chrome.i18n.getMessage("recorderHasSubtitles") || "包含字幕"} ({previewRecording.subtitles.format}
                  )
                </div>
                <div className="text-xs text-gray-600 overflow-auto max-h-32 whitespace-pre-wrap">
                  {previewRecording.subtitles.content}
                </div>
              </div>
            )}
          </ModalBody>
        </ModalContent>
      </Modal>
    </div>
  );
};
