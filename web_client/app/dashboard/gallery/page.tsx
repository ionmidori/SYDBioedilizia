'use client';

import { HouseMediaView } from '@/components/house/HouseMediaView';
import { WithHouseChat } from '@/components/house/WithHouseChat';

export default function GalleryPage() {
    return (
        <div className="w-full max-w-6xl mx-auto px-4 md:px-8 py-6 space-y-6">
            <h1 className="text-3xl font-serif font-bold text-luxury-text">Galleria</h1>
            <WithHouseChat>{(chatId) => <HouseMediaView chatId={chatId} />}</WithHouseChat>
        </div>
    );
}
