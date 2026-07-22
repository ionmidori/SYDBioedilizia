import { QuoteListClient } from "@/components/quotes/QuoteListClient"
import { Metadata } from "next"

export const metadata: Metadata = {
    title: "I Miei Preventivi | SYD",
    description: "Le tue richieste di preventivo e i documenti approvati",
}

export default function QuotesPage() {
    return <QuoteListClient />
}
