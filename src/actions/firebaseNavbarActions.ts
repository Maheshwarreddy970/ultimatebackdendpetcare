'use server';

import { db } from '@/lib/firebase';
import { collection, query, where, limit, getDocs, updateDoc, doc } from 'firebase/firestore';
import { revalidatePath } from 'next/cache';
import { v2 as cloudinary } from 'cloudinary';
import { removeBackground } from '@imgly/background-removal-node';

cloudinary.config({
  cloud_name: 'dduwiqu4j',
  api_key: '735486643625886',
  api_secret: 'EQVhBgJCEv3t_EgfKHcKSjEJTqA',
});

// Fetch items for the UI
export async function getPendingLeads() {
  const q = query(collection(db, "leads"), where("logoStatus", "==", "pending"), limit(50));
  const snapshot = await getDocs(q);
  
  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  })) as any[];
}

// 1. Manually Update Status
export async function updateFirebaseLogoStatus(docId: string, newStatus: string) {
  try {
    const docRef = doc(db, "leads", docId);
    await updateDoc(docRef, { logoStatus: newStatus });
    revalidatePath('/navcheck');
    return { success: true };
  } catch (error) {
    return { success: false, error: 'Failed to update status in Firebase' };
  }
}

// 2. Manual Upload & Replace
export async function uploadAndReplaceLogoFirebase(docId: string, formData: FormData) {
  try {
    const file = formData.get('file') as File;
    const buffer = Buffer.from(await file.arrayBuffer());
    
    const publicId = `custom_logo_${docId}_${Date.now()}`;
    const cloudinaryUrl = await new Promise<string>((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        { public_id: publicId, folder: 'logos', overwrite: true, resource_type: 'auto' },
        (error, result) => {
          if (error || !result) return reject(error);
          resolve(result.secure_url.replace('/upload/', '/upload/f_avif,q_auto/'));
        }
      );
      uploadStream.end(buffer);
    });

    const docRef = doc(db, "leads", docId);
    
    // 🔥 FIX: We removed logoStatus: 'approved' so the card stays on the screen!
    await updateDoc(docRef, { logoUrl: cloudinaryUrl }); 
    
    revalidatePath('/navcheck');
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
// 3. Manual Background Removal
export async function removeLogoBackgroundFirebase(docId: string, currentUrl: string) {
  try {
    console.log(`Starting BG removal for ${docId}...`);
    
    // 🔥 THE FIX: Just swap f_avif to f_png! This keeps the Cloudinary URL perfectly intact and gives the AI a readable format.
    let safeUrl = currentUrl;
    if (safeUrl.includes('f_avif')) {
      safeUrl = safeUrl.replace('f_avif', 'f_png');
    }

    const response = await fetch(safeUrl, { cache: 'no-store' }); 
    if (!response.ok) throw new Error("Failed to download image for background removal.");

    const originalBlob = await response.blob();
    const bgRemovedBlob = await removeBackground(originalBlob);
    
    const buffer = Buffer.from(await bgRemovedBlob.arrayBuffer());
    const publicId = `bg_removed_${docId}_${Date.now()}`;
    
    const cloudinaryUrl = await new Promise<string>((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        { public_id: publicId, folder: 'logos', overwrite: true, resource_type: 'image', format: 'png' },
        (error, result) => {
          if (error || !result) return reject(error);
          resolve(result.secure_url);
        }
      );
      uploadStream.end(buffer);
    });

   const docRef = doc(db, "leads", docId);
await updateDoc(docRef, { logoUrl: cloudinaryUrl }); // 🔥 REMOVED logoStatus: 'approved'
revalidatePath('/navcheck');
    
    return { success: true };
  } catch (error: any) {
    console.error('BG Removal Error:', error);
    return { success: false, error: error.message };
  }
}

// 4. Automated Engine
export async function autoProcessNextSuccessRecordFirebase() {
  try {
    const q = query(collection(db, "leads"), where("logoStatus", "==", "pending"), limit(1));
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      return { status: 'complete', message: 'No more pending records.' };
    }

    const docSnapshot = snapshot.docs[0];
    const targetItem = docSnapshot.data();
    const docId = docSnapshot.id;
    const docRef = doc(db, "leads", docId);

    if (!targetItem.logoUrl || targetItem.logoUrl.trim() === "") {
      await updateDoc(docRef, { logoStatus: "bg_failed" });
      revalidatePath('/navcheck');
      return { status: 'processing', message: `Marked ${targetItem.FinalEmail} as Failed (No Image)` };
    }

    // 🔥 THE FIX: Applied to the automation engine as well
    let safeUrl = targetItem.logoUrl;
    if (safeUrl.includes('f_avif')) {
      safeUrl = safeUrl.replace('f_avif', 'f_png');
    }

    const response = await fetch(safeUrl, { cache: 'no-store' });
    if (!response.ok) throw new Error("Failed to download image for automated background removal.");
    
    const originalBlob = await response.blob();
    const bgRemovedBlob = await removeBackground(originalBlob);
    
    const buffer = Buffer.from(await bgRemovedBlob.arrayBuffer());
    const publicId = `bg_removed_${docId}_${Date.now()}`;
    
    const cloudinaryUrl = await new Promise<string>((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        { public_id: publicId, folder: 'logos', overwrite: true, resource_type: 'image', format: 'png' },
        (error, result) => {
          if (error || !result) return reject(error);
          resolve(result.secure_url);
        }
      );
      uploadStream.end(buffer);
    });

    await updateDoc(docRef, { 
      logoUrl: cloudinaryUrl,
      logoStatus: 'approved'
    });
    
    revalidatePath('/navcheck');
    return { status: 'processing', message: `✅ BG Removed & Approved: ${targetItem.FinalEmail}` };

  } catch (error: any) {
    console.error('Auto Process Error:', error);
    return { status: 'error', message: `Failed: ${error.message}` };
  }
}

// 5. Revert/Undo Logo URL
export async function updateFirebaseLogoUrl(docId: string, newUrl: string) {
  try {
    const docRef = doc(db, "leads", docId);
    await updateDoc(docRef, { logoUrl: newUrl });
    revalidatePath('/navcheck');
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}



// 6. Upload Custom Logo from External URL (Drag & Drop from another website)
export async function uploadAndReplaceLogoFromUrlFirebase(docId: string, imageUrl: string) {
  try {
    // Fetch the image directly from the external website
    const response = await fetch(imageUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(10000)
    });
    
    if (!response.ok) throw new Error("Failed to fetch image from external URL");
    
    const blob = await response.blob();
    const buffer = Buffer.from(await blob.arrayBuffer());
    
    const publicId = `custom_logo_${docId}_${Date.now()}`;
    const cloudinaryUrl = await new Promise<string>((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        { public_id: publicId, folder: 'logos', overwrite: true, resource_type: 'auto' },
        (error, result) => {
          if (error || !result) return reject(error);
          resolve(result.secure_url.replace('/upload/', '/upload/f_avif,q_auto/'));
        }
      );
      uploadStream.end(buffer);
    });

    const docRef = doc(db, "leads", docId);
    
    // 🔥 FIX: We removed logoStatus: 'approved' here too!
    await updateDoc(docRef, { logoUrl: cloudinaryUrl }); 
    
    revalidatePath('/navcheck');
    return { success: true };
  } catch (error: any) {
    console.error("URL Upload Error:", error);
    return { success: false, error: error.message };
  }
}