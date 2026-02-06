/**
 * Cloudinary service for uploading media from the worker environment.
 */

export interface CloudinaryUploadResult {
  url: string;
  publicId: string;
  resourceType: 'image' | 'video' | 'raw';
  format: string;
  size: number;
  width?: number;
  height?: number;
  duration?: number;
}

export class CloudinaryService {
  private cloudName: string;
  private uploadPreset: string;

  constructor(cloudName: string, uploadPreset: string) {
    this.cloudName = cloudName;
    this.uploadPreset = uploadPreset;
  }

  /**
   * Detect resource type based on file type string
   */
  private getResourceType(fileType: string): 'image' | 'video' | 'raw' {
    if (fileType.startsWith('image/')) return 'image';
    if (fileType.startsWith('video/')) return 'video';
    if (fileType.startsWith('audio/')) return 'video'; // Audio uses video endpoint in Cloudinary
    return 'raw';
  }

  /**
   * Upload a base64 or blob media to Cloudinary
   */
  async uploadMedia(
    content: string | Blob,
    fileName: string,
    fileType: string,
    folder: string = 'expowiz-leads'
  ): Promise<CloudinaryUploadResult> {
    const resourceType = this.getResourceType(fileType);
    const formData = new FormData();
    
    // Cloudinary supports base64 strings or Blobs
    formData.append('file', content);
    formData.append('upload_preset', this.uploadPreset);
    formData.append('folder', folder);
    formData.append('public_id', `${Date.now()}-${fileName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}`);

    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${this.cloudName}/${resourceType}/upload`,
      {
        method: 'POST',
        body: formData,
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Cloudinary upload failed: ${response.status} - ${errorText}`);
    }

    const result = await response.json();

    return {
      url: result.secure_url,
      publicId: result.public_id,
      resourceType,
      format: result.format,
      size: result.bytes,
      width: result.width,
      height: result.height,
      duration: result.duration,
    };
  }
}
