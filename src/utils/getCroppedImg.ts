/**
 * Returns a cropped image Blob from an image URL and crop area.
 * Works with JPG, PNG, WebP, etc.
 * @param {string} imageSrc - source URL of the image
 * @param {Object} pixelCrop - { x, y, width, height } from react-easy-crop
 * @returns {Promise<Blob>} - cropped image blob
 */
export default function getCroppedImg(imageSrc, pixelCrop) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous"; // handle CORS
    image.src = imageSrc;

    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = pixelCrop.width;
      canvas.height = pixelCrop.height;

      const ctx = canvas.getContext("2d");

      if (!ctx) {
        reject(new Error("Could not get canvas context"));
        return;
      }

      ctx.drawImage(
        image,
        pixelCrop.x,
        pixelCrop.y,
        pixelCrop.width,
        pixelCrop.height,
        0,
        0,
        pixelCrop.width,
        pixelCrop.height
      );

      // Convert canvas to blob
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error("Canvas is empty"));
            return;
          }
          resolve(blob);
        },
        "image/png", // output format
        1 // quality
      );
    };

    image.onerror = (err) => {
      reject(err);
    };
  });
}
