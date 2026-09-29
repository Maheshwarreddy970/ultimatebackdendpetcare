'use client';

import { useState, useRef } from 'react';
import { 
  updateFirebaseLogoStatus, 
  removeLogoBackgroundFirebase, 
  uploadAndReplaceLogoFirebase,
  updateFirebaseLogoUrl,
  uploadAndReplaceLogoFromUrlFirebase 
} from '@/actions/firebaseNavbarActions';

export default function JsonReviewButtons({ 
  docId, 
  businessName, 
  currentStatus, 
  currentUrl, 
  onToggleBlack,
  onProcessComplete,
  onUpdateLogo 
}: any) {
  const [loading, setLoading] = useState(false);
  const [isBlackBg, setIsBlackBg] = useState(false);
  const [originalUrlBackup, setOriginalUrlBackup] = useState<string | null>(null); 
  const [isDragging, setIsDragging] = useState(false); 
  const fileInputRef = useRef<HTMLInputElement>(null);

  const optimizeImage = async (file: File): Promise<File> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_SIZE = 800; 
          let width = img.width;
          let height = img.height;
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
          canvas.toBlob((blob) => {
            if (blob) resolve(new File([blob], file.name.replace(/\.[^/.]+$/, "") + ".webp", { type: 'image/webp' }));
          }, 'image/webp', 0.85); 
        };
      };
    });
  };

  const handleStatusChange = async (newStatus: string) => {
    setLoading(true);
    onProcessComplete(); 
    await updateFirebaseLogoStatus(docId, newStatus);
  };

  const handleBgRemove = async () => {
    setLoading(true);
    setOriginalUrlBackup(currentUrl); 
    const res = await removeLogoBackgroundFirebase(docId, currentUrl);
    if (res?.success && res.newUrl) onUpdateLogo(res.newUrl);
    setLoading(false);
  };

  const handleUseText = async () => {
    setLoading(true);
    setOriginalUrlBackup(currentUrl);

    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 600; 
    const ctx = canvas.getContext('2d');

    if (ctx) {
      ctx.clearRect(0, 0, 800, 600);

      const rawSvg = `
        <svg xmlns="http://www.w3.org/2000/svg" version="1.1" width="800" height="600">
          <g transform="translate(130, 80) scale(1.8)">
             <path d="M0 0 C1.23 0.01 2.45 0.02 3.72 0.03 C23.1 0.36 42.11 4.05 56.19 18.38 C69.05 33.07 72.74 50.71 72.58 69.72 C72.56 72.03 72.58 74.35 72.6 76.66 C72.6 78.14 72.59 79.62 72.59 81.1 C72.59 81.79 72.6 82.48 72.6 83.18 C72.56 86.05 72.48 87.95 70.82 90.34 C69.19 91.38 69.19 91.38 66.62 91.19 C64.19 90.38 64.19 90.38 62.19 88.38 C61.96 86.4 61.96 86.4 61.99 84.02 C62 82.75 62 82.75 62.01 81.45 C62.04 80.11 62.04 80.11 62.06 78.75 C62.07 77.85 62.08 76.96 62.09 76.03 C62.11 73.81 62.15 71.59 62.19 69.38 C61.2 69.7 60.21 70.03 59.19 70.38 C57.63 70.44 56.06 70.46 54.5 70.44 C53.69 70.43 52.88 70.42 52.05 70.41 C51.44 70.4 50.82 70.39 50.19 70.38 C50.27 71.72 50.27 71.72 50.36 73.09 C50.67 81.24 50.42 87.81 45.19 94.38 C38.62 100.07 32.06 102.77 23.38 102.75 C22.31 102.75 22.31 102.75 21.22 102.75 C13 102.55 8.25 99.68 2.19 94.38 C1.34 95.14 0.5 95.9 -0.38 96.69 C-8.27 103.09 -15.82 103.32 -25.81 102.38 C-29.2 101.52 -31.89 100.27 -34.81 98.38 C-35.46 97.96 -36.1 97.55 -36.77 97.12 C-41.96 93.28 -44.32 88.59 -45.81 82.38 C-47.03 73.33 -45.01 64.84 -41.81 56.38 C-40.82 55.39 -40.82 55.39 -39.81 54.38 C-34.24 54.94 -34.24 54.94 -32.81 56.38 C-32.88 58.02 -33.01 59.67 -33.19 61.31 C-33.28 62.21 -33.37 63.1 -33.46 64.03 C-33.81 66.37 -33.81 66.37 -34.81 68.38 C-35.02 71 -35.14 73.56 -35.19 76.19 C-35.22 76.9 -35.26 77.61 -35.3 78.35 C-35.37 82.35 -35.02 84.11 -32.48 87.26 C-27.8 90.97 -25.47 91.67 -19.5 91.69 C-17.56 91.71 -17.56 91.71 -15.57 91.74 C-11.6 91.35 -9.19 90.47 -5.81 88.38 C-3.43 84.4 -3.27 79.91 -2.81 75.38 C-4.46 74.72 -6.11 74.06 -7.81 73.38 C-8.12 70.56 -8.12 70.56 -7.81 67.38 C-4.93 64.59 -2.18 64.14 1.69 63.94 C4.98 64.06 6.26 64.41 9.25 66.06 C11.19 68.38 11.19 68.38 11.69 71 C11.19 73.38 11.19 73.38 8.19 75.38 C7.62 80.22 7.67 82.42 10 86.75 C12.1 89.52 12.1 89.52 15.19 91.38 C18.64 91.73 18.64 91.73 22.5 91.69 C24.44 91.71 24.44 91.71 26.43 91.74 C31.64 91.23 34.9 89.73 38.5 85.94 C40.9 80.87 41.01 75.93 41.19 70.38 C40.18 70.28 39.17 70.18 38.13 70.08 C34.06 69.49 30.79 67.99 27.12 66.12 C25.96 65.54 24.79 64.96 23.59 64.36 C12.17 57.7 5.25 47.04 1.65 34.51 C1.16 32.27 1.06 30.26 1.05 27.97 C1.05 27.14 1.05 26.32 1.05 25.46 C1.05 24.61 1.06 23.76 1.06 22.88 C1.06 22.02 1.05 21.17 1.05 20.29 C1.05 19.05 1.05 19.05 1.05 17.78 C1.06 17.03 1.06 16.28 1.06 15.51 C1.19 13.35 1.6 11.45 2.19 9.38 C-24.61 11.94 -24.61 11.94 -45.81 27.66 C-54.65 39.39 -56.43 50.67 -57.09 65 C-57.74 77.8 -61.18 86.15 -70.44 95.06 C-83.33 105.84 -101.83 107.59 -117.91 107.67 C-119.41 107.68 -120.91 107.7 -122.41 107.73 C-138.9 108.06 -156.72 105.71 -169.62 94.38 C-178.14 85.02 -180.98 73.58 -181.12 61.31 C-181.15 60.54 -181.18 59.77 -181.21 58.98 C-181.27 53.97 -180.46 49.97 -178.83 45.23 C-176.35 37.71 -176.22 30.56 -176.19 22.69 C-176.17 20.02 -176.13 17.35 -176.09 14.68 C-176.08 13.51 -176.07 12.35 -176.07 11.15 C-175.81 8.38 -175.81 8.38 -173.81 6.38 C-168.19 5.39 -163.88 8.88 -159.25 11.62 C-155.75 13.8 -155.75 13.8 -151.79 14.05 C-148.88 13.06 -146 11.96 -143.12 10.88 C-137.61 8.88 -132.68 7.51 -126.81 7.38 C-125.5 7.31 -124.18 7.25 -122.82 7.19 C-111.08 6.79 -99.93 7.97 -89.17 13.07 C-85.57 14.47 -84.36 14.68 -80.81 13.38 C-77.98 11.87 -75.27 10.22 -72.53 8.55 C-69.37 7.18 -68.02 7.24 -64.81 8.38 C-62.81 10.37 -62.81 10.37 -62.65 12.66 C-64.54 17.08 -68.33 18.55 -72.44 20.75 C-73.23 21.21 -74.03 21.68 -74.85 22.15 C-79.89 24.93 -83.05 26.04 -88.81 24.38 C-90.65 23.62 -92.47 22.81 -94.25 21.94 C-101.58 18.72 -108.92 18.05 -116.81 17.38 C-116.76 18.36 -116.76 18.36 -116.71 19.36 C-116.26 34.44 -121.26 47.37 -131.62 58.38 C-140.69 66.65 -153.37 71.59 -165.62 71.44 C-167.09 71.42 -167.09 71.42 -168.58 71.41 C-169.32 71.4 -170.05 71.39 -170.81 71.38 C-167.61 80.74 -164.25 86.75 -155.44 91.62 C-135.75 100.61 -109.12 100.32 -88.81 93.38 C-80.43 90.18 -74.25 86.41 -69.76 78.54 C-68.74 76.21 -68.55 74.63 -68.5 72.1 C-68.48 71.28 -68.46 70.47 -68.43 69.62 C-68.41 68.76 -68.4 67.89 -68.38 67 C-67.66 48.11 -63.19 30.63 -49.34 16.93 C-34.87 4.35 -18.91 -0.23 0 0 Z" fill="#111827" transform="translate(199,25)"/>
             <path d="M0 0 C0 0.33 0 0.66 0 1 C-1.65 1 -3.3 1 -5 1 C-4.95 1.98 -4.95 1.98 -4.89 2.98 C-4.45 18.06 -9.45 30.99 -19.81 42 C-28.87 50.27 -41.56 55.21 -53.81 55.06 C-54.79 55.05 -55.76 55.04 -56.77 55.04 C-57.87 55.02 -57.87 55.02 -59 55 C-62.01 45.96 -59.82 35.84 -57 27 C-56.67 26.34 -56.34 25.68 -56 25 C-55.85 23.33 -55.75 21.66 -55.68 19.99 C-55.64 19.01 -55.6 18.02 -55.56 17 C-55.52 15.97 -55.48 14.94 -55.44 13.88 C-55.37 12.31 -55.37 12.31 -55.31 10.72 C-55.2 8.15 -55.1 5.57 -55 3 C-51.88 3.98 -49.25 4.84 -46.5 6.62 C-43.37 8.35 -41.55 8.26 -38 8 C-35.25 7.02 -35.25 7.02 -32.62 5.62 C-22.1 0.62 -11.61 -0.1 0 0 Z" fill="#111827" transform="translate(85,32)"/>
             <path d="M0 0 C5.57 0.57 5.57 0.57 7 2 C6.94 3.65 6.8 5.3 6.62 6.94 C6.53 7.83 6.44 8.73 6.35 9.65 C6 12 6 12 5 14 C4.8 16.62 4.68 19.19 4.62 21.81 C4.59 22.52 4.55 23.24 4.51 23.97 C4.45 27.97 4.79 29.74 7.34 32.89 C12.02 36.6 14.34 37.29 20.31 37.31 C21.61 37.33 22.9 37.35 24.24 37.36 C28.22 36.98 30.63 36.1 34 34 C36.38 30.03 36.54 25.53 37 21 C34.53 20.01 34.53 20.01 32 19 C31.69 16.19 31.69 16.19 32 13 C34.88 10.21 37.63 9.76 41.5 9.56 C44.8 9.68 46.07 10.04 49.06 11.69 C51 14 51 14 51.5 16.62 C51 19 51 19 48 21 C47.43 25.85 47.49 28.04 49.81 32.38 C51.91 35.15 51.91 35.15 55 37 C58.46 37.36 58.46 37.36 62.31 37.31 C63.61 37.33 64.9 37.35 66.24 37.36 C71.47 36.86 74.72 35.31 78.38 31.56 C81.4 24.92 80.89 17.86 78.44 11.06 C78.17 10.35 77.9 9.64 77.62 8.91 C76.74 6.21 76.76 4.56 78 2 C80.56 0.69 80.56 0.69 83 0 C87.48 3.55 88.99 7.53 90 13 C90.92 21.59 91.25 30.35 86.69 37.98 C81.83 43.78 74.8 47.66 67.29 48.34 C65.92 48.37 64.56 48.38 63.19 48.38 C62.48 48.37 61.76 48.37 61.03 48.37 C52.81 48.18 48.07 45.31 42 40 C41.15 40.76 40.31 41.53 39.44 42.31 C31.54 48.72 23.99 48.95 14 48 C10.61 47.14 7.93 45.9 5 44 C4.03 43.38 4.03 43.38 3.04 42.75 C-2.15 38.91 -4.51 34.22 -6 28 C-7.21 18.96 -5.19 10.46 -2 2 C-1.34 1.34 -0.68 0.68 0 0 Z" fill="#111827" transform="translate(157,70)"/>
             <path d="M0 0 C0 0.33 0 0.66 0 1 C-2.31 1.66 -4.62 2.32 -7 3 C-7.75 6.66 -8.24 9.42 -7 13 C-1.78 13.44 -1.78 13.44 3 11.88 C4.45 9.16 4.25 7.03 4 4 C3.67 3.01 3.34 2.02 3 1 C3.99 1 4.98 1 6 1 C7.53 5.08 6.63 8.79 6 13 C6.99 13.33 7.98 13.66 9 14 C9.33 14.33 9.66 14.66 10 15 C10.99 15 11.98 15 13 15 C12.69 15.96 12.69 15.96 12.38 16.94 C11.85 21.21 12.91 24.87 14 29 C9.11 28.43 5.38 26.96 1 24.75 C-0.18 24.17 -1.35 23.58 -2.56 22.98 C-7.31 20.24 -12.02 17.36 -14 12 C-12.68 11.34 -11.36 10.68 -10 10 C-10.33 7.03 -10.66 4.06 -11 1 C-7.27 0.12 -3.83 -0.09 0 0 Z" fill="#111827" transform="translate(223,57)"/>
             <path d="M0 0 C2.68 4.02 2.16 6.24 2 11 C5.83 11.09 9.27 10.88 13 10 C10.08 14.91 6.72 18.72 2 22 C1.34 22 0.68 22 0 22 C-0.33 19.69 -0.66 17.38 -1 15 C-1.99 15.5 -1.99 15.5 -3 16 C-6.17 16.28 -8.38 16.27 -11.31 15 C-13.81 12.04 -14.22 8.83 -14 5 C-13.39 2.79 -13.39 2.79 -12 1 C-9.18 0.39 -9.18 0.39 -5.88 0.25 C-4.78 0.19 -3.68 0.14 -2.55 0.08 C-1.29 0.04 -1.29 0.04 0 0 Z" fill="#111827" transform="translate(57,57)"/>
          </g>
        </svg>
      `;

      const DOMURL = window.URL || window.webkitURL || window;
      const img = new Image();
      const svgBlob = new Blob([rawSvg], { type: 'image/svg+xml;charset=utf-8' });
      const url = DOMURL.createObjectURL(svgBlob);

      img.onload = () => {
        ctx.drawImage(img, 150, 50, 500, 230);

        ctx.fillStyle = '#111827';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        const words = businessName.split(' ');
        let line1 = businessName;
        let line2 = "";
        
        if (words.length > 2) {
          line1 = words.slice(0, 2).join(' ');
          line2 = words.slice(2).join(' ');
        }

        ctx.font = 'bold 100px "Georgia", "Times New Roman", serif'; 
        ctx.fillText(line1.toUpperCase(), 400, 390);

        if (line2) {
          ctx.font = 'bold 75px "Georgia", "Times New Roman", serif';
          ctx.fillText(line2.toUpperCase(), 400, 495);
        }

        canvas.toBlob(async (blob) => {
          if (blob) {
            const file = new File([blob], `text_logo_${docId}.png`, { type: 'image/png' });
            const optimizedFile = await optimizeImage(file);
            const formData = new FormData();
            formData.append('file', optimizedFile);
            
            const res = await uploadAndReplaceLogoFirebase(docId, formData);
            if (res?.success && res.newUrl) onUpdateLogo(res.newUrl);
          }
          setLoading(false);
          DOMURL.revokeObjectURL(url);
        }, 'image/png');
      };
      img.src = url;
    }
  };

  const handleMakeRound = async () => {
    if (!currentUrl.includes('cloudinary.com')) return alert("Can only make Cloudinary images round.");
    setLoading(true);
    setOriginalUrlBackup(currentUrl);

    const parts = currentUrl.split('/upload/');
    let pathPart = parts[1];
    if (!pathPart.match(/^v\d+\//)) {
      const versionIndex = pathPart.indexOf('v');
      if (versionIndex > 0) pathPart = pathPart.substring(versionIndex);
    }
    const roundUrl = `${parts[0]}/upload/w_600,h_600,c_fill,g_auto,r_max,f_png/${pathPart}`;
    await updateFirebaseLogoUrl(docId, roundUrl);
    onUpdateLogo(roundUrl);
    setLoading(false);
  };

  const handleUndoBg = async () => {
    if (!originalUrlBackup) return;
    setLoading(true);
    await updateFirebaseLogoUrl(docId, originalUrlBackup);
    onUpdateLogo(originalUrlBackup); 
    setOriginalUrlBackup(null);
    setLoading(false);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    const optimizedFile = await optimizeImage(file);
    const formData = new FormData();
    formData.append('file', optimizedFile);
    const res = await uploadAndReplaceLogoFirebase(docId, formData);
    if (res?.success && res.newUrl) onUpdateLogo(res.newUrl);
    setLoading(false);
  };

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); };
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    setLoading(true);
    try {
      const file = e.dataTransfer.files?.[0];
      if (file) {
        const optimizedFile = await optimizeImage(file); 
        const formData = new FormData();
        formData.append('file', optimizedFile);
        const res = await uploadAndReplaceLogoFirebase(docId, formData);
        if (res?.success && res.newUrl) onUpdateLogo(res.newUrl);
        setLoading(false);
        return;
      }

      const html = e.dataTransfer.getData('text/html');
      const url = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain');
      let externalImageUrl = '';
      if (html) {
        const match = html.match(/src\s*=\s*"([^"]+)"/);
        if (match) externalImageUrl = match[1];
      }
      if (!externalImageUrl && url && url.match(/^https?:\/\/.+/)) externalImageUrl = url;

      if (externalImageUrl) {
        if (externalImageUrl.startsWith('data:image')) {
           const resFetch = await fetch(externalImageUrl);
           const blob = await resFetch.blob();
           const base64File = new File([blob], "dropped_image.png", { type: blob.type });
           const optimizedFile = await optimizeImage(base64File); 
           const formData = new FormData();
           formData.append('file', optimizedFile);
           const res = await uploadAndReplaceLogoFirebase(docId, formData);
           if (res?.success && res.newUrl) onUpdateLogo(res.newUrl);
        } else {
           if (externalImageUrl.startsWith('/')) externalImageUrl = window.location.origin + externalImageUrl;
           const res = await uploadAndReplaceLogoFromUrlFirebase(docId, externalImageUrl);
           if (res?.success && res.newUrl) onUpdateLogo(res.newUrl);
        }
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
        <button onClick={() => handleStatusChange('approved')} disabled={loading} className="px-4 py-2 bg-green-600 text-white font-semibold rounded hover:bg-green-700 disabled:opacity-50 shadow-sm">
          {loading ? '...' : 'Approve'}
        </button>
        <button onClick={() => handleStatusChange('not_approved')} disabled={loading} className="px-4 py-2 bg-red-600 text-white font-semibold rounded hover:bg-red-700 disabled:opacity-50 shadow-sm">
          {loading ? '...' : 'Reject'}
        </button>
      </div>

      <div className="flex flex-wrap gap-2 relative z-50">
        {originalUrlBackup ? (
          <button onClick={handleUndoBg} disabled={loading} className="px-3 py-2 bg-yellow-500 text-white text-sm font-semibold rounded hover:bg-yellow-600 shadow-sm">
            {loading ? 'Undoing...' : 'Undo Edit'}
          </button>
        ) : (
          <>
            <button onClick={handleBgRemove} disabled={loading} className="px-3 py-2 bg-purple-600 text-white text-sm font-semibold rounded hover:bg-purple-700 shadow-sm">
              Remove BG / Auto-Text
            </button>
            <button onClick={handleUseText} disabled={loading} className="px-3 py-2 bg-indigo-600 text-white text-sm font-semibold rounded hover:bg-indigo-700 shadow-sm">
              Use Text
            </button>
            <button onClick={handleMakeRound} disabled={loading} className="px-3 py-2 bg-pink-600 text-white text-sm font-semibold rounded hover:bg-pink-700 shadow-sm">
              Make Round
            </button>
          </>
        )}

        <button onClick={() => fileInputRef.current?.click()} disabled={loading} className="px-3 py-2 bg-blue-600 text-white text-sm font-semibold rounded hover:bg-blue-700 group relative shadow-sm">
          {loading ? 'Wait...' : isDragging ? 'Drop Image Here!' : 'Upload Logo'}
        </button>
        <input type="file" accept="image/*" ref={fileInputRef} onChange={handleFileUpload} className="hidden" />

        <button onClick={() => { setIsBlackBg(!isBlackBg); onToggleBlack(!isBlackBg); }} className="px-3 py-2 bg-gray-800 text-white text-sm font-semibold rounded hover:bg-black shadow-sm">
          {isBlackBg ? 'Revert Black' : 'Make Black'}
        </button>
      </div>
      
      {isDragging && <div className="absolute inset-0 bg-blue-500/10 pointer-events-none z-40 rounded-b-lg"></div>}
    </div>
  );
}