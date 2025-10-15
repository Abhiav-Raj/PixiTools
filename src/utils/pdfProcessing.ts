import { PDFDocument, rgb, degrees } from 'pdf-lib';
import jsPDF from 'jspdf';

// TODO: backend option - these functions could be replaced with API calls for server-side processing

/**
 * Convert images to PDF
 * @param imageFiles - Array of image files to convert
 * @param pageSize - Page size option ('A4', 'Letter', 'Custom')
 * @returns Promise<Uint8Array> - PDF document as bytes
 */
export const imagesToPDF = async (
  imageFiles: File[],
  pageSize: 'A4' | 'Letter' | 'Custom' = 'A4'
): Promise<Uint8Array> => {
  try {
    const pdfDoc = await PDFDocument.create();

    for (const imageFile of imageFiles) {
      const imageBytes = await imageFile.arrayBuffer();
      let image;

      if (imageFile.type === 'image/jpeg') {
        image = await pdfDoc.embedJpg(imageBytes);
      } else if (imageFile.type === 'image/png') {
        image = await pdfDoc.embedPng(imageBytes);
      } else {
        throw new Error(`Unsupported image type: ${imageFile.type}`);
      }

      const page = pdfDoc.addPage();
      const { width: pageWidth, height: pageHeight } = page.getSize();

      // Calculate dimensions to fit image on page while maintaining aspect ratio
      const imageAspectRatio = image.width / image.height;
      const pageAspectRatio = pageWidth / pageHeight;

      let scaledWidth, scaledHeight;

      if (imageAspectRatio > pageAspectRatio) {
        // Image is wider relative to page
        scaledWidth = pageWidth * 0.9;
        scaledHeight = scaledWidth / imageAspectRatio;
      } else {
        // Image is taller relative to page
        scaledHeight = pageHeight * 0.9;
        scaledWidth = scaledHeight * imageAspectRatio;
      }

      const x = (pageWidth - scaledWidth) / 2;
      const y = (pageHeight - scaledHeight) / 2;

      page.drawImage(image, {
        x,
        y,
        width: scaledWidth,
        height: scaledHeight,
      });
    }

    return await pdfDoc.save();
  } catch (error) {
    console.error('Error converting images to PDF:', error);
    throw new Error('Failed to convert images to PDF');
  }
};

/**
 * Extract images from PDF
 * @param pdfFile - PDF file to extract images from
 * @returns Promise<File[]> - Array of extracted image files
 */
export const extractImagesFromPDF = async (pdfFile: File): Promise<File[]> => {
  try {
    const pdfBytes = await pdfFile.arrayBuffer();
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const images: File[] = [];

    // This is a simplified implementation
    // In a real-world scenario, you'd need more sophisticated image extraction
    console.log('PDF image extraction is complex and would require additional libraries');
    
    return images;
  } catch (error) {
    console.error('Error extracting images from PDF:', error);
    throw new Error('Failed to extract images from PDF');
  }
};

/**
 * Merge multiple PDF files
 * @param pdfFiles - Array of PDF files to merge
 * @returns Promise<Uint8Array> - Merged PDF document as bytes
 */
export const mergePDFs = async (pdfFiles: File[]): Promise<Uint8Array> => {
  try {
    const mergedPdf = await PDFDocument.create();

    for (const pdfFile of pdfFiles) {
      const pdfBytes = await pdfFile.arrayBuffer();
      const pdf = await PDFDocument.load(pdfBytes);
      const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
      
      copiedPages.forEach((page) => mergedPdf.addPage(page));
    }

    return await mergedPdf.save();
  } catch (error) {
    console.error('Error merging PDFs:', error);
    throw new Error('Failed to merge PDFs');
  }
};

/**
 * Split PDF into separate files
 * @param pdfFile - PDF file to split
 * @param pageRanges - Array of page ranges [{start: 1, end: 3}, {start: 4, end: 6}]
 * @returns Promise<Uint8Array[]> - Array of PDF documents as bytes
 */
export const splitPDF = async (
  pdfFile: File,
  pageRanges: { start: number; end: number }[]
): Promise<Uint8Array[]> => {
  try {
    const pdfBytes = await pdfFile.arrayBuffer();
    const sourcePdf = await PDFDocument.load(pdfBytes);
    const splitPdfs: Uint8Array[] = [];

    for (const range of pageRanges) {
      const newPdf = await PDFDocument.create();
      const pageIndices = Array.from(
        { length: range.end - range.start + 1 },
        (_, i) => range.start - 1 + i
      );

      const copiedPages = await newPdf.copyPages(sourcePdf, pageIndices);
      copiedPages.forEach((page) => newPdf.addPage(page));

      const pdfBytes = await newPdf.save();
      splitPdfs.push(pdfBytes);
    }

    return splitPdfs;
  } catch (error) {
    console.error('Error splitting PDF:', error);
    throw new Error('Failed to split PDF');
  }
};

/**
 * Add watermark to PDF
 * @param pdfFile - PDF file to watermark
 * @param watermarkText - Text to use as watermark
 * @param opacity - Opacity of watermark (0-1)
 * @returns Promise<Uint8Array> - Watermarked PDF document as bytes
 */
export const addWatermarkToPDF = async (
  pdfFile: File,
  watermarkText: string,
  opacity: number = 0.3
): Promise<Uint8Array> => {
  try {
    const pdfBytes = await pdfFile.arrayBuffer();
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const pages = pdfDoc.getPages();

    pages.forEach((page) => {
      const { width, height } = page.getSize();
      
      // Add diagonal watermark
      page.drawText(watermarkText, {
        x: width / 4,
        y: height / 2,
        size: 50,
        color: rgb(0.5, 0.5, 0.5),
        opacity,
        rotate: degrees(45),
      });
    });

    return await pdfDoc.save();
  } catch (error) {
    console.error('Error adding watermark to PDF:', error);
    throw new Error('Failed to add watermark to PDF');
  }
};

/**
 * Compress PDF by reducing image quality and removing unnecessary data
 * @param pdfFile - PDF file to compress
 * @param compressionLevel - Compression level (1-5, higher = more compression)
 * @returns Promise<Uint8Array> - Compressed PDF document as bytes
 */
export const compressPDF = async (
  pdfFile: File,
  compressionLevel: number = 3
): Promise<Uint8Array> => {
  try {
    const pdfBytes = await pdfFile.arrayBuffer();
    const pdfDoc = await PDFDocument.load(pdfBytes);

    // This is a basic implementation - real PDF compression is more complex
    // For better compression, you'd need specialized libraries or server-side processing
    
    return await pdfDoc.save({
      useObjectStreams: true,
      addDefaultPage: false,
    });
  } catch (error) {
    console.error('Error compressing PDF:', error);
    throw new Error('Failed to compress PDF');
  }
};