import {
  Button,
  Card,
  CardBody,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Progress,
  useDisclosure,
} from "@heroui/react";
import { ClockIcon, HardDrive, RefreshCw, VideoIcon } from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useState } from "react";
import { Player } from "video-react";
import "video-react/dist/video-react.css";
import type { FileData } from "~sync/common";
import {
  RECORDER_DATA_STORAGE_KEY,
  RECORDER_EXTENSION_ID,
  type RecordingMetadata,
  getCachedRecordingVideo,
  pullRecordingVideo,
} from "~sync/recorder";

interface RecorderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onVideoSelect: (videoData: FileData & { title?: string }) => void;
}

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

export const RecorderModal: React.FC<RecorderModalProps> = ({ isOpen, onClose, onVideoSelect }) => {
  const [recordings, setRecordings] = useState<RecordingMetadata[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRecorderInstalled, setIsRecorderInstalled] = useState(true);
  const [previewVideo, setPreviewVideo] = useState<string | null>(null);
  const [transferProgress, setTransferProgress] = useState<number>(0);
  const [isTransferring, setIsTransferring] = useState(false);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const { isOpen: isPreviewOpen, onOpen: onPreviewOpen, onClose: onPreviewClose } = useDisclosure();

  // 清理预览 URL
  const cleanupPreviewUrl = useCallback(() => {
    if (previewVideo?.startsWith("blob:")) {
      URL.revokeObjectURL(previewVideo);
    }
    setPreviewVideo(null);
  }, [previewVideo]);

  // 关闭预览时清理 URL
  const handlePreviewClose = useCallback(() => {
    cleanupPreviewUrl();
    onPreviewClose();
  }, [cleanupPreviewUrl, onPreviewClose]);

  // 检查录屏插件是否安装
  const checkRecorderInstalled = useCallback(async () => {
    try {
      await chrome.runtime.sendMessage(RECORDER_EXTENSION_ID, { type: "PING" });
      setIsRecorderInstalled(true);
    } catch (error) {
      console.error("Recorder extension not detected:", error);
      setIsRecorderInstalled(false);
    }
  }, []);

  // 拉取录屏历史列表
  const fetchRecordings = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await chrome.runtime.sendMessage(RECORDER_EXTENSION_ID, {
        type: "RECORDER_LIST_RECORDINGS",
        limit: 20,
      });

      if (!response?.ok) {
        throw new Error(response?.error || "Failed to fetch recordings");
      }

      setRecordings(response.recordings || []);
    } catch (error) {
      console.error("Failed to fetch recordings:", error);
      // 如果失败，可能插件未安装
      await checkRecorderInstalled();
    } finally {
      setIsLoading(false);
    }
  }, [checkRecorderInstalled]);

  // 更新录屏的缓存状态到 storage
  const updateRecordingCacheStatus = useCallback(async (recordingId: string) => {
    try {
      const result = await chrome.storage.local.get([RECORDER_DATA_STORAGE_KEY]);
      const existingData: RecordingMetadata[] = result[RECORDER_DATA_STORAGE_KEY] || [];

      const updated = existingData.map((rec) => {
        if (rec.id === recordingId) {
          return {
            ...rec,
            videoCached: true,
            videoCachedAt: Date.now(),
          };
        }
        return rec;
      });

      await chrome.storage.local.set({ [RECORDER_DATA_STORAGE_KEY]: updated });
    } catch (error) {
      console.error("Failed to update cache status:", error);
    }
  }, []);

  // 拉取指定录屏视频
  const pullRecording = useCallback(
    async (recording: RecordingMetadata) => {
      setIsTransferring(true);
      setTransferProgress(0);

      try {
        // 先尝试从缓存获取
        let videoBlob = await getCachedRecordingVideo(recording.id);

        // 如果缓存中没有，则从录屏插件拉取（会自动缓存）
        if (!videoBlob) {
          videoBlob = await pullRecordingVideo(recording.id);
          // 更新缓存状态
          await updateRecordingCacheStatus(recording.id);
        }

        // 创建 FileData 对象
        const mimeType = recording.format === "mp4" ? "video/mp4" : "video/webm";
        const file = new File([videoBlob], `${recording.title}.${recording.format}`, { type: mimeType });
        const fileData: FileData & { title?: string } = {
          name: file.name,
          url: URL.createObjectURL(videoBlob),
          type: mimeType,
          size: videoBlob.size,
          title: recording.title,
        };

        onVideoSelect(fileData);
        onClose();
      } catch (error) {
        console.error("Failed to pull recording:", error);
        alert(chrome.i18n.getMessage("recorderPullFailed"));
      } finally {
        setIsTransferring(false);
        setTransferProgress(0);
      }
    },
    [onVideoSelect, onClose, updateRecordingCacheStatus],
  );

  // 预览视频 - 优先使用缓存的视频数据
  const pullRecordingForPreview = useCallback(
    async (recordingId: string): Promise<Blob> => {
      console.log("[RecorderModal] pullRecordingForPreview:", recordingId);

      // 先尝试从缓存获取
      console.log("[RecorderModal] 尝试从缓存获取视频...");
      let videoBlob = await getCachedRecordingVideo(recordingId);

      if (videoBlob) {
        console.log("[RecorderModal] 从缓存获取成功:", videoBlob.size, "bytes");
      } else {
        console.log("[RecorderModal] 缓存中没有，从录屏插件拉取...");
        // 如果缓存中没有，则从录屏插件拉取（会自动缓存）
        videoBlob = await pullRecordingVideo(recordingId);
        console.log("[RecorderModal] 从录屏插件拉取成功:", videoBlob.size, "bytes");
        // 更新缓存状态
        await updateRecordingCacheStatus(recordingId);
        console.log("[RecorderModal] 缓存状态已更新");
      }

      return videoBlob;
    },
    [updateRecordingCacheStatus],
  );

  const handlePreview = useCallback(
    async (recording: RecordingMetadata) => {
      console.log("[RecorderModal] 开始预览视频, recording:", JSON.stringify(recording));
      try {
        setIsLoadingPreview(true);
        setTransferProgress(0);

        console.log("[RecorderModal] 调用 pullRecordingForPreview, recordingId:", recording.id);
        // 拉取视频用于预览
        const videoBlob = await pullRecordingForPreview(recording.id);
        console.log("[RecorderModal] 获取到视频 Blob:", videoBlob.size, "bytes");

        // 创建临时预览 URL
        const previewUrl = URL.createObjectURL(videoBlob);
        console.log("[RecorderModal] 创建预览 URL:", previewUrl);
        setPreviewVideo(previewUrl);
        onPreviewOpen();
        console.log("[RecorderModal] 预览对话框已打开");
      } catch (error) {
        console.error("[RecorderModal] 预览失败:", error);
        alert(chrome.i18n.getMessage("recorderPreviewFailed") || "预览失败");
      } finally {
        setIsLoadingPreview(false);
        setTransferProgress(0);
      }
    },
    [onPreviewOpen, pullRecordingForPreview],
  );

  // 使用视频
  const handleUseVideo = useCallback(
    (recording: RecordingMetadata) => {
      pullRecording(recording);
    },
    [pullRecording],
  );

  // 刷新列表
  const handleRefresh = useCallback(() => {
    fetchRecordings();
  }, [fetchRecordings]);

  useEffect(() => {
    if (isOpen) {
      checkRecorderInstalled();
      fetchRecordings();
    }
  }, [isOpen, checkRecorderInstalled, fetchRecordings]);

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} size="2xl" scrollBehavior="inside">
        <ModalContent>
          <ModalHeader className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <h3 className="text-lg">{chrome.i18n.getMessage("recorderSelectFromRecorder")}</h3>
              <Button
                isIconOnly
                size="sm"
                variant="light"
                onPress={handleRefresh}
                isLoading={isLoading}
                isDisabled={!isRecorderInstalled}>
                <RefreshCw className="w-4 h-4" />
              </Button>
            </div>
          </ModalHeader>
          <ModalBody>
            {!isRecorderInstalled ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <VideoIcon className="w-16 h-16 text-gray-400 mb-4" />
                <p className="text-lg font-medium mb-2">{chrome.i18n.getMessage("recorderNotInstalled")}</p>
                <p className="text-sm text-gray-500">{chrome.i18n.getMessage("recorderNotInstalledDesc")}</p>
              </div>
            ) : isTransferring || isLoadingPreview ? (
              <div className="flex flex-col items-center justify-center py-8">
                <Progress value={transferProgress} color="primary" className="w-full max-w-md mb-4" showValueLabel />
                <p className="text-sm text-gray-600">
                  {isLoadingPreview
                    ? chrome.i18n.getMessage("recorderLoadingPreview") || "正在加载预览..."
                    : chrome.i18n.getMessage("recorderTransferProgress", [transferProgress.toString()])}
                </p>
              </div>
            ) : recordings.length === 0 && !isLoading ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <VideoIcon className="w-16 h-16 text-gray-400 mb-4" />
                <p className="text-lg font-medium">{chrome.i18n.getMessage("recorderNoRecordings")}</p>
              </div>
            ) : (
              <div className="space-y-2">
                {recordings.map((recording) => (
                  <Card key={recording.id} className="hover:bg-default-100 transition-colors">
                    <CardBody>
                      <div className="flex items-center gap-4">
                        <div className="w-16 h-16 bg-default-200 rounded-lg flex items-center justify-center flex-shrink-0">
                          <VideoIcon className="w-8 h-8 text-default-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate mb-1">{recording.title}</p>
                          <div className="flex items-center gap-3 text-sm text-gray-500">
                            <div className="flex items-center gap-1">
                              <ClockIcon className="w-3 h-3" />
                              <span>{formatDuration(recording.duration)}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <HardDrive className="w-3 h-3" />
                              <span>{formatFileSize(recording.size)}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="flat"
                            onPress={() => handlePreview(recording)}
                            isDisabled={isLoadingPreview || isTransferring}>
                            {chrome.i18n.getMessage("recorderPreviewVideo")}
                          </Button>
                          <Button size="sm" color="primary" onPress={() => handleUseVideo(recording)}>
                            {chrome.i18n.getMessage("recorderUseVideo")}
                          </Button>
                        </div>
                      </div>
                    </CardBody>
                  </Card>
                ))}
              </div>
            )}
          </ModalBody>
          <ModalFooter>
            <Button variant="light" onPress={onClose}>
              {chrome.i18n.getMessage("cancelButton")}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* 预览模态框 */}
      <Modal isOpen={isPreviewOpen} onClose={handlePreviewClose} size="3xl">
        <ModalContent>
          <ModalHeader>{chrome.i18n.getMessage("recorderPreviewVideo")}</ModalHeader>
          <ModalBody>
            {previewVideo && (
              <div className="aspect-video bg-black rounded-lg overflow-hidden">
                <Player>
                  <source src={previewVideo} />
                </Player>
              </div>
            )}
          </ModalBody>
          <ModalFooter>
            <Button onPress={handlePreviewClose}>{chrome.i18n.getMessage("cancelButton")}</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  );
};
