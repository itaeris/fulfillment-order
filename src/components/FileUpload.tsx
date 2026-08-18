"use client";

import { useCallback, useState, useMemo } from "react";
import { Upload, FileSpreadsheet, X, CheckCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Platform, UploadedFile } from "@/types/order";
import { cn, getPlatformName } from "@/lib/utils";

interface FileUploadProps {
  onFileUpload: (file: File, platform: Platform) => Promise<number>;
  uploadedFiles: UploadedFile[];
  onRemoveFile: (fileName: string) => void;
}

function isManualUpload(file: UploadedFile) {
  return file.platform !== "tiktok" && file.platform !== "tokopedia";
}

export default function FileUpload({
  onFileUpload,
  uploadedFiles,
  onRemoveFile,
}: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedPlatform, setSelectedPlatform] = useState<Platform>("shopee");
  const manualFiles = useMemo(
    () => uploadedFiles.filter(isManualUpload),
    [uploadedFiles]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);

      const files = Array.from(e.dataTransfer.files).filter(
        (file) =>
          file.name.endsWith(".xlsx") ||
          file.name.endsWith(".xls") ||
          file.name.endsWith(".csv")
      );

      if (files.length > 0) {
        setIsUploading(true);
        for (const file of files) {
          await onFileUpload(file, selectedPlatform);
        }
        setIsUploading(false);
      }
    },
    [onFileUpload, selectedPlatform]
  );

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files && files.length > 0) {
        setIsUploading(true);
        for (const file of Array.from(files)) {
          await onFileUpload(file, selectedPlatform);
        }
        setIsUploading(false);
        e.target.value = "";
      }
    },
    [onFileUpload, selectedPlatform]
  );

  const platforms: { value: Platform; label: string; color: string }[] = [
    { value: "shopee", label: "Shopee", color: "bg-shopee-500" },
    { value: "jubelio", label: "Jubelio", color: "bg-brand-500" },
  ];

  return (
    <div className="bg-white rounded-xl shadow-sm border border-brand-200 p-4 sm:p-6">
      <h2 className="text-base sm:text-lg font-semibold text-brand-800 mb-4">
        Import Data Order
      </h2>

      {/* Platform Selection */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-brand-400 mb-2">
          Pilih Platform
        </label>
        <div className="flex flex-wrap gap-2">
          {platforms.map((platform) => (
            <button
              key={platform.value}
              onClick={() => setSelectedPlatform(platform.value)}
              className={cn(
                "px-4 py-2 rounded-lg text-sm font-medium transition-all",
                selectedPlatform === platform.value
                  ? `${platform.color} text-white shadow-md`
                  : "bg-cream-200 text-brand-400 hover:bg-cream-300"
              )}
            >
              {platform.label}
            </button>
          ))}
        </div>
      </div>

      {/* Upload Area */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          "relative border-2 border-dashed rounded-xl p-6 sm:p-8 text-center transition-all",
          isDragging
            ? "border-brand-500 bg-brand-50"
            : "border-brand-200 hover:border-brand-300",
          isUploading && "opacity-50 pointer-events-none"
        )}
      >
        <input
          type="file"
          accept=".xlsx,.xls,.csv"
          multiple
          onChange={handleFileSelect}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          disabled={isUploading}
        />

        <div className="flex flex-col items-center gap-3">
          <div
            className={cn(
              "w-14 h-14 rounded-full flex items-center justify-center",
              isDragging ? "bg-brand-100" : "bg-cream-200"
            )}
          >
            <Upload
              className={cn(
                "w-6 h-6",
                isDragging ? "text-brand-500" : "text-brand-300"
              )}
            />
          </div>

          <div>
            <p className="text-brand-700 font-medium">
              {isUploading
                ? "Mengupload..."
                : "Drag & drop file Excel di sini"}
            </p>
            <p className="text-sm text-brand-400 mt-1">
              atau klik untuk memilih file (.xlsx, .xls, .csv)
            </p>
          </div>
        </div>
      </div>

      {/* Uploaded Files List - Grouped by Platform */}
      {manualFiles.length > 0 && (
        <UploadedFilesTabs
          uploadedFiles={manualFiles}
          onRemoveFile={onRemoveFile}
          platforms={platforms}
        />
      )}
    </div>
  );
}

function UploadedFilesTabs({
  uploadedFiles,
  onRemoveFile,
  platforms,
}: {
  uploadedFiles: UploadedFile[];
  onRemoveFile: (fileName: string) => void;
  platforms: { value: Platform; label: string; color: string }[];
}) {
  const [activeFileTab, setActiveFileTab] = useState<Platform | "all">("all");

  const grouped = useMemo(() => {
    const map: Record<string, UploadedFile[]> = {};
    for (const p of platforms) {
      map[p.value] = uploadedFiles.filter((f) => f.platform === p.value);
    }
    return map;
  }, [uploadedFiles, platforms]);

  const visibleFiles =
    activeFileTab === "all"
      ? uploadedFiles
      : grouped[activeFileTab] ?? [];

  const fileTabs: { id: Platform | "all"; label: string; count: number; dotColor?: string }[] = [
    { id: "all", label: "Semua", count: uploadedFiles.length },
    ...platforms.map((p) => ({
      id: p.value as Platform | "all",
      label: p.label,
      count: grouped[p.value]?.length ?? 0,
      dotColor: p.color,
    })),
  ];

  return (
    <div className="mt-4">
      <h3 className="text-sm font-medium text-brand-400 mb-3">
        File yang diupload
      </h3>

      {/* Platform Tabs */}
      <div className="flex gap-1.5 mb-3 overflow-x-auto scrollbar-hide">
        {fileTabs.map((tab) => {
          const isActive = activeFileTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveFileTab(tab.id)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all",
                isActive
                  ? "bg-brand-600 text-white shadow-sm"
                  : "bg-cream-200 text-brand-400 hover:bg-cream-300"
              )}
            >
              {tab.dotColor && (
                <span className={cn("w-2 h-2 rounded-full shrink-0", isActive ? "bg-white/70" : tab.dotColor)} />
              )}
              {tab.label}
              <span className={cn(
                "text-[10px] px-1.5 py-0.5 rounded-full font-semibold",
                isActive ? "bg-white/20 text-white" : "bg-brand-200/60 text-brand-400"
              )}>
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* File List */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeFileTab}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.15 }}
          className="space-y-2"
        >
          {visibleFiles.length === 0 ? (
            <div className="text-center py-6 text-sm text-brand-300">
              Belum ada file untuk platform ini
            </div>
          ) : (
            visibleFiles.map((file) => (
              <div
                key={file.name}
                className="flex items-center justify-between p-3 bg-cream-100 rounded-lg border border-brand-200"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <FileSpreadsheet className="w-5 h-5 text-brand-500 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-brand-700 truncate">
                      {file.name}
                    </p>
                    <p className="text-xs text-brand-400">
                      {getPlatformName(file.platform)} &bull; {file.orderCount} order
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <button
                    onClick={() => onRemoveFile(file.name)}
                    className="p-1 hover:bg-cream-300 rounded transition-colors"
                  >
                    <X className="w-4 h-4 text-brand-300" />
                  </button>
                </div>
              </div>
            ))
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
