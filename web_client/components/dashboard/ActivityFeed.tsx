'use client';

import { motion } from 'framer-motion';
import { FileText, Image, FileCheck, FolderPlus, Clock } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { it } from 'date-fns/locale';

export interface ActivityItem {
    id: string;
    type: 'file_upload' | 'render_generated' | 'project_created' | 'quote_generated';
    projectName: string;
    fileName?: string;
    timestamp: Date;
}

interface ActivityFeedProps {
    activities: ActivityItem[];
    isLoading?: boolean;
    maxItems?: number;
}

const activityConfig = {
    file_upload: {
        icon: FileText,
        color: 'text-blue-400',
        bgColor: 'bg-blue-500/10',
        label: 'File caricato'
    },
    render_generated: {
        icon: Image,
        color: 'text-purple-400',
        bgColor: 'bg-purple-500/10',
        label: 'Render generato'
    },
    project_created: {
        icon: FolderPlus,
        color: 'text-green-400',
        bgColor: 'bg-green-500/10',
        label: 'Progetto creato'
    },
    quote_generated: {
        icon: FileCheck,
        color: 'text-luxury-gold',
        bgColor: 'bg-luxury-gold/10',
        label: 'Preventivo generato'
    }
};

export function ActivityFeed({ activities, isLoading = false, maxItems = 10 }: ActivityFeedProps) {
    const displayedActivities = activities.slice(0, maxItems);

    return (
        <div className="rounded-2xl border border-luxury-gold/10 bg-luxury-bg/50 backdrop-blur-xl overflow-hidden">
            {/* Header */}
            <div className="px-6 py-4 border-b border-luxury-gold/10 bg-luxury-bg/30">
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-luxury-gold/10">
                        <Clock className="w-5 h-5 text-luxury-gold" />
                    </div>
                    <div>
                        <h3 className="font-bold text-luxury-text text-sm">Attività Recente</h3>
                        <p className="text-xs text-luxury-text/50">Ultime azioni sui progetti</p>
                    </div>
                </div>
            </div>

            {/* Activity List */}
            <div className="max-h-[400px] overflow-y-auto custom-scrollbar">
                {isLoading ? (
                    <div className="p-6 space-y-4">
                        {[1, 2, 3].map((i) => (
                            <div key={i} className="flex items-start gap-3">
                                <div className="w-10 h-10 rounded-full bg-white/5 animate-pulse" />
                                <div className="flex-1 space-y-2">
                                    <div className="h-4 w-3/4 bg-white/5 rounded animate-pulse" />
                                    <div className="h-3 w-1/2 bg-white/5 rounded animate-pulse" />
                                </div>
                            </div>
                        ))}
                    </div>
                ) : displayedActivities.length === 0 ? (
                    <div className="p-8 text-center">
                        <div className="inline-flex p-4 rounded-full bg-luxury-gold/5 mb-3">
                            <Clock className="w-8 h-8 text-luxury-gold/30" />
                        </div>
                        <p className="text-sm text-luxury-text/40">Nessuna attività recente</p>
                    </div>
                ) : (
                    <div className="p-4 space-y-3">
                        {displayedActivities.map((activity, index) => {
                            const config = activityConfig[activity.type];
                            const Icon = config.icon;

                            return (
                                <motion.div
                                    key={activity.id}
                                    initial={{ opacity: 0, x: -20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: index * 0.05 }}
                                    className="flex items-start gap-3 p-3 rounded-xl hover:bg-white/5 transition-colors group"
                                >
                                    {/* Icon */}
                                    <div className={`p-2 rounded-lg ${config.bgColor} shrink-0`}>
                                        <Icon className={`w-4 h-4 ${config.color}`} />
                                    </div>

                                    {/* Content */}
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm text-luxury-text font-medium leading-tight">
                                            {config.label}
                                            {activity.fileName && (
                                                <span className="text-luxury-text/70">
                                                    {' '}<span className="font-mono text-xs">{activity.fileName}</span>
                                                </span>
                                            )}
                                        </p>
                                        <p className="text-xs text-luxury-text/50 mt-1">
                                            {activity.projectName} · {formatDistanceToNow(activity.timestamp, {
                                                addSuffix: true,
                                                locale: it
                                            })}
                                        </p>
                                    </div>

                                    {/* Timestamp Indicator */}
                                    <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                                        <div className="w-1.5 h-1.5 rounded-full bg-luxury-gold" />
                                    </div>
                                </motion.div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
