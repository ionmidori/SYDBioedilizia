import React from 'react';
import { motion } from 'framer-motion';

/**
 * BentoDashboardPreview
 * A high-fidelity implementation of a 2026-style Bento Grid Dashboard.
 */
const BentoDashboardPreview = () => {
    return (
        <div className="p-8 bg-neutral-950 min-h-screen text-white font-sans">
            <header className="mb-12">
                <h1 className="text-4xl font-serif font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-cyan-400">
                    Executive Summary
                </h1>
                <p className="text-neutral-400 mt-2">Renovation Project Status • Feb 2026</p>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 auto-rows-[200px]">
                {/* Hero Performance Card */}
                <motion.div
                    whileHover={{ scale: 1.02 }}
                    className="md:col-span-2 md:row-span-2 bg-gradient-to-br from-indigo-500/20 to-purple-500/20 backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl flex flex-col justify-between"
                >
                    <div>
                        <h2 className="text-2xl font-semibold">Project Health</h2>
                        <div className="h-48 mt-4 flex items-end gap-2">
                            {[40, 70, 45, 90, 65, 80, 100].map((h, i) => (
                                <div key={i} style={{ height: `${h}%` }} className="flex-1 bg-white/20 rounded-t-lg" />
                            ))}
                        </div>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-3xl font-bold">98.4%</span>
                        <span className="text-green-400 text-sm">↑ 4.2% optimized</span>
                    </div>
                </motion.div>

                {/* AI Insight Card */}
                <div className="md:col-span-2 bg-white/5 border border-white/10 rounded-3xl p-6 backdrop-blur-md">
                    <div className="flex items-center gap-3 text-indigo-400 mb-2">
                        <span className="text-xs uppercase tracking-widest font-bold">AI Architect</span>
                    </div>
                    <p className="text-neutral-300 leading-relaxed">
                        Suggesting bento-grid refactor for the assets gallery. Estimated visual clarity improvement: **15%**.
                    </p>
                </div>

                {/* Quick Actions (Small) */}
                <div className="bg-white/5 border border-white/10 rounded-3xl p-6 hover:bg-white/10 transition-colors cursor-pointer group">
                    <h3 className="text-sm font-medium text-neutral-400 group-hover:text-white">New Quote</h3>
                    <div className="mt-4 text-4xl">+</div>
                </div>

                {/* Task Efficiency */}
                <div className="bg-white/5 border border-white/10 rounded-3xl p-6">
                    <h3 className="text-sm font-medium text-neutral-400">Efficiency</h3>
                    <div className="mt-4 flex flex-col gap-2">
                        <div className="h-1 bg-white/10 rounded-full overflow-hidden">
                            <div className="h-full bg-indigo-500 w-[78%]" />
                        </div>
                        <span className="text-xs text-neutral-500">78% - Trending High</span>
                    </div>
                </div>

                {/* Wide Footer Card */}
                <div className="md:col-span-2 bg-white/5 border border-white/10 rounded-3xl p-6 flex items-center justify-between">
                    <div className="flex -space-x-3">
                        {[1, 2, 3, 4].map(i => <div key={i} className="w-10 h-10 rounded-full border-2 border-black bg-neutral-800" />)}
                    </div>
                    <button className="px-6 py-2 bg-white text-black rounded-full font-bold hover:bg-neutral-200 transition-colors">
                        Manage Team
                    </button>
                </div>
            </div>
        </div>
    );
};

export default BentoDashboardPreview;
