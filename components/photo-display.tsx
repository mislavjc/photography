import React from 'react';

interface MetadataItemProps {
  label: string;
  value: string | number;
  large?: boolean;
}

function formatDateTime(dateTimeString: string | null | undefined): string {
  if (!dateTimeString) return 'Unknown';

  try {
    // Extract timezone offset from the original string (e.g., "+08:00" from "2025-06-11T16:26:51+08:00")
    const timezoneMatch = dateTimeString.match(/([+-])(\d{2}):?(\d{2})?$/);
    let timezoneString = 'UTC';

    if (timezoneMatch) {
      const sign = timezoneMatch[1];
      const hours = parseInt(timezoneMatch[2], 10);
      const minutes = timezoneMatch[3] ? parseInt(timezoneMatch[3], 10) : 0;

      if (hours === 0 && minutes === 0) {
        timezoneString = 'UTC';
      } else {
        timezoneString = `UTC${sign}${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
      }
    }

    // Create date object and format it
    const date = new Date(dateTimeString);

    // Format date (e.g., "June 11, 2025")
    const dateFormatter = new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    // Format time (e.g., "4:26 PM")
    const timeFormatter = new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });

    const formattedDate = dateFormatter.format(date);
    const formattedTime = timeFormatter.format(date);

    return `${formattedDate} at ${formattedTime} (${timezoneString})`;
  } catch {
    return dateTimeString; // Return original string if parsing fails
  }
}

function MetadataItem({ label, value, large = false }: MetadataItemProps) {
  return (
    <div>
      <div className="font-semibold text-sm text-gray-600 mb-1">{label}</div>
      <div className={large ? 'text-lg' : ''}>{value}</div>
    </div>
  );
}

interface PhotoData {
  blurhash?: string;
  w: number;
  h: number;
  exif: {
    camera?: string | null;
    lens?: string | null;
    focalLength?: string | null;
    aperture?: string | null;
    shutterSpeed?: string | null;
    iso?: string | null;
    dateTime?: string | null;
    location?: {
      latitude: number;
      longitude: number;
      altitude?: number;
    } | null;
    dominantColors?: Array<{
      hex: string;
      rgb: { r: number; g: number; b: number };
      percentage: number;
    }> | null;
  };
}

interface PhotoDisplayProps {
  photoName: string;
  photoData: PhotoData;
  showNotFoundMessage?: boolean;
  customTitle?: string;
}

export function PhotoDisplay({
  photoName,
  photoData,
  showNotFoundMessage = false,
  customTitle,
}: PhotoDisplayProps) {
  return (
    <div className="w-full flex flex-col lg:flex-row gap-8">
      <img
        src={`https://r2.photography.mislavjc.com/originals/${photoName}`}
        alt={photoName}
        className="block h-full object-contain max-h-[calc(100vh-12rem)]"
        draggable={false}
      />

      <div className="flex-shrink-0 lg:w-96 self-start lg:ml-auto">
        <div className="space-y-3">
          {showNotFoundMessage && (
            <div className="mb-4">
              <div className="text-sm text-gray-500 mb-2">
                Photo Not Found - Showing Random Photo Instead
              </div>
              <div className="font-semibold text-lg text-gray-800">
                {customTitle || photoName}
              </div>
            </div>
          )}

          {!showNotFoundMessage && !customTitle && (
            <div className="mb-4">
              <div className="font-semibold text-lg text-gray-800">
                {photoName}
              </div>
            </div>
          )}

          <MetadataItem
            label="DIMENSIONS"
            value={`${photoData.w} × ${photoData.h}`}
            large
          />
          <MetadataItem
            label="CAMERA"
            value={photoData.exif.camera || 'Unknown'}
          />
          <MetadataItem label="LENS" value={photoData.exif.lens || 'Unknown'} />
          <MetadataItem
            label="FOCAL LENGTH"
            value={photoData.exif.focalLength || 'Unknown'}
          />
          <MetadataItem
            label="APERTURE"
            value={photoData.exif.aperture || 'Unknown'}
          />
          <MetadataItem
            label="SHUTTER SPEED"
            value={photoData.exif.shutterSpeed || 'Unknown'}
          />
          <MetadataItem label="ISO" value={photoData.exif.iso || 'Unknown'} />
          <MetadataItem
            label="DATE"
            value={formatDateTime(photoData.exif.dateTime)}
          />

          {photoData.exif.location && (
            <div>
              <div className="font-semibold text-sm text-gray-600 mb-1">
                LOCATION
              </div>
              <div className="text-sm">
                <div>
                  {photoData.exif.location.latitude.toFixed(6)},{' '}
                  {photoData.exif.location.longitude.toFixed(6)}
                </div>
                {photoData.exif.location.altitude && (
                  <div>{photoData.exif.location.altitude}m altitude</div>
                )}
              </div>
            </div>
          )}

          {photoData.exif.dominantColors &&
            photoData.exif.dominantColors.length > 0 && (
              <div>
                <div className="font-semibold text-sm text-gray-600 mb-1">
                  DOMINANT COLOR
                </div>
                <div className="flex items-center gap-2">
                  <div
                    className="w-4 h-4 border border-gray-300"
                    style={{
                      backgroundColor: photoData.exif.dominantColors[0].hex,
                    }}
                  ></div>
                  <div className="text-sm">
                    {photoData.exif.dominantColors[0].hex}
                  </div>
                </div>
              </div>
            )}

          {photoData.blurhash && (
            <div>
              <div className="font-semibold text-sm text-gray-600 mb-1">
                BLURHASH
              </div>
              <div className="text-xs font-mono bg-gray-100 p-2 rounded break-all">
                {photoData.blurhash}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
