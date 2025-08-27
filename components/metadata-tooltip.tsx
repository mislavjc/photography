'use client';

import React from 'react';

import type { ImageMetadata } from '../types';

interface MetadataTooltipProps {
  metadata: ImageMetadata | null;
  position: { x: number; y: number };
}

export const MetadataTooltip = ({
  metadata,
  position,
}: MetadataTooltipProps) => {
  if (!metadata) return null;

  const { exif } = metadata;
  const isDevelopment = process.env.NODE_ENV === 'development';

  // Helper function to format date
  const formatDate = (dateString: string | null) => {
    if (!dateString) return null;
    try {
      // Handle different date formats
      let date: Date;

      // If it's already a valid ISO string, parse it directly
      if (dateString.includes('T')) {
        date = new Date(dateString);
      } else {
        // Try to parse other formats
        date = new Date(dateString);
      }

      if (isNaN(date.getTime())) {
        return dateString; // Return as-is if parsing fails
      }

      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch (error) {
      console.log('Date parsing error:', error, 'for dateString:', dateString);
      return dateString;
    }
  };

  // Helper function to format location
  const formatLocation = (
    location: { latitude: number; longitude: number; altitude?: number } | null,
  ) => {
    if (!location || !location.latitude || !location.longitude) return null;
    return `${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}`;
  };

  return (
    <div
      className="fixed z-50 bg-black/95 text-white p-4 rounded-lg shadow-xl pointer-events-none max-w-sm border border-gray-700"
      style={{
        left: position.x + 10,
        top: position.y + 10,
        transform: 'translate(0, 0)',
      }}
    >
      <div className="space-y-2 text-sm">
        {/* Filename */}
        <div
          className="font-semibold text-blue-300 truncate text-base"
          title={metadata.filename}
        >
          {metadata.filename}
        </div>

        {/* Dimensions and Orientation */}
        <div className="text-gray-300 flex gap-2">
          <span>
            {metadata.dimensions.w} × {metadata.dimensions.h} px
          </span>
          <span className="capitalize text-gray-400">•</span>
          <span className="capitalize text-gray-400">
            {metadata.orientation}
          </span>
        </div>

        {/* EXIF Data - Only in Development */}
        {isDevelopment ? (
          <>
            {/* Camera and Lens */}
            {(exif.camera || exif.lens) && (
              <div className="border-t border-gray-600 pt-2">
                {exif.camera && (
                  <div className="font-medium text-white">{exif.camera}</div>
                )}
                {exif.lens && (
                  <div className="text-gray-300 text-sm">{exif.lens}</div>
                )}
              </div>
            )}

            {/* Camera Settings */}
            {(exif.focalLength ||
              exif.aperture ||
              exif.shutterSpeed ||
              exif.iso) && (
              <div className="border-t border-gray-600 pt-2">
                <div className="text-xs text-gray-400 mb-1 uppercase tracking-wider">
                  Settings
                </div>
                <div className="grid grid-cols-2 gap-1 text-sm">
                  {exif.focalLength && (
                    <div className="text-white">{exif.focalLength}</div>
                  )}
                  {exif.aperture && (
                    <div className="text-white">{exif.aperture}</div>
                  )}
                  {exif.shutterSpeed && (
                    <div className="text-white">{exif.shutterSpeed}</div>
                  )}
                  {exif.iso && <div className="text-white">{exif.iso}</div>}
                </div>
              </div>
            )}

            {/* Location */}
            {exif.location && formatLocation(exif.location) && (
              <div className="border-t border-gray-600 pt-2">
                <div className="text-xs text-gray-400 mb-1 uppercase tracking-wider">
                  Location
                </div>
                <div className="text-white text-sm">
                  {formatLocation(exif.location)}
                </div>
              </div>
            )}

            {/* Date/Time */}
            {exif.dateTime && formatDate(exif.dateTime) && (
              <div className="border-t border-gray-600 pt-2">
                <div className="text-xs text-gray-400 mb-1 uppercase tracking-wider">
                  Captured
                </div>
                <div className="text-white text-sm">
                  {formatDate(exif.dateTime)}
                </div>
              </div>
            )}

            {/* Dominant Color */}
            {exif.dominantColors && exif.dominantColors.length > 0 && (
              <div className="border-t border-gray-600 pt-2">
                <div className="text-xs text-gray-400 mb-2 uppercase tracking-wider">
                  Dominant Color
                </div>
                <div className="flex items-center gap-2">
                  <div
                    className="w-8 h-8 rounded-lg border border-gray-400 shadow-sm"
                    style={{ backgroundColor: exif.dominantColors[0].hex }}
                    title={`${exif.dominantColors[0].hex} - Background color`}
                  />
                  <div className="text-sm text-white font-mono">
                    {exif.dominantColors[0].hex.toUpperCase()}
                  </div>
                </div>
              </div>
            )}

            {/* No metadata available */}
            {!exif.camera &&
              !exif.lens &&
              !exif.focalLength &&
              !exif.aperture &&
              !exif.shutterSpeed &&
              !exif.iso &&
              !exif.location &&
              !exif.dateTime && (
                <div className="border-t border-gray-600 pt-2 text-gray-400 text-sm">
                  No EXIF metadata available
                </div>
              )}
          </>
        ) : (
          /* Production - Simple message */
          <div className="border-t border-gray-600 pt-2 text-gray-400 text-sm">
            {metadata.filename}
          </div>
        )}
      </div>
    </div>
  );
};
