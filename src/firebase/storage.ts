import { ref, uploadBytesResumable, getDownloadURL, deleteObject, listAll } from 'firebase/storage'
import { storage } from './config'

export type UploadPath = 'covers' | 'backgrounds' | 'logos'

export interface StorageImage {
  url: string
  fullPath: string
  name: string
}

/** List all images uploaded by a user in a given folder */
export async function listImages(path: UploadPath, uid: string): Promise<StorageImage[]> {
  const folderRef = ref(storage, path)
  const result = await listAll(folderRef)
  const items = result.items.filter(item => item.name.startsWith(uid + '_'))
  const images = await Promise.all(
    items.map(async item => {
      const url = await getDownloadURL(item)
      return { url, fullPath: item.fullPath, name: item.name }
    })
  )
  return images.reverse()
}

export interface UploadResult {
  url: string
  path: string
}

/**
 * Upload an image file to Firebase Storage.
 * @param file - File to upload
 * @param path - Storage folder: 'covers' | 'backgrounds' | 'logos'
 * @param uid - User UID (used to namespace the file)
 * @param onProgress - Optional callback with percentage 0-100
 */
export function uploadImage(
  file: File,
  path: UploadPath,
  uid: string,
  onProgress?: (pct: number) => void,
): Promise<UploadResult> {
  return new Promise((resolve, reject) => {
    const ext = file.name.split('.').pop() ?? 'jpg'
    const filename = `${uid}_${Date.now()}.${ext}`
    const storageRef = ref(storage, `${path}/${filename}`)
    const task = uploadBytesResumable(storageRef, file, { contentType: file.type })

    task.on(
      'state_changed',
      snapshot => {
        const pct = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100)
        onProgress?.(pct)
      },
      reject,
      async () => {
        try {
          const url = await getDownloadURL(task.snapshot.ref)
          resolve({ url, path: task.snapshot.ref.fullPath })
        } catch (err) {
          reject(err)
        }
      },
    )
  })
}

/** Delete a file from Storage by its full path (e.g. "covers/uid_123.jpg") */
export async function deleteImage(fullPath: string): Promise<void> {
  const fileRef = ref(storage, fullPath)
  await deleteObject(fileRef)
}
