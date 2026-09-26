'use client';

import { useState, useRef } from 'react';
import { 
  updateFirebaseLogoStatus, 
  removeLogoBackgroundFirebase, 
  uploadAndReplaceLogoFirebase 
} from '@/actions/firebaseNavbarActions';

interface JsonReviewButtonsProps {
  docId: string;
  currentStatus: string;
  currentUrl: string;
  onToggleBlack: (isBlack: boolean) => void;
}

export default function JsonReviewButtons({ docId, currentStatus, currentUrl, onToggleBlack }: JsonReviewButtonsProps) {
  const [loading, setLoading] = useState(false);
  const [isBlackBg, setIsBlackBg] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleStatusChange = async (newStatus: string) => {
    setLoading(true);
    await updateFirebaseLogoStatus(docId, newStatus);
    setLoading(false);
  };

  const handleRemoveBg = async () => {
    setLoading(true);
    await removeLogoBackgroundFirebase(docId, currentUrl);
    setLoading(false);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    const formData = new FormData();
    formData.append('file', file);
    
    await uploadAndReplaceLogoFirebase(docId, formData);
    setLoading(false);
  };

  const toggleBlack = () => {
    const newState = !isBlackBg;
    setIsBlackBg(newState);
    onToggleBlack(newState);
  };

  return (
    <div className="bg-white/90 border-t border-gray-200 p-4 flex flex-wrap items-center justify-between gap-4 w-full">
      
      <div className="flex gap-2">
        <button
          onClick={() => handleStatusChange('approved')}
          disabled={loading}
          className="px-4 py-2 bg-green-600 text-white text-sm font-semibold rounded hover:bg-green-700 disabled:opacity-50"
        >
          {loading ? '...' : 'Approve'}
        </button>
        <button
          onClick={() => handleStatusChange('not_approved')}
          disabled={loading}
          className="px-4 py-2 bg-red-600 text-white text-sm font-semibold rounded hover:bg-red-700 disabled:opacity-50"
        >
          {loading ? '...' : 'Reject'}
        </button>
      </div>

      <div className="flex gap-2">
        <button
          onClick={handleRemoveBg}
          disabled={loading}
          className="px-4 py-2 bg-purple-600 text-white text-sm font-semibold rounded hover:bg-purple-700 disabled:opacity-50"
        >
          {loading ? 'Removing...' : 'Remove BG (AI)'}
        </button>

        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={loading}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? 'Uploading...' : 'Upload Logo'}
        </button>
        <input
          type="file"
          accept="image/*"
          ref={fileInputRef}
          onChange={handleFileUpload}
          className="hidden"
        />

        <button
          onClick={toggleBlack}
          className="px-4 py-2 bg-gray-800 text-white text-sm font-semibold rounded hover:bg-black"
        >
          {isBlackBg ? 'Revert Black' : 'Make Logo Black'}
        </button>
      </div>
    </div>
  );
}