import { Button, Image, Popover, PopoverContent, PopoverTrigger, Tab, Tabs } from "@heroui/react";
import { BookOpenText, BotIcon, LayoutDashboardIcon, SendIcon } from "lucide-react";
import type React from "react";

interface HeaderProps {
  selectedTab?: string;
  onTabChange?: (key: string) => void;
}

const Header: React.FC<HeaderProps> = ({ selectedTab, onTabChange }) => {
  return (
    <header className="bg-white shadow-sm">
      <div className="flex justify-between items-center px-4 py-2">
        <div className="flex gap-6 items-center">
          <div className="flex items-center">
            <Image src={chrome.runtime.getURL("assets/icon.png")} alt="logo" className="mr-2 w-8 h-8 rounded-full" />
            <h1 className="text-lg font-semibold">{chrome.i18n.getMessage("optionsTitle")}</h1>
          </div>
          {selectedTab && onTabChange && (
            <Tabs
              aria-label="sync publish"
              selectedKey={selectedTab}
              onSelectionChange={(key) => onTabChange(key as string)}
              variant="light"
              size="md"
              color="primary">
              <Tab key="dynamic" title={chrome.i18n.getMessage("gDynamic")} />
              <Tab key="article" title={chrome.i18n.getMessage("gArticle")} />
              <Tab key="video" title={chrome.i18n.getMessage("gVideo")} />
              <Tab key="draft" title={chrome.i18n.getMessage("gDraft")} />
            </Tabs>
          )}
        </div>
        <div className="flex gap-4 items-center">
          <Button
            size="sm"
            variant="flat"
            color="primary"
            as="a"
            target="_blank"
            href=""
            startContent={<LayoutDashboardIcon size={16} />}>
            <span className="text-sm">{chrome.i18n.getMessage("optionViewHomePageDashboard")}</span>
          </Button>
          <Button
            size="sm"
            variant="flat"
            color="primary"
            as="a"
            target="_blank"
            href=""
            startContent={<SendIcon size={16} />}>
            <span className="text-sm">{chrome.i18n.getMessage("optionViewHomePagePublish")}</span>
          </Button>
          <Popover>
            <PopoverTrigger>
              <Button size="sm" variant="flat" color="primary" startContent={<BookOpenText size={16} />}>
                <span className="text-sm">{chrome.i18n.getMessage("optionsViewDocs")}</span>
              </Button>
            </PopoverTrigger>
            <PopoverContent>
              <div className="flex flex-col gap-2 p-2">
                <Button
                  size="sm"
                  variant="light"
                  color="primary"
                  as="a"
                  target="_blank"
                  href=""
                  startContent={<BookOpenText size={16} />}>
                  <span className="text-sm">User Guide</span>
                </Button>
                <Button
                  size="sm"
                  variant="light"
                  color="primary"
                  as="a"
                  target="_blank"
                  href=""
                  startContent={<BotIcon size={16} />}>
                  <span className="text-sm">{chrome.i18n.getMessage("optionsViewAutomation")}</span>
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>
    </header>
  );
};

export default Header;
