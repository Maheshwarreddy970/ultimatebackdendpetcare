'use server';

import { db } from '@/lib/firebase';
import { collection, query, where, limit, getDocs, updateDoc, doc } from 'firebase/firestore';
import { v2 as cloudinary } from 'cloudinary';
import { ApifyClient } from 'apify-client';
import sharp from 'sharp';

cloudinary.config({
  cloud_name: 'ta5klglv',
  api_key: '228386464312455',
  api_secret: 'pIoksKtT9h6ez0k3KhbcwjAoU7o',
});


const APIFY_TOKENS = [
  'apify_api_zP6UkcgE9nEdRfvtxgfH9C9S9VG50G26Ch4U',
  'apify_api_NkPekUe1mhtcpLovU8fKmQPxFDj5oM4q00FG',
  'apify_api_Z3q3Jydg3u2k1TM4ELrWYcIUIa4hJC12BcNW',
  'apify_api_SoNIAG1xuFYPPzs3eZEenIedgryI7a3xcivO'
];
let currentApifyIndex = 0;

function cleanFacebookUrl(rawUrl: string): string {
  if (!rawUrl || typeof rawUrl !== "string" || rawUrl.trim() === "") return "";
  let currentUrl = rawUrl.trim();
  if (!currentUrl.startsWith("http")) currentUrl = "https://" + currentUrl;
  try {
    const urlObj = new URL(currentUrl);
    if (urlObj.hostname.includes("facebook.com")) urlObj.hostname = "www.facebook.com";
    const segments = urlObj.pathname.split("/").filter(Boolean);
    if (segments.length > 0) {
      if (segments[0] === "profile.php") {
        const profileId = urlObj.searchParams.get("id");
        return profileId ? `https://www.facebook.com/profile.php?id=${profileId}` : `https://www.facebook.com/`;
      }
      return `https://www.facebook.com/${segments[0]}`;
    }
    return `https://www.facebook.com/`;
  } catch {
    return rawUrl;
  }
}

function upgradeFacebookImageUrl(url: string): string {
  if (!url) return url;
  return url.replace(/\d+x\d+/g, '960x960');
}

// ---------------------------------------------------------
// 🐋 THE FIX: DOCKER "URL INJECTION" (Bypasses Socket Crashes)
// ---------------------------------------------------------
async function removePremiumBackground(imageUrl: string): Promise<Buffer> {
  // 1. Force Cloudinary to give us a clean PNG
  let safeUrl = imageUrl.replace(/\/upload\/[^/]+\//, '/upload/f_png/');

  // 2. 🔥 THE GENIUS FIX: Hand the URL directly to Docker via a GET request.
  // This forces Docker to download the image itself, bypassing the Node.js FormData socket crash entirely!
  // We are also forcing it to use the elite 'birefnet-general' model.
  const dockerUrl = `http://127.0.0.1:5000/api/remove?url=${encodeURIComponent(safeUrl)}&model=birefnet-general`;

  // 3. Docker downloads and processes the image
  const aiResponse = await fetch(dockerUrl, {
    method: 'GET',
    signal: AbortSignal.timeout(90000) // 90 seconds to allow the BiRefNet model to download on the very first run
  });

  if (!aiResponse.ok) {
    throw new Error(`Local Docker AI Failed! HTTP Status: ${aiResponse.status}. Make sure Docker is running on port 5000.`);
  }

  return Buffer.from(await aiResponse.arrayBuffer());
}

async function uploadBufferToCloudinary(buffer: Buffer, docId: string, folder: string = 'logos'): Promise<any> {
  const safeId = docId.replace(/[^a-zA-Z0-9]/g, '_');
  const publicId = `${folder}_${safeId}`;

  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      { public_id: publicId, folder: folder, overwrite: true, invalidate: true, resource_type: 'auto', colors: true },
      (error: any, result: any) => {
        if (error || !result) return reject(error);

        let transform = '/upload/f_avif,q_auto:best/';
        if (folder === 'facebookurl') transform = '/upload/w_600,h_600,c_fill,g_auto,f_avif,q_100/';
        const optimizedUrl = result.secure_url.replace('/upload/', transform);

        let primary = null, secondary = null, tertiary = null;
        if (result.colors && result.colors.length > 0) {
          primary = result.colors[0]?.[0] || null;
          secondary = result.colors[1]?.[0] || null;
          tertiary = result.colors[2]?.[0] || null;
        }
        resolve({ url: optimizedUrl, colors: { primary, secondary, tertiary } });
      }
    );
    uploadStream.end(buffer);
  });
}

function isBadLogo(item: any): boolean {
  const p = String(item.primary || "").toUpperCase();
  const s = String(item.secondary || "").toUpperCase();
  const t = String(item.tertiary || "").toUpperCase();
  const url = String(item.logoUrl || "").toLowerCase();

  if (p === "#101928" && s === "#FFFFFF") return true;
  if (p === "#0987C5" && s === "#FFFFFE" && t === "#EFFBFD") return true;
  if (p === "#000000" && s === "#000000") return true;
  if (p === "#FFFFFF" && !s && !t) return true;
  if (url.includes('.pdf') || url.includes('file') || url.includes('placeholder')) return true;

  return false;
}

export async function getPendingLeads() {
  const q = query(collection(db, "leads"), where("logoStatus", "==", "pending"), limit(50));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as any[];
}

export async function updateFirebaseLogoStatus(docId: string, newStatus: string) {
  try {
    await updateDoc(doc(db, "leads", docId), { logoStatus: newStatus });
    return { success: true };
  } catch (error) {
    return { success: false, error: 'Failed to update status' };
  }
}

export async function updateFirebaseLogoUrl(docId: string, newUrl: string) {
  try {
    await updateDoc(doc(db, "leads", docId), { logoUrl: newUrl });
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function uploadAndReplaceLogoFirebase(docId: string, formData: FormData) {
  try {
    const file = formData.get('file') as File;
    const buffer = Buffer.from(await file.arrayBuffer());

    const cloudinaryData = await uploadBufferToCloudinary(buffer, docId, 'logos');

    // Apply standard padding & formatting on manual upload
    const cleanUrl = cloudinaryData.url.replace('/upload/', '/upload/w_600,h_600,c_pad,g_auto,f_avif,q_auto:best/');
    await updateDoc(doc(db, "leads", docId), { logoUrl: cleanUrl });

    return { success: true, newUrl: cleanUrl };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function uploadAndReplaceLogoFromUrlFirebase(docId: string, imageUrl: string) {
  try {
    const response = await fetch(imageUrl, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error("Failed to fetch image from external URL");

    const buffer = Buffer.from(await (await response.blob()).arrayBuffer());
    const cloudinaryData = await uploadBufferToCloudinary(buffer, docId, 'logos');

    const cleanUrl = cloudinaryData.url.replace('/upload/', '/upload/w_600,h_600,c_pad,g_auto,f_avif,q_auto:best/');
    await updateDoc(doc(db, "leads", docId), { logoUrl: cleanUrl });

    return { success: true, newUrl: cleanUrl };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function removeLogoBackgroundFirebase(docId: string, currentUrl: string) {
  try {
    const finalImageBuffer = await removePremiumBackground(currentUrl);
    const cloudinaryData = await uploadBufferToCloudinary(finalImageBuffer, docId, 'logos');

    // Apply formatting to output
    const cleanUrl = cloudinaryData.url.replace('/upload/', '/upload/w_600,h_600,c_pad,g_auto,f_avif,q_auto:best/');
    await updateDoc(doc(db, "leads", docId), { logoUrl: cleanUrl });

    return { success: true, newUrl: cleanUrl };
  } catch (error: any) {
    console.error('BG Removal Error:', error);
    return { success: false, error: error.message };
  }
}

// ---------------------------------------------------------
// THE AUTOMATED ENGINE
// ---------------------------------------------------------
export async function autoProcessNextSuccessRecordFirebase() {
  let docId: string | undefined;
  try {
    const q = query(collection(db, "leads"), where("logoStatus", "==", "pending"), limit(1));
    const snapshot = await getDocs(q);

    if (snapshot.empty) return { status: 'complete', message: 'No more pending records.' };

    const docSnapshot = snapshot.docs[0];
    const targetItem = docSnapshot.data();
    docId = docSnapshot.id;
    const docRef = doc(db, "leads", docId);

    if (!targetItem.logoUrl || targetItem.logoUrl.trim() === "" || isBadLogo(targetItem)) {
      const fbRawUrl = targetItem.Facebook || targetItem.facebookurl || targetItem.aifacebook || targetItem["extracted facebook"];

      if (fbRawUrl) {
        const cleanFbUrl = cleanFacebookUrl(fbRawUrl);
        let attempts = 0;
        let rawImageUrl = "";

        while (attempts < APIFY_TOKENS.length) {
          try {
            const apifyClient = new ApifyClient({ token: APIFY_TOKENS[currentApifyIndex] });
            const run = await apifyClient.actor("apify/facebook-pages-scraper").call({ startUrls: [{ url: cleanFbUrl }], maxPosts: 0 });
            const { items } = await apifyClient.dataset(run.defaultDatasetId).listItems();

            if (items && items[0]) {
              const data = items[0] as any;
              rawImageUrl = data.profilePictureUrl || data.profilePicture || data.profilePic || data.image || data.avatar;
              if (typeof rawImageUrl === 'object') rawImageUrl = (rawImageUrl as any).url || (rawImageUrl as any).src;
            }
            break;
          } catch (err: any) {
            if (err.message.includes('429') || err.message.includes('limit')) {
              currentApifyIndex = (currentApifyIndex + 1) % APIFY_TOKENS.length;
              attempts++;
            } else { break; }
          }
        }

        if (rawImageUrl && typeof rawImageUrl === 'string') {
          const highResUrl = upgradeFacebookImageUrl(rawImageUrl);
          let imgRes = await fetch(highResUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
          if (!imgRes.ok) imgRes = await fetch(rawImageUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });

          if (imgRes.ok) {
            const buffer = Buffer.from(await imgRes.arrayBuffer());
            const cloudData = await uploadBufferToCloudinary(buffer, docId, 'facebookurl');

            // 🛑 PLACED IN MANUAL REVIEW. NO AUTO-GENERATION OF SVG.
            await updateDoc(docRef, {
              logoUrl: cloudData.url,
              logoStatus: 'manual_review',
              primary: cloudData.colors.primary || "",
              secondary: cloudData.colors.secondary || "",
              tertiary: cloudData.colors.tertiary || ""
            });
            return { status: 'processing', message: `⚠️ Scraped FB Profile. Placed in Manual Review: ${targetItem.FinalEmail}` };
          }
        }
      }

      await updateDoc(docRef, { logoStatus: "manual_review" });
      return { status: 'processing', message: `⚠️ Bad image, no FB. Marked ${targetItem.FinalEmail} for manual review.` };
    }

    // Process the logo through your Local Docker BiRefNet model
    const finalImageBuffer = await removePremiumBackground(targetItem.logoUrl);
    const cloudData = await uploadBufferToCloudinary(finalImageBuffer, docId, 'logos');

    const cleanUrl = cloudData.url.replace('/upload/', '/upload/w_600,h_600,c_pad,g_auto,f_avif,q_auto:best/');

    await updateDoc(docRef, {
      logoUrl: cleanUrl,
      logoStatus: 'approved'
    });

    return { status: 'processing', message: `✅ BG Removed & Approved: ${targetItem.FinalEmail}` };

  } catch (error: any) {
    console.error('Auto Process Error:', error);
    if (docId) await updateDoc(doc(db, "leads", docId), { logoStatus: "manual_review" });
    return { status: 'error', message: `Failed: ${error.message}` };
  }
}