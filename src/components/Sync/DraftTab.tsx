import { Card, CardBody } from "@heroui/react";
import type React from "react";
import { useCallback, useState } from "react";
import type { SyncData } from "~sync/common";
import type { DraftData, DraftType } from "~sync/draft";
import { createDraft, saveDraft } from "~sync/draft";
import { DraftList } from "./DraftList";

interface DraftTabProps {
  funcPublish: (data: SyncData) => void;
  funcScraper?: (url: string) => Promise<any>;
}

type EditorMode = "LIST" | "DYNAMIC" | "VIDEO" | "ARTICLE";

export const DraftTab: React.FC<DraftTabProps> = ({ funcPublish, funcScraper }) => {
  const [mode, setMode] = useState<EditorMode>("LIST");
  const [editingDraft, setEditingDraft] = useState<DraftData | null>(null);

  // 处理编辑草稿
  const handleEditDraft = useCallback((draft: DraftData) => {
    setEditingDraft(draft);
    setMode(draft.type);
  }, []);

  // 处理创建新草稿
  const handleCreateNew = useCallback((type: DraftType) => {
    const newDraft = createDraft(type);
    setEditingDraft(newDraft);
    setMode(type);
  }, []);

  // 处理返回列表
  const handleBackToList = useCallback(() => {
    setMode("LIST");
    setEditingDraft(null);
  }, []);

  // 处理发布（自动保存草稿）
  const handlePublishWithSave = useCallback(
    async (data: SyncData) => {
      // 如果是编辑现有草稿，更新它
      if (editingDraft) {
        const updatedDraft = {
          ...editingDraft,
          ...data.data,
          updatedAt: Date.now(),
        };
        await saveDraft(updatedDraft as any);
      }
      funcPublish(data);
    },
    [editingDraft, funcPublish],
  );

  // 渲染列表视图
  if (mode === "LIST") {
    return (
      <div className="w-full">
        <Card className="shadow-none bg-default-50">
          <CardBody>
            <DraftList type="ALL" onEditDraft={handleEditDraft} onCreateNew={handleCreateNew} />
          </CardBody>
        </Card>
      </div>
    );
  }

  // 渲染编辑视图
  if (mode === "DYNAMIC") {
    const { default: DynamicTab } = require("./DynamicTab");
    return (
      <div className="relative">
        <button
          onClick={handleBackToList}
          className="absolute top-0 left-0 z-10 px-3 py-1 text-sm bg-default-100 rounded-lg hover:bg-default-200 transition-colors">
          ← {chrome.i18n.getMessage("cancelButton")}
        </button>
        <div className="mt-8">
          <DynamicTab funcPublish={handlePublishWithSave} />
        </div>
      </div>
    );
  }

  if (mode === "VIDEO") {
    const { default: VideoTab } = require("./VideoTab");
    return (
      <div className="relative">
        <button
          onClick={handleBackToList}
          className="absolute top-0 left-0 z-10 px-3 py-1 text-sm bg-default-100 rounded-lg hover:bg-default-200 transition-colors">
          ← {chrome.i18n.getMessage("cancelButton")}
        </button>
        <div className="mt-8">
          <VideoTab funcPublish={handlePublishWithSave} />
        </div>
      </div>
    );
  }

  if (mode === "ARTICLE") {
    const { default: ArticleTab } = require("./ArticleTab");
    return (
      <div className="relative">
        <button
          onClick={handleBackToList}
          className="absolute top-0 left-0 z-10 px-3 py-1 text-sm bg-default-100 rounded-lg hover:bg-default-200 transition-colors">
          ← {chrome.i18n.getMessage("cancelButton")}
        </button>
        <div className="mt-8">
          <ArticleTab funcPublish={handlePublishWithSave} funcScraper={funcScraper} />
        </div>
      </div>
    );
  }

  return null;
};

export default DraftTab;
