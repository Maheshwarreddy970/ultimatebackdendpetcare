import { NextResponse } from 'next/server';
import { v2 as cloudinary } from 'cloudinary';

// ---------------------------------------------------------
// NEW CLOUDINARY CREDENTIALS
// ---------------------------------------------------------
cloudinary.config({
  cloud_name: 'dduwiqu4j',
  api_key: '735486643625886',
  api_secret: 'EQVhBgJCEv3t_EgfKHcKSjEJTqA',
});

// ---------------------------------------------------------
// APIFY TOKEN ROTATION MANAGER
// ---------------------------------------------------------
const APIFY_TOKENS = [
  'apify_api_zP6UkcgE9nEdRfvtxgfH9C9S9VG50G26Ch4U',
  'apify_api_NkPekUe1mhtcpLovU8fKmQPxFDj5oM4q00FG',
  'apify_api_Z3q3Jydg3u2k1TM4ELrWYcIUIa4hJC12BcNW'
];

// Global variable persists across hot-invocations in Vercel to remember the current working key
let currentApifyIndex = 0;

// ---------------------------------------------------------
// HIGH-RES FACEBOOK URL CONVERTER
// ---------------------------------------------------------
function upgradeFacebookImageUrl(url: string): string {
  if (!url) return url;
  // Transforms low-res sizes (s200x200, p200x200, mx200x200) into crisp 600x600 images
  return url
    .replace(/s\d+x\d+/g, 's600x600')
    .replace(/p\d+x\d+/g, 'p600x600')
    .replace(/mx\d+x\d+/g, 'mx600x600');
}

// ---------------------------------------------------------
// CLOUDINARY UPLOADER & COLOR EXTRACTOR
// ---------------------------------------------------------
async function uploadToCloudinary(buffer: Buffer, publicId: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        public_id: publicId,
        folder: 'facebook_profiles',
        overwrite: true,
        resource_type: 'auto',
        colors: true // 🔥 Extract primary, secondary, tertiary colors
      },
      (error: any, result: any) => {
        if (error) return reject(error);
        if (!result) return reject(new Error("Upload failed"));

        // Max quality AVIF conversion (No background removal)
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
// APIFY SCRAPER FUNCTION WITH SMART ROTATION
// ---------------------------------------------------------
async function getProfilePicViaApify(facebookUrl: string): Promise<string | null> {
  let attempts = 0;

  while (attempts < APIFY_TOKENS.length) {
    const currentToken = APIFY_TOKENS[currentApifyIndex];
    console.log(`Using Apify Token Index: ${currentApifyIndex}`);

    try {
      // Using standard Facebook Pages Scraper (Actor ID: b6dtseDzNeXxx7nWA)
      const response = await fetch(`https://api.apify.com/v2/acts/apify~facebook-pages-scraper/run-sync-get-dataset-items?token=${currentToken}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          startUrls: [{ url: facebookUrl }], 
          maxPosts: 0 // We only want profile info, skip posts to make it faster
        }),
        signal: AbortSignal.timeout(35000) // 35s timeout
      });

      // If Rate Limited (429) or Unauthorized (401/403) due to expired token -> Rotate
      if (response.status === 429 || response.status === 401 || response.status === 403) {
        console.warn(`Apify Token at index ${currentApifyIndex} failed/expired. Rotating...`);
        currentApifyIndex = (currentApifyIndex + 1) % APIFY_TOKENS.length;
        attempts++;
        continue; // Try next token
      }

      if (!response.ok) throw new Error(`Apify returned status ${response.status}`);

      const data = await response.json();
      
      // Extract the profile picture from the first result
      if (data && data.length > 0 && data[0].profilePic) {
        return data[0].profilePic;
      }
      return null;

    } catch (err: any) {
      console.error("Apify Fetch Error:", err.message);
      // On network timeout/error, assume bad proxy/key and rotate
      currentApifyIndex = (currentApifyIndex + 1) % APIFY_TOKENS.length;
      attempts++;
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

    // Step 1: Get the raw Image URL (Either direct from n8n or scrape via Apify)
    if (!rawImageUrl) {
      console.log(`Scraping FB Profile for: ${facebookUrl}`);
      rawImageUrl = await getProfilePicViaApify(facebookUrl);
    }

    if (!rawImageUrl) {
      return NextResponse.json({ success: false, error: "Could not extract Facebook profile picture." }, { status: 404 });
    }

    // Step 2: Transform low-res URL to crisp 600x600 resolution
    const highResImageUrl = upgradeFacebookImageUrl(rawImageUrl);
    console.log("Upgraded Image URL:", highResImageUrl);

    // Step 3: Fetch the Image Buffer
    let imageResponse = await fetch(highResImageUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(10000)
    });

    // Fallback: If 600x600 fails (rare), fall back to the original scraped URL
    if (!imageResponse.ok) {
      console.warn("High-Res fetch failed, falling back to original resolution...");
      imageResponse = await fetch(rawImageUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(10000)
      });
    }

    if (!imageResponse.ok) {
      return NextResponse.json({ success: false, error: "Failed to download image from Facebook" }, { status: 500 });
    }

    const arrayBuffer = await imageResponse.arrayBuffer();
    const finalBuffer = Buffer.from(arrayBuffer);

    // Step 4: Create a clean ID and Upload to Cloudinary
    const cleanId = facebookUrl 
      ? facebookUrl.replace(/https?:\/\/(www\.)?facebook\.com\//, '').replace(/[^a-zA-Z0-9]/g, '_') + '_' + Date.now()
      : 'fb_profile_' + Date.now();

    const cloudinaryData = await uploadToCloudinary(finalBuffer, cleanId);

    // Step 5: Return to n8n
    return NextResponse.json({
      success: true,
      sourceUrl: facebookUrl || 'direct_image_provided',
      originalScrapedImage: rawImageUrl,
      highResImageFetched: highResImageUrl,
      logoUrl: cloudinaryData.url, // AVIF, High Quality Cloudinary URL
      colors: cloudinaryData.colors
    });

  } catch (error: any) {
    console.error("Worker Error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}