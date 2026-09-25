import { NextResponse } from 'next/server';
import { v2 as cloudinary } from 'cloudinary';
import { ApifyClient } from 'apify-client';

// ---------------------------------------------------------
// CLOUDINARY CONFIG
// ---------------------------------------------------------
cloudinary.config({
  cloud_name: 'dduwiqu4j',
  api_key: '735486643625886',
  api_secret: 'EQVhBgJCEv3t_EgfKHcKSjEJTqA',
});

// ---------------------------------------------------------
// APIFY TOKEN ROTATION
// ---------------------------------------------------------
const APIFY_TOKENS = [
  'apify_api_zP6UkcgE9nEdRfvtxgfH9C9S9VG50G26Ch4U',
  'apify_api_NkPekUe1mhtcpLovU8fKmQPxFDj5oM4q00FG',
  'apify_api_Z3q3Jydg3u2k1TM4ELrWYcIUIa4hJC12BcNW',
  'apify_api_SoNIAG1xuFYPPzs3eZEenIedgryI7a3xcivO'
];

let currentApifyIndex = 0;

// ---------------------------------------------------------
// 1. BUILT-IN FACEBOOK URL CLEANER
// ---------------------------------------------------------
function cleanFacebookUrl(rawUrl: string): string {
  if (!rawUrl || typeof rawUrl !== "string" || rawUrl.trim() === "") {
    return "";
  }

  let currentUrl = rawUrl.trim();

  if (!currentUrl.startsWith("http")) {
    currentUrl = "https://" + currentUrl;
  }

  try {
    const urlObj = new URL(currentUrl);

    if (urlObj.hostname.includes("facebook.com")) {
      urlObj.hostname = "www.facebook.com";
    }

    const segments = urlObj.pathname.split("/").filter(Boolean);

    if (segments.length > 0) {
      if (segments[0] === "profile.php") {
        const profileId = urlObj.searchParams.get("id");
        return profileId ? `https://www.facebook.com/profile.php?id=${profileId}` : `https://www.facebook.com/`;
      } else {
        return `https://www.facebook.com/${segments[0]}`;
      }
    }

    return `https://www.facebook.com/`;
  } catch (error) {
    return rawUrl;
  }
}

// ---------------------------------------------------------
// 2. HIGH-RES FACEBOOK URL CONVERTER
// ---------------------------------------------------------
function upgradeFacebookImageUrl(url: string): string {
  if (!url) return url;
  return url.replace(/\d+x\d+/g, '960x960');
}

// ---------------------------------------------------------
// 3. CLOUDINARY UPLOADER
// ---------------------------------------------------------
async function uploadToCloudinary(buffer: Buffer, publicId: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        public_id: publicId,
        folder: 'facebookurl',
        overwrite: true,
        resource_type: 'auto',
        colors: true
      },
      (error: any, result: any) => {
        if (error) return reject(error);
        if (!result) return reject(new Error("Upload failed"));

        const optimizedUrl = result.secure_url.replace(
          '/upload/',
          '/upload/w_600,h_600,c_fill,g_auto,f_avif,q_100/'
        );

        let primary = null, secondary = null, tertiary = null;
        if (result.colors && result.colors.length > 0) {
          primary = result.colors[0]?.[0] || null;
          secondary = result.colors[1]?.[0] || null;
          tertiary = result.colors[2]?.[0] || null;
        }

        resolve({ 
          url: optimizedUrl, 
          colors: { primary, secondary, tertiary } 
        });
      }
    );
    uploadStream.end(buffer);
  });
}

// ---------------------------------------------------------
// 4. APIFY SCRAPER WITH ROTATION
// ---------------------------------------------------------
async function getProfilePicViaApify(facebookUrl: string): Promise<string> {
  let attempts = 0;

  while (attempts < APIFY_TOKENS.length) {
    const token = APIFY_TOKENS[currentApifyIndex];
    console.log(`Trying Apify Token Index: ${currentApifyIndex}`);

    try {
      const apifyClient = new ApifyClient({ token });
      
      const run = await apifyClient.actor("apify/facebook-pages-scraper").call({
        startUrls: [{ url: facebookUrl }],
        maxPosts: 0
      });
      
      const { items } = await apifyClient.dataset(run.defaultDatasetId).listItems();

      if (!items || items.length === 0 || !items[0]) {
        throw new Error("Apify returned empty items. Page might be private.");
      }

      const data = items[0] as any;

      let profilePicUrl = 
        data.profilePictureUrl || 
        data.profilePicture || 
        data.profilePic || 
        data.profilePicUrl || 
        data.image || 
        data.avatar;

      if (typeof profilePicUrl === 'object' && profilePicUrl !== null) {
        profilePicUrl = profilePicUrl.url || profilePicUrl.src;
      }

      if (!profilePicUrl || typeof profilePicUrl !== 'string') {
        throw new Error("Could not extract a valid string URL for the profile picture.");
      }

      return profilePicUrl;

    } catch (error: any) {
      console.error(`Error with token ${currentApifyIndex}:`, error.message);

      const isRateLimit = 
        error?.message?.includes('429') || 
        error?.http_code === 429 || 
        error?.response?.status === 429 ||
        error?.message?.toLowerCase().includes('unauthorized') ||
        error?.message?.toLowerCase().includes('limit');

      if (isRateLimit) {
        console.warn(`Token ${currentApifyIndex} rate limited. Rotating...`);
        currentApifyIndex = (currentApifyIndex + 1) % APIFY_TOKENS.length;
        attempts++;
        continue;
      }

      throw error;
    }
  }

  throw new Error("All Apify tokens failed or rate limits exceeded.");
}

// ---------------------------------------------------------
// 5. MAIN API ENDPOINT
// ---------------------------------------------------------
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const rawFacebookUrl = body.facebookUrl;
    let rawImageUrl = body.facebookImageUrl; 

    if (!rawFacebookUrl && !rawImageUrl) {
      return NextResponse.json({ success: false, error: "Provide either facebookUrl or facebookImageUrl" }, { status: 400 });
    }

    const facebookUrl = cleanFacebookUrl(rawFacebookUrl);

    if (!rawImageUrl) {
      console.log(`Scraping Cleaned FB Profile: ${facebookUrl}`);
      rawImageUrl = await getProfilePicViaApify(facebookUrl);
    }

    const highResImageUrl = upgradeFacebookImageUrl(rawImageUrl);
    console.log("Upgraded Image URL:", highResImageUrl);

    let imageResponse: Response | null = null;

    // 🔥 FIX: Wrap image fetches in try...catch so network drops don't crash the API
    try {
      imageResponse = await fetch(highResImageUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(15000) // Increased to 15s
      });
      if (!imageResponse.ok) throw new Error("Status not OK");
    } catch (e) {
      console.warn("High-Res fetch failed, falling back to original resolution...");
      
      try {
        imageResponse = await fetch(rawImageUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0' },
          signal: AbortSignal.timeout(15000) // Increased to 15s
        });
      } catch (fallbackErr) {
        throw new Error("Both high-res and original image downloads failed.");
      }
    }

    if (!imageResponse || !imageResponse.ok) {
      throw new Error("Failed to download image from Facebook");
    }

    const arrayBuffer = await imageResponse.arrayBuffer();
    const finalBuffer = Buffer.from(arrayBuffer);

    const cleanId = facebookUrl 
      ? facebookUrl.replace(/https?:\/\/(www\.)?facebook\.com\//, '').replace(/[^a-zA-Z0-9]/g, '_') + '_' + Date.now()
      : 'fb_profile_' + Date.now();

    const cloudinaryData = await uploadToCloudinary(finalBuffer, cleanId);

    return NextResponse.json({
      success: true,
      originalDirtyUrl: rawFacebookUrl,
      cleanedUrlUsed: facebookUrl,
      logoUrl: cloudinaryData.url, 
      colors: cloudinaryData.colors
    });

  } catch (error: any) {
    console.error("Endpoint Error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}