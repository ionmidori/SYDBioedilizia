export type ProjectStatus = 'draft' | 'analyzing' | 'quoted' | 'rendering' | 'completed';

/**
 * Property type classification for construction projects.
 */
export type PropertyType = 'apartment' | 'villa' | 'commercial';

/**
 * Address structure for construction site location.
 */
export interface Address {
    street: string;
    city: string;
    zip: string;
}

/**
 * Comprehensive construction site details.
 * This serves as the Single Source of Truth for AI context.
 */
export interface ProjectDetails {
    id: string; // session_id reference
    footage_sqm: number;
    property_type: PropertyType;
    address: Address;
    budget_cap: number;
    technical_notes?: string;
    renovation_constraints: string[];
}

export interface ProjectListItem {
    session_id: string;
    title: string;
    status: ProjectStatus;
    thumbnail_url?: string;
    original_image_url?: string;
    updated_at: string; // ISO 8601
    message_count: number;
}

export interface ProjectCreate {
    title?: string;
}

export interface ProjectUpdate {
    title?: string;
    status?: ProjectStatus;
    thumbnail_url?: string;
    original_image_url?: string;
}

export interface Project extends ProjectListItem {
    user_id: string;
    created_at: string;
    construction_details?: ProjectDetails;
}
