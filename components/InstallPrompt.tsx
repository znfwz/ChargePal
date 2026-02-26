import React from 'react';
import { Download, X } from 'lucide-react';
import { useInstallPrompt } from '../hooks/useInstallPrompt';

const InstallPrompt: React.FC = () => {
  const { isIos, showPrompt, canDirectInstall, promptInstall, dismiss } = useInstallPrompt();

  if (!showPrompt) {
    return null;
  }

  return (
    <div className="fixed left-3 right-3 bottom-20 md:bottom-6 md:left-auto md:right-6 md:w-[360px] z-40">
      <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-xl p-4">
        <button
          type="button"
          onClick={dismiss}
          className="absolute right-6 top-6 p-1 rounded-full text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
          aria-label="关闭安装提示"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-start gap-3 pr-6">
          <img src="/icons/icon-192x192.png" alt="充小助图标" className="w-11 h-11 rounded-xl" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-gray-900 dark:text-white">安装 充小助</p>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 leading-5">
              {isIos
                ? '在 Safari 点击“分享”→“添加到主屏幕”，即可获得接近原生应用体验。'
                : '添加到主屏幕，离线也能快速访问充电记录与统计。'}
            </p>
          </div>
        </div>

        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={dismiss}
            className="flex-1 px-3 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-xs font-medium text-gray-700 dark:text-gray-200"
          >
            不再提示
          </button>
          {!isIos && canDirectInstall ? (
            <button
              type="button"
              onClick={() => {
                void promptInstall();
              }}
              className="flex-1 inline-flex items-center justify-center gap-1 px-3 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 text-xs font-semibold text-white"
            >
              <Download className="w-3.5 h-3.5" />
              立即安装
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default InstallPrompt;
