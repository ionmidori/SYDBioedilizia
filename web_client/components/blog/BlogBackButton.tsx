'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';
import { M3Spring } from '@/lib/m3-motion';

export function BlogBackButton() {
  return (
    <div className="mb-12 mt-12">
      <Link href="/blog">
        <motion.div
          className="inline-flex items-center px-6 py-2.5 rounded-full bg-secondary/50 backdrop-blur-sm border border-border/50 text-foreground font-semibold text-sm hover:bg-secondary/80 transition-colors shadow-sm"
          whileHover={{ x: -4 }}
          whileTap={{ scale: 0.96 }}
          transition={M3Spring.standard}
        >
          <motion.div
            initial={{ x: 0 }}
            whileHover={{ x: -4 }}
            transition={M3Spring.standard}
          >
            <ArrowLeft className="w-5 h-5 mr-3 text-primary" />
          </motion.div>
          <span>Torna al Blog</span>
        </motion.div>
      </Link>
    </div>
  );
}
