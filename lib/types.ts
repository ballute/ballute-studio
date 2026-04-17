export type UploadItem = {
  file: File;
  preview: string;
  caption?: string;
  storagePath?: string;
  uploaded?: boolean;
  expiresAt?: string;
};

export type OutputRatio = "4:5" | "2:3" | "16:9";
