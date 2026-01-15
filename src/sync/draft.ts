import { Storage } from "@plasmohq/storage";

const storage = new Storage({
  area: "local",
});

export const DRAFTS_STORAGE_KEY = "multipost_drafts";

export type DraftType = "DYNAMIC" | "VIDEO" | "ARTICLE";

export interface BaseDraftData {
  id: string;
  type: DraftType;
  title: string;
  content: string;
  createdAt: number;
  updatedAt: number;
}

export interface DynamicDraftData extends BaseDraftData {
  type: "DYNAMIC";
  images: Array<{
    name: string;
    url: string;
    type?: string;
    size?: number;
  }>;
  videos: Array<{
    name: string;
    url: string;
    type?: string;
    size?: number;
  }>;
}

export interface VideoDraftData extends BaseDraftData {
  type: "VIDEO";
  video: {
    name: string;
    url: string;
    type?: string;
    size?: number;
  } | null;
  cover?: {
    name: string;
    url: string;
    type?: string;
    size?: number;
  };
  tags?: string[];
}

export interface ArticleDraftData extends BaseDraftData {
  type: "ARTICLE";
  digest: string;
  cover?: {
    name: string;
    url: string;
    type?: string;
    size?: number;
  };
  htmlContent: string;
  markdownContent: string;
  images?: Array<{
    name: string;
    url: string;
    type?: string;
    size?: number;
  }>;
}

export type DraftData = DynamicDraftData | VideoDraftData | ArticleDraftData;

export interface DraftWithMetadata {
  draft: DraftData;
  isFromRecorder: boolean;
}

// 获取所有草稿
export async function getAllDrafts(): Promise<DraftData[]> {
  const drafts = await storage.get<DraftData[]>(DRAFTS_STORAGE_KEY);
  return drafts || [];
}

// 保存草稿
export async function saveDraft(draft: DraftData): Promise<void> {
  const drafts = await getAllDrafts();
  const existingIndex = drafts.findIndex((d) => d.id === draft.id);

  if (existingIndex >= 0) {
    // 更新现有草稿
    drafts[existingIndex] = { ...draft, updatedAt: Date.now() };
  } else {
    // 添加新草稿
    drafts.push(draft);
  }

  // 按更新时间排序
  drafts.sort((a, b) => b.updatedAt - a.updatedAt);

  await storage.set(DRAFTS_STORAGE_KEY, drafts);
}

// 删除草稿
export async function deleteDraft(draftId: string): Promise<void> {
  const drafts = await getAllDrafts();
  const filtered = drafts.filter((d) => d.id !== draftId);
  await storage.set(DRAFTS_STORAGE_KEY, filtered);
}

// 创建新草稿
export function createDraft(type: DraftType, initialData?: Partial<DraftData>): DraftData {
  const now = Date.now();
  const baseDraft: BaseDraftData = {
    id: crypto.randomUUID(),
    type,
    title: initialData?.title || "",
    content: initialData?.content || "",
    createdAt: now,
    updatedAt: now,
  };

  switch (type) {
    case "DYNAMIC":
      return {
        ...baseDraft,
        type: "DYNAMIC",
        images: (initialData as DynamicDraftData)?.images || [],
        videos: (initialData as DynamicDraftData)?.videos || [],
      };
    case "VIDEO":
      return {
        ...baseDraft,
        type: "VIDEO",
        video: (initialData as VideoDraftData)?.video || null,
        cover: (initialData as VideoDraftData)?.cover,
        tags: (initialData as VideoDraftData)?.tags || [],
      };
    case "ARTICLE":
      return {
        ...baseDraft,
        type: "ARTICLE",
        digest: (initialData as ArticleDraftData)?.digest || "",
        cover: (initialData as ArticleDraftData)?.cover,
        htmlContent: (initialData as ArticleDraftData)?.htmlContent || "",
        markdownContent: (initialData as ArticleDraftData)?.markdownContent || "",
        images: (initialData as ArticleDraftData)?.images || [],
      };
  }
}

// 格式化时间
export function formatDraftTime(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now.getTime() - date.getTime();

  // 小于 1 分钟
  if (diff < 60 * 1000) {
    return chrome.i18n.getMessage("draftSavedAt", ["刚刚"]);
  }

  // 小于 1 小时
  if (diff < 60 * 60 * 1000) {
    const minutes = Math.floor(diff / (60 * 1000));
    return chrome.i18n.getMessage("draftSavedAt", [`${minutes}分钟前`]);
  }

  // 小于 24 小时
  if (diff < 24 * 60 * 60 * 1000) {
    const hours = Math.floor(diff / (60 * 60 * 1000));
    return chrome.i18n.getMessage("draftSavedAt", [`${hours}小时前`]);
  }

  // 大于 24 小时，显示日期
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");

  return chrome.i18n.getMessage("draftSavedAt", [`${year}-${month}-${day} ${hour}:${minute}`]);
}
