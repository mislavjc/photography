'use client';

import { useQueryState } from 'nuqs';
import React, { useEffect, useRef, useState } from 'react';

import type { TimeRange } from '../types';

interface TimeRangeFilterProps {
  selectedTimeRange?: TimeRange;
}

const timeRangeOptions = [
  { value: 'all' as TimeRange, label: 'All Times', icon: '🌅' },
  { value: 'morning' as TimeRange, label: 'Morning', icon: '🌄' },
  { value: 'afternoon' as TimeRange, label: 'Afternoon', icon: '☀️' },
  { value: 'evening' as TimeRange, label: 'Evening', icon: '🌆' },
];

export default function TimeRangeFilter({}: TimeRangeFilterProps) {
  const [timeRange, setTimeRange] = useQueryState('timeRange', {
    shallow: false,
    history: 'push',
    defaultValue: 'all',
  });
  const [isExpanded, setIsExpanded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleOptionClick = (value: TimeRange) => {
    setTimeRange(value);
    setIsExpanded(false);
  };

  const getCurrentLabel = () => {
    const option = timeRangeOptions.find((opt) => opt.value === timeRange);
    return option ? `${option.icon} ${option.label}` : 'Search';
  };

  // Handle clicks outside to close the menu
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsExpanded(false);
      }
    };

    if (isExpanded) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isExpanded]);

  return (
    <div
      ref={containerRef}
      className="fixed bottom-4 left-1/2 transform -translate-x-1/2 z-50 w-full max-w-sm px-4 sm:px-0"
    >
      {/* Expanded Options */}
      <div
        className={`bg-white/95 backdrop-blur-sm border border-gray-200 rounded-lg shadow-lg p-3 mb-2 transition-all duration-300 ease-in-out ${
          isExpanded
            ? 'opacity-100 transform translate-y-0'
            : 'opacity-0 transform translate-y-4 pointer-events-none'
        }`}
      >
        <div className="grid grid-cols-2 gap-2">
          {timeRangeOptions.map((option) => (
            <button
              key={option.value}
              onClick={() => handleOptionClick(option.value)}
              className={`p-3 rounded-md text-sm font-medium transition-all duration-200 ${
                timeRange === option.value
                  ? 'bg-blue-500 text-white shadow-md'
                  : 'bg-gray-50 text-gray-700 hover:bg-gray-100 hover:shadow-sm'
              }`}
            >
              <div className="text-center">
                <div className="text-lg mb-1">{option.icon}</div>
                <div>{option.label}</div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Search Button */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full bg-white/90 backdrop-blur-sm border border-gray-200 rounded-lg shadow-lg px-6 py-3 text-sm font-medium text-gray-700 hover:bg-white hover:shadow-xl transition-all duration-200 flex items-center justify-center gap-2"
      >
        <span>{getCurrentLabel()}</span>
        <svg
          className={`w-4 h-4 transition-transform duration-200 ${
            isExpanded ? 'rotate-180' : ''
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>
    </div>
  );
}
