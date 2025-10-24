'use client';

import React from 'react';
import { useQueryState } from 'nuqs';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '../components/ui/select';
import { getColorOptions } from '../lib/color-filter';
import type { ColorRange, TimeRange } from '../types';

const colorOptions = getColorOptions();

const timeRangeOptions = [
  { value: 'all' as TimeRange, label: 'All Times', icon: '🌅' },
  { value: 'morning' as TimeRange, label: 'Morning', icon: '🌄' },
  { value: 'afternoon' as TimeRange, label: 'Afternoon', icon: '☀️' },
  { value: 'evening' as TimeRange, label: 'Evening', icon: '🌆' },
  { value: 'night' as TimeRange, label: 'Night', icon: '🌃' },
];

export const PhotoFilter = () => {
  const [colorRange, setColorRange] = useQueryState('colorRange', {
    shallow: false,
    history: 'push',
    defaultValue: 'all',
  });

  const [timeRange, setTimeRange] = useQueryState('timeRange', {
    shallow: false,
    history: 'push',
    defaultValue: 'all',
  });

  // Ensure colorOptions is available
  if (!colorOptions || colorOptions.length === 0) {
    return null;
  }

  const getColorLabel = () => {
    const option = colorOptions.find((opt) => opt.value === colorRange);
    return option ? option.label : 'All Colors';
  };

  const getTimeLabel = () => {
    const option = timeRangeOptions.find((opt) => opt.value === timeRange);
    return option ? option.label : 'All Times';
  };

  return (
    <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 z-50 w-full max-w-xl px-4 sm:px-0">
      <div className="bg-white/90 backdrop-blur-sm border border-gray-200 rounded-lg shadow-lg px-6 py-4 text-sm font-medium text-gray-700 hover:bg-white hover:shadow-xl transition-all duration-200">
        <div className="flex items-center gap-3 flex-wrap justify-center">
          <span className="text-gray-600">Show photos from</span>

          <Select
            value={timeRange}
            onValueChange={(value) => setTimeRange(value as TimeRange)}
          >
            <SelectTrigger className="bg-white/80 border border-gray-300 rounded-md px-3 py-1 text-sm font-medium min-w-[120px] shadow-sm hover:bg-white hover:shadow-md transition-all duration-200">
              <span className="flex items-center gap-1">
                {timeRangeOptions.find((opt) => opt.value === timeRange)?.icon}
                {getTimeLabel()}
              </span>
            </SelectTrigger>
            <SelectContent className="bg-white/95 backdrop-blur-sm border border-gray-200">
              <div className="grid grid-cols-1 gap-1 p-1">
                {timeRangeOptions.map((option) => (
                  <SelectItem
                    key={option.value}
                    value={option.value}
                    className="p-2 rounded-md text-sm font-medium transition-all duration-200 cursor-pointer hover:bg-gray-50"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{option.icon}</span>
                      <span>{option.label}</span>
                    </div>
                  </SelectItem>
                ))}
              </div>
            </SelectContent>
          </Select>

          <span className="text-gray-600">in color</span>

          <Select
            value={colorRange}
            onValueChange={(value) => setColorRange(value as ColorRange)}
          >
            <SelectTrigger className="bg-white/80 border border-gray-300 rounded-md px-3 py-1 text-sm font-medium min-w-[120px] shadow-sm hover:bg-white hover:shadow-md transition-all duration-200">
              <span className="flex items-center gap-1">
                🎨 {getColorLabel()}
              </span>
            </SelectTrigger>
            <SelectContent className="bg-white/95 backdrop-blur-sm border border-gray-200">
              <div className="grid grid-cols-3 gap-2 p-2">
                {colorOptions.map((option) => (
                  <SelectItem
                    key={option.value}
                    value={option.value}
                    className="p-2 rounded-md text-sm font-medium transition-all duration-200 cursor-pointer hover:bg-gray-50"
                  >
                    <div className="text-center">
                      <div
                        className="w-6 h-6 rounded-full mx-auto mb-1 border-2 border-gray-300"
                        style={{ backgroundColor: option.hex }}
                      />
                      <div className="text-xs">{option.label}</div>
                    </div>
                  </SelectItem>
                ))}
              </div>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
};
