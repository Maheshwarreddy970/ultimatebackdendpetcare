'use client';

import { useState } from 'react';
import Navbar from '@/components/Navbar';
import JsonReviewButtons from '@/components/JsonReviewButtons';

interface FirebaseLeadItem {
  id: string; 
  Website: string;
  logoUrl?: string; 
  logoStatus: string;
  Facebook?: string;
  facebookurl?: string;
  aifacebook?: string;
  "extracted facebook"?: string;
  Instagram?: string;
  [key: string]: any;
}

export default function JsonNavbarReviewCard({ item }: { item: FirebaseLeadItem }) {
  const [isBlack, setIsBlack] = useState(false);

  if (!item) return null;

  const displayLogo = item.logoUrl && item.logoUrl.trim() !== "" 
    ? item.logoUrl 
    : "https://upload.wikimedia.org/wikipedia/commons/3/3f/Placeholder_view_vector.svg"; 

  // Intelligently find the best Facebook and Instagram links from your database fields
  const fbLink = item.Facebook || item.facebookurl || item.aifacebook || item["extracted facebook"] || "";
  const igLink = item.Instagram || "";

  return (
    <div className="w-full relative flex flex-col min-h-[200px] border border-gray-300 rounded-lg overflow-hidden shadow-sm">
      <img
        src="/homeimage.avif"
        className="w-full h-full object-cover absolute top-0 left-0 z-0 inset-0"
        alt="Home Background Mock"
      />

      <div className="relative z-10 w-full flex flex-col justify-between h-full bg-black/10 backdrop-blur-sm">
        <div className={isBlack ? 'brightness-0' : ''}>
          {/* Feed the social links to the Navbar */}
          <Navbar logoUrl={displayLogo} url={item.Website || ""} fbLink={fbLink} igLink={igLink} />
        </div>
        
        <JsonReviewButtons
          docId={item.id} 
          currentStatus={item.logoStatus}
          currentUrl={item.logoUrl || ""} 
          onToggleBlack={setIsBlack}
        />
      </div>
    </div>
  );
}