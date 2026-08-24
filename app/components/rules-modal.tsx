"use client";

import { useEffect, useRef } from "react";
import { RulesContent } from "@/app/components/rules-content";

interface RulesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * In-game rules popup. Displays game rules in a modal overlay.
 * Can be opened/closed while playing.
 */
export function RulesModal({ isOpen, onClose }: RulesModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen) {
      dialog.showModal();
    } else {
      dialog.close();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <dialog
      ref={dialogRef}
      className="fixed inset-0 z-50 w-full max-w-2xl max-h-[80vh] bg-gray-800 text-white rounded-xl p-0 backdrop:bg-black/60 overflow-hidden"
      onClose={onClose}
    >
      <div className="flex flex-col h-full max-h-[80vh]">
        <div className="flex items-center justify-between p-4 border-b border-gray-700 shrink-0">
          <h2 className="text-lg font-bold">Game Rules</h2>
          <button
            onClick={onClose}
            className="px-3 py-1 rounded-md text-sm font-semibold bg-gray-700 hover:bg-gray-600 transition"
            aria-label="Close rules"
          >
            &times; Close
          </button>
        </div>
        <div className="overflow-y-auto p-6">
          <RulesContent />
        </div>
      </div>
    </dialog>
  );
}