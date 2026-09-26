'use client';

import { useState } from 'react';
import JsonReviewButtons from './JsonReviewButtons';
import Navbar from './Navbar';

interface FirebaseLeadItem {
  id: string; // The Firebase Document ID (Email)
  Website: string;
  logoUrl: string;
  logoStatus: string;
  [key: string]: any;
}

interface JsonNavbarReviewCardProps {
  item: FirebaseLeadItem;
}

export default function JsonNavbarReviewCard({ item }: JsonNavbarReviewCardProps) {
  const [isBlack, setIsBlack] = useState(false);

  if (!item.logoUrl) return null;

  return (
    <div className="w-full relative flex flex-col min-h-[200px] border border-gray-300 rounded-lg overflow-hidden">
      <img
        src="/homeimage.avif"
        className="w-full h-full object-cover absolute top-0 left-0 z-0 inset-0"
        alt="Home Background Mock"
      />

      <div className="relative z-10 w-full flex flex-col justify-between h-full bg-black/10 backdrop-blur-sm">
        <div className={isBlack ? 'brightness-0' : ''}>
          <Navbar logoUrl={item.logoUrl} url={item.Website} />
        </div>
        
        {/* Pass item.id (Firebase Doc ID) instead of row_number */}
        <JsonReviewButtons
          docId={item.id} 
          currentStatus={item.logoStatus}
          currentUrl={item.logoUrl}
          onToggleBlack={(blackState) => setIsBlack(blackState)}
        />
      </div>
    </div>
  );
}