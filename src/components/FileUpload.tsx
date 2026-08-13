"use client";

import { useCallback, useState } from "react";
import { Upload, FileSpreadsheet, X, CheckCircle } from "lucide-react";
import { Platform, UploadedFile } from "@/types/order";
import { cn, getPlatformName } from "@/lib/utils";

interface FileUploadProps {
  onFileUpload: (file: File, platform: Platform) => Promise<number>;
  uploadedFiles: UploadedFile[];
  onRemoveFile: (fileName: string) => void;
}

export default function FileUpload({
  onFileUpload,
  uploadedFiles,
  onRemoveFile,
}: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedPlatform, setSelectedPlatform] = useState<Platform>("shopee");

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
    { value: "tiktok", label: "TikTok & Tokopedia", color: "bg-brand-800" },
    { value: "jubelio", label: "Jubelio", color: "bg-brand-500" },
  ];

  return (
    <div className="bg-white rounded-xl shadow-sm border border-brand-200 p-6">
      <h2 className="text-lg font-semibold text-brand-800 mb-4">
        Import Data Order
      </h2>

      {/* Platform Selection */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-brand-400 mb-2">
          Pilih Platform
        </label>
        <div className="flex gap-2">
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
          "relative border-2 border-dashed rounded-xl p-8 text-center transition-all",
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

      {/* Uploaded Files List */}
      {uploadedFiles.length > 0 && (
        <div className="mt-4">
          <h3 className="text-sm font-medium text-brand-400 mb-2">
            File yang diupload
          </h3>
          <div className="space-y-2">
            {uploadedFiles.map((file) => (
              <div
                key={file.name}
                className="flex items-center justify-between p-3 bg-cream-100 rounded-lg border border-brand-200"
              >
                <div className="flex items-center gap-3">
                  <FileSpreadsheet className="w-5 h-5 text-brand-500" />
                  <div>
                    <p className="text-sm font-medium text-brand-700">
                      {file.name}
                    </p>
                    <p className="text-xs text-brand-400">
                      {getPlatformName(file.platform)} &bull; {file.orderCount} order
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <button
                    onClick={() => onRemoveFile(file.name)}
                    className="p-1 hover:bg-cream-300 rounded"
                  >
                    <X className="w-4 h-4 text-brand-300" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
