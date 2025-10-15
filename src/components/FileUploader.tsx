import React, { useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { Upload, X, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export interface FileUploaderProps {
  files: File[];
  onFilesSelected: (files: File[]) => void;
  onRemoveFile?: (index: number) => void;
  acceptedTypes?: string[];
  maxFiles?: number;
  className?: string;
}

const FileUploader: React.FC<FileUploaderProps> = ({
  files,
  onFilesSelected,
  onRemoveFile,
  acceptedTypes = ["image/*"],
  maxFiles = 10,
  className = "",
}) => {
  // Handle file drop
  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      const newFiles = [...files, ...acceptedFiles].slice(0, maxFiles);
      onFilesSelected(newFiles);
    },
    [files, onFilesSelected, maxFiles]
  );

  // Configure dropzone
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: acceptedTypes.reduce((acc, type) => {
      acc[type] = [];
      return acc;
    }, {} as Record<string, string[]>),
    maxFiles,
  });

  // File size formatting
  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  return (
    <div className={className}>
      {/* Upload Area */}
      <Card
        {...getRootProps()}
        className={`cursor-pointer border-2 border-dashed rounded-xl p-6 text-center transition-all ${
          isDragActive
            ? "border-primary bg-accent"
            : "border-muted hover:border-primary/60"
        }`}
      >
        <input {...getInputProps()} />
        <Upload className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />

        {isDragActive ? (
          <>
            <p className="text-lg font-semibold text-primary">
              Drop images here…
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              Release to upload your images
            </p>
          </>
        ) : (
          <>
            <p className="text-lg font-medium mb-1">
              Drag & drop images here, or click to browse
            </p>
            <p className="text-sm text-muted-foreground mb-4">
              Supports: {acceptedTypes.join(", ")} • Max {maxFiles} files
            </p>
            <Button variant="outline">Choose Files</Button>
          </>
        )}
      </Card>

      {/* File Previews */}
      {files.length > 0 && (
        <div className="mt-6">
          <h3 className="text-lg font-medium mb-3">
            Uploaded Images ({files.length})
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {files.map((file, index) => {
              const fileUrl = URL.createObjectURL(file);
              return (
                <div
                  key={index}
                  className="relative group border rounded-lg overflow-hidden shadow-sm"
                >
                  <img
                    src={fileUrl}
                    alt={file.name}
                    className="w-full h-32 object-cover"
                  />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                    {onRemoveFile && (
                      <Button
                        size="icon"
                        variant="destructive"
                        onClick={() => onRemoveFile(index)}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                  <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-xs px-2 py-1 truncate">
                    {file.name} ({formatFileSize(file.size)})
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default FileUploader;
