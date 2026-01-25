import Link from 'next/link'

export default function MaintenancePage() {
    return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-gray-900 p-4 text-center">
            <div className="space-y-6 max-w-md">
                <h1 className="text-4xl font-bold tracking-tight text-white sm:text-6xl">
                    Under Maintenance
                </h1>
                <p className="text-lg text-gray-300">
                    Stiamo eseguendo aggiornamenti importanti ai nostri sistemi.
                    <br />
                    Torneremo online a breve.
                </p>
                <div className="pt-8">
                    <div className="h-1 w-full bg-gray-800 rounded overflow-hidden">
                        <div className="h-full bg-blue-500 animate-pulse w-2/3"></div>
                    </div>
                    <p className="text-xs text-gray-500 mt-2">System Upgrade in Progress</p>
                </div>
            </div>
        </div>
    )
}
