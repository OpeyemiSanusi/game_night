"use client";

export async function resizeAvatar(file: File) {
  const imageUrl = URL.createObjectURL(file);

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Could not read that image."));
      img.src = imageUrl;
    });

    const size = Math.min(image.naturalWidth, image.naturalHeight);
    const sourceX = Math.max(0, (image.naturalWidth - size) / 2);
    const sourceY = Math.max(0, (image.naturalHeight - size) / 2);
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;
    const context = canvas.getContext("2d");

    if (!context) {
      throw new Error("Canvas is not available in this browser.");
    }

    context.drawImage(image, sourceX, sourceY, size, size, 0, 0, 512, 512);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/webp", 0.82);
    });

    if (!blob) {
      throw new Error("Could not compress that image.");
    }

    return new File([blob], "avatar.webp", { type: "image/webp" });
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
}
