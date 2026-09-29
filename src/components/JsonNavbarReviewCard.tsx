'use client';

import { useState } from 'react';
import Navbar from '@/components/Navbar';
import JsonReviewButtons from '@/components/JsonReviewButtons';

interface FirebaseLeadItem {
  id: string; 
  Name?: string;
  Website: string;
  logoUrl?: string; 
  logoStatus: string;
  Facebook?: string;
  facebookurl?: string;
  aifacebook?: string;
  "extracted facebook"?: string;
  facebookname?: string;
  Instagram?: string;
  [key: string]: any;
}

export default function JsonNavbarReviewCard({ item }: { item: FirebaseLeadItem }) {
  const [isBlack, setIsBlack] = useState(false);
  const [isVisible, setIsVisible] = useState(true);
  
  const [localLogoUrl, setLocalLogoUrl] = useState(item.logoUrl || "");

  if (!item || !isVisible) return null;

  const displayLogo = localLogoUrl.trim() !== "" 
    ? localLogoUrl 
    : "https://upload.wikimedia.org/wikipedia/commons/3/3f/Placeholder_view_vector.svg"; 

  const fbLink = item.Facebook || item.facebookurl || item.aifacebook || item["extracted facebook"] || "";
  const igLink = item.Instagram || "";
  
  // Extract the best available business name for the "Use Text" generator
  const businessName = item.Name || item.facebookname || "Pet Grooming";

  return (
    <div className="w-full relative flex flex-col min-h-[200px] border border-gray-300 rounded-lg overflow-hidden shadow-sm transition-all duration-300 ease-in-out">
      <img
        src="/homeimage.avif"
        className="w-full h-full object-cover absolute top-0 left-0 z-0 inset-0"
        alt="Home Background Mock"
      />

      <div className="relative z-10 w-full flex flex-col justify-between h-full bg-black/10 backdrop-blur-sm">
        <div className={isBlack ? 'brightness-0' : ''}>
          <Navbar logoUrl={displayLogo} url={item.Website || ""} fbLink={fbLink} igLink={igLink} />
        </div>
        
        <JsonReviewButtons
          docId={item.id} 
          businessName={businessName} // <-- PASSED TO BUTTONS
          currentStatus={item.logoStatus}
          currentUrl={localLogoUrl} 
          onToggleBlack={setIsBlack}
          onProcessComplete={() => setIsVisible(false)} 
          onUpdateLogo={(newUrl: string) => setLocalLogoUrl(newUrl)} 
        />
      </div>
    </div>
  );
}