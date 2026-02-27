"use server";

import { revalidatePath } from "next/cache";
import { projectDetailsSchema } from "@/lib/validation/project-details-schema";

interface ActionResult {
    success: boolean;
    message: string;
    errors?: Record<string, string[]>;
}

/**
 * Server Action to update project construction details.
 * 
 * This action validates the form data, proxies the request to the Python backend,
 * and revalidates the cache upon success.
 * 
 * @param sessionId - The project session ID
 * @param formData - FormData from the client form
 * @returns ActionResult with success status and message
 */
export async function updateProjectDetails(
    sessionId: string,
    formData: FormData
): Promise<ActionResult> {
    try {
        // Parse and validate FormData
        const rawData = {
            id: sessionId,
            footage_sqm: parseFloat(formData.get("footage_sqm") as string),
            property_type: formData.get("property_type") as string,
            address: {
                street: formData.get("address_street") as string,
                city: formData.get("address_city") as string,
                zip: formData.get("address_zip") as string,
            },
            budget_cap: parseFloat(formData.get("budget_cap") as string),
            technical_notes: formData.get("technical_notes") as string || undefined,
            renovation_constraints: JSON.parse(formData.get("renovation_constraints") as string || "[]"),
        };

        // Validate with Zod
        const validationResult = projectDetailsSchema.safeParse(rawData);

        if (!validationResult.success) {
            const errors: Record<string, string[]> = {};
            validationResult.error.issues.forEach((issue) => {
                const path = issue.path.join(".");
                if (!errors[path]) {
                    errors[path] = [];
                }
                errors[path].push(issue.message);
            });

            return {
                success: false,
                message: "Validation failed. Please check your inputs.",
                errors,
            };
        }

        // Get authentication token from cookies or headers
        const { cookies } = await import("next/headers");
        const cookieStore = await cookies();
        const token = cookieStore.get("auth-token")?.value;

        if (!token) {
            return {
                success: false,
                message: "Authentication required. Please log in.",
            };
        }

        // Proxy request to Python backend
        const backendUrl = process.env.PYTHON_BACKEND_URL || "http://localhost:8080";
        const response = await fetch(`${backendUrl}/api/projects/${sessionId}/details`, {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(validationResult.data),
        });

        const result = await response.json();

        if (!response.ok) {
            return {
                success: false,
                message: result.detail || "Failed to update project details.",
            };
        }

        // Revalidate the dashboard page cache
        revalidatePath(`/dashboard/${sessionId}`);
        revalidatePath("/dashboard");

        return {
            success: true,
            message: result.message || "Construction details updated successfully!",
        };
    } catch (error) {
        console.error("[Server Action] Error updating project details:", error);
        return {
            success: false,
            message: "An unexpected error occurred. Please try again.",
        };
    }
}

