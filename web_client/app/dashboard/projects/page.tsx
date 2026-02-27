import { ProjectListClient } from "@/components/projects/ProjectListClient"
import { Metadata } from "next"

export const metadata: Metadata = {
    title: "I Miei Progetti | SYD",
    description: "Gestisci i tuoi progetti di ristrutturazione",
}

export default function ProjectsPage() {
    return <ProjectListClient />
}

