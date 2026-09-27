'use client';

import { useState, useRef } from 'react';
import { 
  updateFirebaseLogoStatus, 
  removeLogoBackgroundFirebase, 
  uploadAndReplaceLogoFirebase,
  updateFirebaseLogoUrl,
  uploadAndReplaceLogoFromUrlFirebase 
} from '@/actions/firebaseNavbarActions';
import { useRouter } from 'next/navigation'; 

export default function JsonReviewButtons({ docId, currentStatus, currentUrl, onToggleBlack }: any) {
  const router = useRouter(); 
  const [loading, setLoading] = useState(false);
  const [isBlackBg, setIsBlackBg] = useState(false);
  const [originalUrlBackup, setOriginalUrlBackup] = useState<string | null>(null); 
  const [isDragging, setIsDragging] = useState(false); 
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 🔥 NEW: Lightning-Fast Browser Image Optimizer
  // Shrinks massive images down to <100kb before sending to the server
  const optimizeImage = async (file: File): Promise<File> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_SIZE = 800; // Max width or height
          let width = img.width;
          let height = img.height;

          // Maintain aspect ratio while shrinking
          if (width > height && width > MAX_SIZE) {
            height *= MAX_SIZE / width;
            width = MAX_SIZE;
          } else if (height > MAX_SIZE) {
            width *= MAX_SIZE / height;
            height = MAX_SIZE;
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);

          // Convert to highly compressed WebP format
          canvas.toBlob((blob) => {
            if (blob) {
              resolve(new File([blob], file.name.replace(/\.[^/.]+$/, "") + ".webp", { 
                type: 'image/webp' 
              }));
            } else {
              reject(new Error("Canvas conversion failed"));
            }
          }, 'image/webp', 0.85); // 85% quality
        };
        img.onerror = (err) => reject(err);
      };
      reader.onerror = (err) => reject(err);
    });
  };

  const handleStatusChange = async (newStatus: string) => {
    setLoading(true);
    await updateFirebaseLogoStatus(docId, newStatus);
  };

  const handleBgRemove = async () => {
    setLoading(true);
    setOriginalUrlBackup(currentUrl);
    await removeLogoBackgroundFirebase(docId, currentUrl);
    router.refresh(); 
    setLoading(false);
  };

  const handleUndoBg = async () => {
    if (!originalUrlBackup) return;
    setLoading(true);
    await updateFirebaseLogoUrl(docId, originalUrlBackup);
    setOriginalUrlBackup(null);
    router.refresh(); 
    setLoading(false);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    
    // Compress image before upload!
    const optimizedFile = await optimizeImage(file);
    
    const formData = new FormData();
    formData.append('file', optimizedFile);
    await uploadAndReplaceLogoFirebase(docId, formData);
    
    router.refresh();
    setLoading(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true); 
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false); 
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    setLoading(true);

    try {
      // 1. If dragging a real file from desktop
      const file = e.dataTransfer.files?.[0];
      if (file) {
        const optimizedFile = await optimizeImage(file); // Compress dragged files too!
        const formData = new FormData();
        formData.append('file', optimizedFile);
        await uploadAndReplaceLogoFirebase(docId, formData);
        router.refresh();
        setLoading(false);
        return;
      }

      // 2. If dragging from another tab
      const html = e.dataTransfer.getData('text/html');
      const url = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain');
      let externalImageUrl = '';

      if (html) {
        const match = html.match(/src\s*=\s*"([^"]+)"/);
        if (match) externalImageUrl = match[1];
      }

      if (!externalImageUrl && url && url.match(/^https?:\/\/.+/)) {
        externalImageUrl = url;
      }

      if (externalImageUrl) {
        if (externalImageUrl.startsWith('data:image')) {
           const res = await fetch(externalImageUrl);
           const blob = await res.blob();
           const base64File = new File([blob], "dropped_image.png", { type: blob.type });
           
           const optimizedFile = await optimizeImage(base64File); // Compress base64 drop
           const formData = new FormData();
           formData.append('file', optimizedFile);
           await uploadAndReplaceLogoFirebase(docId, formData);
        } else {
           if (externalImageUrl.startsWith('/')) {
             externalImageUrl = window.location.origin + externalImageUrl;
           }
           await uploadAndReplaceLogoFromUrlFirebase(docId, externalImageUrl);
        }
        router.refresh();
      } else {
        console.warn("Could not extract a valid image from the dropped item.");
      }
    } catch (err) {
      console.error("Drop handling error:", err);
    }
    
    setLoading(false);
  };

  return (
    <div 
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`p-4 flex flex-wrap items-center justify-between gap-4 w-full transition-all duration-200 border-t ${
        isDragging ? 'bg-blue-50 border-blue-500 border-t-4 border-dashed' : 'bg-white/90 border-gray-200'
      }`}
    >
      <div className="flex gap-2">
        <button onClick={() => handleStatusChange('approved')} disabled={loading} className="px-4 py-2 bg-green-600 text-white font-semibold rounded hover:bg-green-700 disabled:opacity-50">
          {loading ? '...' : 'Approve'}
        </button>
        <button onClick={() => handleStatusChange('not_approved')} disabled={loading} className="px-4 py-2 bg-red-600 text-white font-semibold rounded hover:bg-red-700 disabled:opacity-50">
          {loading ? '...' : 'Reject'}
        </button>
      </div>

      <div className="flex gap-2 relative z-50">
        {originalUrlBackup ? (
          <button onClick={handleUndoBg} disabled={loading} className="px-4 py-2 bg-yellow-500 text-white font-semibold rounded hover:bg-yellow-600">
            {loading ? 'Undoing...' : 'Undo BG Remove'}
          </button>
        ) : (
          <button onClick={handleBgRemove} disabled={loading} className="px-4 py-2 bg-purple-600 text-white font-semibold rounded hover:bg-purple-700">
            {loading ? 'Removing...' : 'Remove BG (AI)'}
          </button>
        )}

        <button onClick={() => fileInputRef.current?.click()} disabled={loading} className="px-4 py-2 bg-blue-600 text-white font-semibold rounded hover:bg-blue-700 group relative">
          {loading ? 'Processing...' : isDragging ? 'Drop Image Here!' : 'Upload Logo'}
          {!isDragging && (
            <span className="absolute -top-10 left-1/2 -translate-x-1/2 w-max bg-gray-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 pointer-events-none">
              Click or Drag & Drop!
            </span>
          )}
        </button>
        <input type="file" accept="image/*" ref={fileInputRef} onChange={handleFileUpload} className="hidden" />

        <button onClick={() => { setIsBlackBg(!isBlackBg); onToggleBlack(!isBlackBg); }} className="px-4 py-2 bg-gray-800 text-white font-semibold rounded hover:bg-black">
          {isBlackBg ? 'Revert Black' : 'Make Logo Black'}
        </button>
      </div>
      
      {isDragging && <div className="absolute inset-0 bg-blue-500/10 pointer-events-none z-40 rounded-b-lg"></div>}
    </div>
  );
}