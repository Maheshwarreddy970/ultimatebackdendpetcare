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
  websiteOneData?: any; // Added to catch nested JSON
  websiteTwoData?: any; // Added to catch nested JSON
  [key: string]: any;
}

export default function JsonNavbarReviewCard({ item }: { item: FirebaseLeadItem }) {
  const [isBlack, setIsBlack] = useState(false);
  const [isVisible, setIsVisible] = useState(true);

  // Dig into the nested JSON to find the logo if the root logoUrl is empty
  const extractedLogo = item.logoUrl 
    || item?.websiteOneData?.navbar?.logo?.src 
    || item?.websiteOneData?.logo?.src
    || item?.websiteTwoData?.navbar?.logo?.src
    || item?.websiteTwoData?.logo?.src
    || "";

  const [localLogoUrl, setLocalLogoUrl] = useState(extractedLogo);

  if (!item || !isVisible) return null;

  const displayLogo = localLogoUrl.trim() !== "" 
    ? localLogoUrl 
    : "https://upload.wikimedia.org/wikipedia/commons/3/3f/Placeholder_view_vector.svg"; 

  const fbLink = item.Facebook || item.facebookurl || item.aifacebook || item["extracted facebook"] || "";
  const igLink = item.Instagram || "";
  
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
        
        {/* Pass the nested structure down so your buttons can update Firebase */}
        <JsonReviewButtons
          docId={item.id} 
          businessName={businessName} 
          currentStatus={item.logoStatus}
          currentUrl={localLogoUrl} 
          onToggleBlack={setIsBlack}
          onProcessComplete={() => setIsVisible(false)} // Hides card on manual approval
          onUpdateLogo={(newUrl: string) => setLocalLogoUrl(newUrl)} 
        />
      </div>
    </div>
  );
}