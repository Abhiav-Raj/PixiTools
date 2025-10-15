import imageCompression from "browser-image-compression";
import { jsPDF } from "jspdf";

/** Resize image */
export const resizeImage = async (
  file: File,
  maxWidth: number,
  maxHeight: number,
  maintainAspectRatio: boolean = true
): Promise<File> => {
  const options = {
    maxWidthOrHeight: maintainAspectRatio ? Math.max(maxWidth, maxHeight) : maxWidth,
    useWebWorker: true,
    fileType: file.type,
  };
  try {
    return await imageCompression(file, options);
  } catch (error) {
    console.error("Error resizing image:", error);
    throw new Error("Failed to resize image");
  }
};

/** Compress image */
export const compressImage = async (
  file: File,
  targetSizeKB?: number,
  quality?: number
): Promise<File> => {
  const options: any = { useWebWorker: true, fileType: file.type };
  if (targetSizeKB) options.maxSizeMB = targetSizeKB / 1024;
  if (quality) options.initialQuality = quality;
  try {
    return await imageCompression(file, options);
  } catch (error) {
    console.error("Error compressing image:", error);
    throw new Error("Failed to compress image");
  }
};

/** Convert image format */
export const convertImageFormat = async (
  file: File,
  targetFormat: string
): Promise<File> => {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const img = new Image();
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      if (!ctx) return reject(new Error("Canvas context not available"));
      ctx.drawImage(img, 0, 0);
      canvas.toBlob(
        (blob) => {
          if (!blob) return reject(new Error("Failed to convert image format"));
          const convertedFile = new File(
            [blob],
            file.name.replace(/\.[^/.]+$/, `.${targetFormat.split("/")[1]}`),
            { type: targetFormat }
          );
          resolve(convertedFile);
        },
        targetFormat,
        0.9
      );
    };
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = URL.createObjectURL(file);
  });
};

/** Crop image */
export const cropImage = async (
  file: File,
  x: number,
  y: number,
  width: number,
  height: number
): Promise<File> => {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const img = new Image();
    img.onload = () => {
      canvas.width = width;
      canvas.height = height;
      if (!ctx) return reject(new Error("Canvas context not available"));
      ctx.drawImage(img, x, y, width, height, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          if (!blob) return reject(new Error("Failed to crop image"));
          resolve(new File([blob], file.name, { type: file.type }));
        },
        file.type,
        0.9
      );
    };
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = URL.createObjectURL(file);
  });
};

/** Get image dimensions */
export const getImageDimensions = (
  file: File
): Promise<{ width: number; height: number }> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.width, height: img.height });
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = URL.createObjectURL(file);
  });

  export const imageToPDF = async (file: File): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    const img = new Image();

    img.onload = () => {
      try {
        const pdf = new jsPDF();
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          reject(new Error('Failed to create canvas context'));
          return;
        }

        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);

        const imgData = canvas.toDataURL('image/jpeg', 0.9);

        // Calculate dimensions to fit page
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = pdf.internal.pageSize.getHeight();
        const imgAspectRatio = img.width / img.height;
        const pdfAspectRatio = pdfWidth / pdfHeight;

        let finalWidth, finalHeight;
        if (imgAspectRatio > pdfAspectRatio) {
          finalWidth = pdfWidth;
          finalHeight = pdfWidth / imgAspectRatio;
        } else {
          finalHeight = pdfHeight;
          finalWidth = pdfHeight * imgAspectRatio;
        }

        const xOffset = (pdfWidth - finalWidth) / 2;
        const yOffset = (pdfHeight - finalHeight) / 2;

        pdf.addImage(imgData, 'JPEG', xOffset, yOffset, finalWidth, finalHeight);

        const pdfBlob = pdf.output('blob');
        resolve(pdfBlob);
      } catch (error) {
        reject(error);
      }
    };

    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = URL.createObjectURL(file);
  });
};

/** Add watermark: single-position or tiled diagonal “all-over” */
export const addWatermarkToImage = async (
  file: File,
  watermarkText: string,
  position:
    | "top-left"
    | "top-right"
    | "bottom-left"
    | "bottom-right"
    | "center"
    | "all-over" = "bottom-right",
  opacity: number = 0.5,
  color: string = "#000000"
): Promise<File> => {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const img = new Image();

    const cleanup = () => {
      try {
        URL.revokeObjectURL(img.src);
      } catch {}
    };

    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      if (!ctx) {
        cleanup();
        return reject(new Error("Canvas context not available"));
      }

      // Draw original
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      const base = Math.min(canvas.width, canvas.height);
      const fontSize = Math.max(14, Math.round(base * 0.05));

      if (position === "all-over") {
        // Tiled, diagonal watermark
        const tile = document.createElement("canvas");
        const tctx = tile.getContext("2d");
        if (!tctx) {
          cleanup();
          return reject(new Error("Tile context not available"));
        }

        tctx.font = `${fontSize}px sans-serif`;
        tctx.textAlign = "center";
        tctx.textBaseline = "middle";

        const textW = Math.ceil(tctx.measureText(watermarkText).width);
        const textH = Math.ceil(fontSize);
        const pad = Math.round(fontSize * 0.75);
        const tileW = textW + pad * 2;
        const tileH = textH + pad * 2;

        tile.width = tileW;
        tile.height = tileH;

        // Re-apply styles after resize
        tctx.font = `${fontSize}px sans-serif`;
        tctx.textAlign = "center";
        tctx.textBaseline = "middle";

        tctx.save();
        tctx.translate(tileW / 2, tileH / 2);
        tctx.rotate(-Math.PI / 4);
        tctx.fillStyle = color;
        tctx.globalAlpha = Math.max(0, Math.min(1, opacity));
        tctx.fillText(watermarkText, 0, 0);
        tctx.restore();

        const pattern = ctx.createPattern(tile, "repeat");
        if (!pattern) {
          cleanup();
          return reject(new Error("Failed to create pattern"));
        }

        ctx.save();
        ctx.fillStyle = pattern as any;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.restore();
      } else {
        // Single positioned text
        ctx.font = `${fontSize}px sans-serif`;
        ctx.fillStyle = color;
        ctx.globalAlpha = Math.max(0, Math.min(1, opacity));

        const textWidth = ctx.measureText(watermarkText).width;
        let x = 10;
        let y = canvas.height - 10;

        if (position.includes("top")) y = 20 + fontSize;
        if (position.includes("right")) x = canvas.width - textWidth - 10;
        if (position === "center") {
          x = (canvas.width - textWidth) / 2;
          y = canvas.height / 2;
        }

        ctx.fillText(watermarkText, x, y);
        ctx.globalAlpha = 1;
      }

      // Build output file name and type
      const originalExt = file.name.match(/\.[^/.]+$/)?.[0] ?? ".png";
      const baseName = file.name.replace(/\.[^/.]+$/, "");
      const suffix = position === "all-over" ? "_watermarked_tiled" : "_watermarked";
      const outName = `${baseName}${suffix}${originalExt}`;
      const targetType = file.type || "image/png";

      canvas.toBlob(
        (blob) => {
          cleanup();
          if (!blob) return reject(new Error("Failed to add watermark"));
          resolve(new File([blob], outName, { type: targetType }));
        },
        targetType,
        0.9
      );
    };

    img.onerror = () => {
      cleanup();
      reject(new Error("Failed to load image"));
    };

    img.src = URL.createObjectURL(file);
  });
};
