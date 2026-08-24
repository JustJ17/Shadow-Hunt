"use client";

import { useEffect, useRef, useState } from "react";
import type { GameEventData } from "@/lib/turn-engine/types";
import type { NameLookupFn, PlayerLookupFn } from "@/lib/game-ui/event-messages";
import {
  formatEventMessage,
  formatRelativeTimestamp,
} from "@/lib/game-ui/event-messages";
import { EventIcon } from "./event-icon";

interface EventFeedPanelProps {
  events: GameEventData[] | undefined;
  nameLookup: NameLookupFn;
  playerLookup: PlayerLookupFn;
}

/**
 * EventFeedPanel — renders the public event log in reverse-chronological order
 * with inline-SVG icons, human-readable sentences, relative timestamps,
 * round markers, scroll management, and ARIA live region.
 *
 * Requirements: 8.1–8.8, 9.1–9.5, 15.6, 16.3, 16.5
 */
export function EventFeedPanel({
  events,
  nameLookup,
  playerLookup,
}: EventFeedPanelProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const lastSeenCountRef = useRef(0);
  const [unseenCount, setUnseenCount] = useState(0);

  // Sort events descending by sequenceNumber (newest first)
  const sortedEvents =
    events && events.length > 0
      ? [...events].sort((a, b) => b.sequenceNumber - a.sequenceNumber)
      : [];

  // Determine newly added events for ARIA live announcement
  const prevEventCountRef = useRef(0);
  const newEvents =
    sortedEvents.length > prevEventCountRef.current
      ? sortedEvents.slice(0, sortedEvents.length - prevEventCountRef.current)
      : [];

  useEffect(() => {
    prevEventCountRef.current = sortedEvents.length;
  }, [sortedEvents.length]);

  // Auto-scroll logic: if user is within 40px of the top (newest), auto-scroll;
  // otherwise show "N unseen events" pill.
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const eventCount = sortedEvents.length;
    if (eventCount <= lastSeenCountRef.current) return;

    const scrolledFromTop = container.scrollTop;
    if (scrolledFromTop <= 40) {
      // Auto-scroll to top (newest events)
      container.scrollTop = 0;
      lastSeenCountRef.current = eventCount;
      setUnseenCount(0);
    } else {
      // User scrolled away — show unseen pill
      const unseen = eventCount - lastSeenCountRef.current;
      setUnseenCount(unseen);
    }
  }, [sortedEvents.length]);

  function handleScrollToNewest() {
    const container = scrollContainerRef.current;
    if (container) {
      container.scrollTop = 0;
      lastSeenCountRef.current = sortedEvents.length;
      setUnseenCount(0);
    }
  }

  // Handle scroll position changes to dismiss the pill when user scrolls to top
  function handleScroll() {
    const container = scrollContainerRef.current;
    if (!container) return;

    if (container.scrollTop <= 40) {
      lastSeenCountRef.current = sortedEvents.length;
      setUnseenCount(0);
    }
  }

  // Empty state
  if (!events || events.length === 0) {
    return (
      <section aria-label="Event Feed" className="bg-gray-800 rounded-lg p-4">
        <p className="text-gray-400 text-center py-8">No events yet</p>
      </section>
    );
  }

  // Group sorted events to determine where round markers go.
  // A round marker appears above the first event of each round in the rendered order.
  const roundMarkers = new Set<number>();
  const eventRows: Array<{
    event: GameEventData;
    showRoundMarker: boolean;
  }> = [];

  for (const event of sortedEvents) {
    const showMarker = !roundMarkers.has(event.roundNumber);
    if (showMarker) {
      roundMarkers.add(event.roundNumber);
    }
    eventRows.push({ event, showRoundMarker: showMarker });
  }

  return (
    <section aria-label="Event Feed" className="bg-gray-800 rounded-lg p-4 flex flex-col">
      {/* Unseen events pill */}
      {unseenCount > 0 && (
        <button
          onClick={handleScrollToNewest}
          className="mb-2 self-center bg-blue-600 hover:bg-blue-500 text-white text-xs px-3 py-1 rounded-full focus-visible:ring-2 focus-visible:ring-blue-400 transition-colors"
        >
          {unseenCount} unseen events
        </button>
      )}

      {/* Scrollable event list */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="overflow-y-auto max-h-80 space-y-1"
        role="log"
      >
        {eventRows.map(({ event, showRoundMarker }) => (
          <div key={event.id}>
            {showRoundMarker && (
              <div
                role="heading"
                aria-level={3}
                className="text-xs uppercase text-gray-400 tracking-wide pt-3 pb-1 font-medium border-b border-gray-700 mb-1"
              >
                Round {event.roundNumber}
              </div>
            )}
            <div className="flex items-start gap-2 py-1 text-sm">
              <span className="shrink-0 mt-0.5 text-gray-300">
                <EventIcon type={event.type} />
              </span>
              <span className="flex-1 text-gray-200">
                {formatEventMessage(event, nameLookup, playerLookup)}
              </span>
              <span className="shrink-0 text-gray-400 text-xs whitespace-nowrap">
                {formatRelativeTimestamp(event.createdAt)}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* ARIA live region for new events */}
      <div aria-live="polite" className="sr-only">
        {newEvents.map((event) => (
          <span key={event.id}>
            {formatEventMessage(event, nameLookup, playerLookup)}
          </span>
        ))}
      </div>
    </section>
  );
}
