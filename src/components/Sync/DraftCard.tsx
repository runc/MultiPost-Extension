import { Button, Card, CardBody, Chip } from "@heroui/react";
import { ClockIcon, EditIcon, FileVideoIcon, TrashIcon } from "lucide-react";
import type React from "react";
import { useCallback, useMemo } from "react";
import { type DraftData, formatDraftTime } from "~sync/draft";

interface DraftCardProps {
  draft: DraftData;
  onDelete: (id: string) => void;
  onEdit: (draft: DraftData) => void;
}

const getDraftTypeLabel = (type: DraftData["type"]): string => {
  switch (type) {
    case "DYNAMIC":
      return chrome.i18n.getMessage("draftTypeDynamic");
    case "VIDEO":
      return chrome.i18n.getMessage("draftTypeVideo");
    case "ARTICLE":
      return chrome.i18n.getMessage("draftTypeArticle");
  }
};

const getDraftTypeColor = (type: DraftData["type"]): "primary" | "secondary" | "success" => {
  switch (type) {
    case "DYNAMIC":
      return "primary";
    case "VIDEO":
      return "secondary";
    case "ARTICLE":
      return "success";
  }
};

export const DraftCard: React.FC<DraftCardProps> = ({ draft, onDelete, onEdit }) => {
  const handleDelete = useCallback(() => {
    if (confirm(chrome.i18n.getMessage("draftConfirmDelete"))) {
      onDelete(draft.id);
    }
  }, [draft.id, onDelete]);

  const handleEdit = useCallback(() => {
    onEdit(draft);
  }, [draft, onEdit]);

  const previewContent = useMemo(() => {
    if (draft.type === "ARTICLE") {
      return draft.digest || draft.htmlContent?.replace(/<[^>]*>/g, "").slice(0, 100) || "";
    }
    return draft.content?.slice(0, 100) || "";
  }, [draft]);

  return (
    <Card className="hover:bg-default-100 transition-colors" isPressable onPress={handleEdit}>
      <CardBody>
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <Chip size="sm" color={getDraftTypeColor(draft.type)} variant="flat">
                {getDraftTypeLabel(draft.type)}
              </Chip>
              {draft.type === "VIDEO" && draft.video && (
                <Chip size="sm" variant="flat" startContent={<FileVideoIcon className="w-3 h-3" />}>
                  {draft.video.name}
                </Chip>
              )}
            </div>
            {draft.title && <p className="font-medium text-sm truncate mb-1">{draft.title}</p>}
            {previewContent && <p className="text-xs text-gray-500 line-clamp-2 mb-2">{previewContent}</p>}
            <div className="flex items-center gap-1 text-xs text-gray-400">
              <ClockIcon className="w-3 h-3" />
              <span>{formatDraftTime(draft.updatedAt)}</span>
            </div>
          </div>
          <div className="flex gap-1">
            <Button isIconOnly size="sm" variant="light" onPress={handleEdit} className="flex-shrink-0">
              <EditIcon className="w-4 h-4" />
            </Button>
            <Button
              isIconOnly
              size="sm"
              variant="light"
              color="danger"
              onPress={handleDelete}
              className="flex-shrink-0">
              <TrashIcon className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </CardBody>
    </Card>
  );
};
