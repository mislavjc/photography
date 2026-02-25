'use client';

import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { AnimatePresence, m, useReducedMotion } from 'motion/react';
import { useRouter } from 'next/navigation';

interface PhotoKeyboardNavProps {
  currentPhotoId: string;
  allPhotoIds: string[];
}

export function PhotoKeyboardNav({
  currentPhotoId,
  allPhotoIds,
}: PhotoKeyboardNavProps) {
  const router = useRouter();
  const [showHints, setShowHints] = useState(false);
  const shouldReduceMotion = useReducedMotion();

  // Find current index and get prev/next IDs
  const currentIndex = allPhotoIds.indexOf(currentPhotoId);
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < allPhotoIds.length - 1;
  const prevId = hasPrev ? allPhotoIds[currentIndex - 1] : null;
  const nextId = hasNext ? allPhotoIds[currentIndex + 1] : null;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger navigation when typing in inputs
      const target = e.target as HTMLElement;
      const isTyping =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable;

      if (isTyping) return;

      if (e.key === 'ArrowLeft' && prevId) {
        e.preventDefault();
        router.push(`/photo/${prevId}`);
      } else if (e.key === 'ArrowRight' && nextId) {
        e.preventDefault();
        router.push(`/photo/${nextId}`);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [prevId, nextId, router]);

  // Show hints on first visit
  useEffect(() => {
    const hasSeenHints = localStorage.getItem('photo-nav-hints-seen');
    if (!hasSeenHints) {
      setShowHints(true);
      const timer = setTimeout(() => {
        setShowHints(false);
        localStorage.setItem('photo-nav-hints-seen', 'true');
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, []);

  return (
    <>
      {/* Position counter */}
      {currentIndex >= 0 && (
        <div className="fixed bottom-8 right-4 z-50 pointer-events-none">
          <div className="bg-neutral-900/80 dark:bg-neutral-100/80 text-white dark:text-neutral-900 px-3 py-1.5 rounded-md text-xs font-mono tabular-nums backdrop-blur-sm">
            {currentIndex + 1} / {allPhotoIds.length}
          </div>
        </div>
      )}

      {/* Navigation buttons - visible on hover */}
      {prevId && (
        <button
          type="button"
          onClick={() => router.push(`/photo/${prevId}`)}
          className="fixed left-4 top-1/2 -translate-y-1/2 z-50 w-12 h-12 rounded-full bg-neutral-100/80 dark:bg-neutral-800/80 backdrop-blur-sm hover:bg-neutral-200 dark:hover:bg-neutral-700 flex items-center justify-center transition-all opacity-0 hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-neutral-400 dark:focus-visible:ring-neutral-600"
          aria-label="Previous photo"
        >
          <ChevronLeft className="w-6 h-6 text-neutral-600 dark:text-neutral-300" />
        </button>
      )}

      {nextId && (
        <button
          type="button"
          onClick={() => router.push(`/photo/${nextId}`)}
          className="fixed right-4 top-1/2 -translate-y-1/2 z-50 w-12 h-12 rounded-full bg-neutral-100/80 dark:bg-neutral-800/80 backdrop-blur-sm hover:bg-neutral-200 dark:hover:bg-neutral-700 flex items-center justify-center transition-all opacity-0 hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-neutral-400 dark:focus-visible:ring-neutral-600"
          aria-label="Next photo"
        >
          <ChevronRight className="w-6 h-6 text-neutral-600 dark:text-neutral-300" />
        </button>
      )}

      {/* Keyboard hints tooltip - shown once */}
      <AnimatePresence>
        {showHints && (
          <m.div
            initial={shouldReduceMotion ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{
              duration: 0.2,
              ease: [0.215, 0.61, 0.355, 1] as const,
            }}
            className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 pointer-events-none"
          >
            <div className="bg-neutral-900 dark:bg-neutral-800 text-white px-4 py-2.5 rounded-lg text-sm font-medium shadow-lg flex items-center gap-3">
              <div className="flex items-center gap-2">
                <kbd className="px-2 py-1 bg-neutral-800 dark:bg-neutral-700 rounded text-xs font-mono">
                  ←
                </kbd>
                <kbd className="px-2 py-1 bg-neutral-800 dark:bg-neutral-700 rounded text-xs font-mono">
                  →
                </kbd>
              </div>
              <span>Navigate photos</span>
            </div>
          </m.div>
        )}
      </AnimatePresence>
    </>
  );
}
