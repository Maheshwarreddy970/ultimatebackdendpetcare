'use client';

import { useState, useRef } from 'react';
import { updateFirebaseLogoStatus } from '@/actions/firebaseNavbarActions';
import { uploadCustomLogo, manualRemoveBackground } from '@/actions/autoExtractActions';

export default function JsonReviewButtons({ 
  docId, 
  currentUrl, 
  onToggleBlack,
  onProcessComplete,
  onUpdateLogo 
}: any) {
  const [loading, setLoading] = useState(false);
  const [isBlackBg, setIsBlackBg] = useState(false);
  const [isDragging, setIsDragging] = useState(false); 
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleStatusChange = async (newStatus: string) => {
    setLoading(true);
    onProcessComplete(); 
    await updateFirebaseLogoStatus(docId, newStatus);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await uploadCustomLogo(docId, formData);
      if (res) {
        if (res.success) {
          if (res.url) onUpdateLogo(res.url);
        }
      }
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  const handleRemoveBg = async () => {
    setLoading(true);
    try {
      const res = await manualRemoveBackground(docId, currentUrl);
      if (res) {
        if (res.success) {
          if (res.url) onUpdateLogo(res.url);
        }
      }
    } catch (err) {
      console.error(err);
    }
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
        const formData = new FormData();
        formData.append('file', file);
        const res = await uploadCustomLogo(docId, formData);
        if (res) {
          if (res.success) {
            if (res.url) onUpdateLogo(res.url);
          }
        }
        setLoading(false);
        return;
      }

      let url = e.dataTransfer.getData('text/uri-list');
      if (!url) {
        url = e.dataTransfer.getData('text/plain');
      }

      if (url) {
        if (url.startsWith('http')) {
          const fetchRes = await fetch(url);
          const buffer = await fetchRes.arrayBuffer();
          // Convert fetched URL to a File object before putting it in FormData
          const fetchedFile = new File([buffer], "dropped_image.png", { type: "image/png" });
          const formData = new FormData();
          formData.append('file', fetchedFile);
          
          const res = await uploadCustomLogo(docId, formData);
          if (res) {
            if (res.success) {
              if (res.url) onUpdateLogo(res.url);
            }
          }
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
        <button onClick={handleRemoveBg} disabled={loading} className="px-3 py-2 bg-purple-600 text-white text-sm font-semibold rounded hover:bg-purple-700 shadow-sm">
          {loading ? 'Processing...' : 'Remove BG / Process'}
        </button>

        <button onClick={() => fileInputRef.current?.click()} disabled={loading} className="px-3 py-2 bg-blue-600 text-white text-sm font-semibold rounded hover:bg-blue-700 group relative shadow-sm">
          {loading ? 'Wait...' : isDragging ? 'Drop Image Here!' : 'Upload / Drop Image'}
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