export interface GalleryAssetMetadata {
    size?: number;
    uploadedBy: string;
    projectId: string;
    projectName: string;
}

export interface GalleryAsset {
    id: string;
    type: 'image' | 'video' | 'quote' | 'render' | 'unknown';

    url: string;
    thumbnail?: string;
    title: string;
    createdAt: string | Date;
    timestamp: string | Date;
    metadata: GalleryAssetMetadata;
}

export interface GalleryResponse {
    assets: GalleryAsset[];
    hasMore: boolean;
    lastVisibleId?: string;
}
