'use server';

import { db } from '@/lib/firebase';
import { collection, query, where, limit, getDocs, updateDoc, doc, deleteField } from 'firebase/firestore';
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
    id: doc.id, // The document ID (which is the email)
    ...doc.data()
  })) as any[];
}

// 1. Manually Update Status
export async function updateFirebaseLogoStatus(docId: string, newStatus: string) {
  try {
    const docRef = doc(db, "leads", docId);
    await updateDoc(docRef, { logoStatus: newStatus });
    revalidatePath('/jsonnavcheck');
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
    await updateDoc(docRef, { logoUrl: cloudinaryUrl });
    revalidatePath('/jsonnavcheck');
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// 3. Manual Background Removal
export async function removeLogoBackgroundFirebase(docId: string, currentUrl: string) {
  try {
    const response = await fetch(currentUrl);
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
    await updateDoc(docRef, { logoUrl: cloudinaryUrl });
    revalidatePath('/jsonnavcheck');
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// 4. Automated Engine
export async function autoProcessNextSuccessRecordFirebase() {
  try {
    // Just fetch ONE pending record to save Firebase read limits
    const q = query(collection(db, "leads"), where("logoStatus", "==", "pending"), limit(1));
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      return { status: 'complete', message: 'No more pending records.' };
    }

    const docSnapshot = snapshot.docs[0];
    const targetItem = docSnapshot.data();
    const docId = docSnapshot.id;
    const docRef = doc(db, "leads", docId);

    // SCENARIO A: No image -> Mark as failed (to drop it out of 'pending' queue)
    if (!targetItem.logoUrl || targetItem.logoUrl.trim() === "") {
      await updateDoc(docRef, { logoStatus: "bg_failed" });
      revalidatePath('/jsonnavcheck');
      return { status: 'processing', message: `Marked ${targetItem.FinalEmail} as Failed (No Image)` };
    }

    // SCENARIO B: Remove Background & Approve
    const response = await fetch(targetItem.logoUrl);
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
    
    revalidatePath('/jsonnavcheck');
    return { status: 'processing', message: `✅ BG Removed & Approved: ${targetItem.FinalEmail}` };

  } catch (error: any) {
    // If it crashes, mark it as bg_failed so the engine doesn't get stuck in an infinite loop
    console.error('Auto Process Error:', error);
    return { status: 'error', message: `Failed: ${error.message}` };
  }
}