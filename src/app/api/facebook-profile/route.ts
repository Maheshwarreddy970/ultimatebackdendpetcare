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
  'apify_api_SoNIAG1xuFYPPzs3eZEenIedgryI7a3xcivO' // Added from your snippet
];

let currentApifyIndex = 0;

// ---------------------------------------------------------
// HIGH-RES FACEBOOK URL CONVERTER
// ---------------------------------------------------------
function upgradeFacebookImageUrl(url: string): string {
  if (!url) return url;
  return url
    .replace(/s\d+x\d+/g, 's600x600')
    .replace(/p\d+x\d+/g, 'p600x600')
    .replace(/mx\d+x\d+/g, 'mx600x600')
    .replace(/ctp=s\d+x\d+/g, 'ctp=s600x600');
}

// ---------------------------------------------------------
// CLOUDINARY UPLOADER
// ---------------------------------------------------------
async function uploadToCloudinary(buffer: Buffer, publicId: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        public_id: publicId,
        folder: 'facebookurl',
        overwrite: true,
        resource_type: 'auto',
        colors: true // Extract primary, secondary, tertiary colors
      },
      (error: any, result: any) => {
        if (error) return reject(error);
        if (!result) return reject(new Error("Upload failed"));

        // Max quality AVIF conversion (No background removal, best quality)
        const optimizedUrl = result.secure_url.replace(
          '/upload/',
          '/upload/f_avif,q_auto:best/'
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
// APIFY SCRAPER WITH ROTATION
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
        continue; // Try the next token in the loop
      }

      // If it's a genuine error (like page doesn't exist), throw it immediately
      throw error;
    }
  }

  throw new Error("All Apify tokens failed or rate limits exceeded.");
}

// ---------------------------------------------------------
// MAIN API ENDPOINT (For n8n)
// ---------------------------------------------------------
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const facebookUrl = body.facebookUrl;
    let rawImageUrl = body.facebookImageUrl; // Optional bypass

    if (!facebookUrl && !rawImageUrl) {
      return NextResponse.json({ success: false, error: "Provide either facebookUrl or facebookImageUrl" }, { status: 400 });
    }

    // 1. Scrape via Apify if direct image wasn't provided
    if (!rawImageUrl) {
      console.log(`Scraping FB Profile for: ${facebookUrl}`);
      rawImageUrl = await getProfilePicViaApify(facebookUrl);
    }

    // 2. Transform low-res URL to crisp 600x600 resolution
    const highResImageUrl = upgradeFacebookImageUrl(rawImageUrl);
    console.log("Upgraded Image URL:", highResImageUrl);

    // 3. Fetch the Image Buffer
    let imageResponse = await fetch(highResImageUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(10000)
    });

    if (!imageResponse.ok) {
      console.warn("High-Res fetch failed, falling back to original resolution...");
      imageResponse = await fetch(rawImageUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(10000)
      });
    }

    if (!imageResponse.ok) throw new Error("Failed to download image from Facebook");

    const arrayBuffer = await imageResponse.arrayBuffer();
    const finalBuffer = Buffer.from(arrayBuffer);

    // 4. Upload to Cloudinary
    const cleanId = facebookUrl 
      ? facebookUrl.replace(/https?:\/\/(www\.)?facebook\.com\//, '').replace(/[^a-zA-Z0-9]/g, '_') + '_' + Date.now()
      : 'fb_profile_' + Date.now();

    const cloudinaryData = await uploadToCloudinary(finalBuffer, cleanId);

    // 5. Return to n8n
    return NextResponse.json({
      success: true,
      sourceUrl: facebookUrl,
      logoUrl: cloudinaryData.url, 
      colors: cloudinaryData.colors
    });

  } catch (error: any) {
    console.error("Endpoint Error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}