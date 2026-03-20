// app/(photos)/[photo-name]/opengraph-image.tsx
import { ImageResponse } from 'next/og';

import { loadManifest } from 'lib/manifest-server';
import {
  GRID_INSET_BOTTOM,
  GRID_INSET_LEFT,
  GRID_INSET_RIGHT,
  GRID_INSET_TOP,
  OgGridLines,
  r2VariantUrl,
  toDataUri,
} from 'lib/og-utils';

export const runtime = 'nodejs';
export const contentType = 'image/png';
export const size = { width: 1200, height: 630 };

type Params = { id: string };

async function fetchInlineBest(uuidWithExt: string) {
  const tries: Array<{ url: string; mime: 'image/jpeg' | 'image/webp' }> = [];
  for (const w of [1600, 1200, 800]) {
    tries.push({
      url: r2VariantUrl(uuidWithExt, 'large', w, 'jpeg'),
      mime: 'image/jpeg',
    });
    tries.push({
      url: r2VariantUrl(uuidWithExt, 'large', w, 'webp'),
      mime: 'image/webp',
    });
    tries.push({
      url: r2VariantUrl(uuidWithExt, 'grid', w, 'jpeg'),
      mime: 'image/jpeg',
    });
    tries.push({
      url: r2VariantUrl(uuidWithExt, 'grid', w, 'webp'),
      mime: 'image/webp',
    });
  }
  for (const t of tries) {
    try {
      const res = await fetch(t.url);
      if (!res.ok) continue;
      const buf = await res.arrayBuffer();
      if (buf.byteLength < 256) continue;
      return toDataUri(buf, t.mime);
    } catch {}
  }
  return null;
}

function truncate(s: string | null | undefined, max: number) {
  if (!s) return '';
  if (s.length <= max) return s;
  return s.slice(0, Math.max(0, max - 1)).trimEnd() + '…';
}

export default async function OpengraphImage({ params }: { params: Params }) {
  const photoName = params.id;

  const manifest = (await loadManifest()) as Record<
    string,
    {
      w: number;
      h: number;
      description?: string;
      exif?:
        | {
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
              address?: string | null;
            } | null;
          }
        | undefined;
    }
  >;

  const photo = manifest[photoName];
  if (!photo) {
    return new ImageResponse(
      <div
        tw="flex items-center justify-center"
        style={{
          width: size.width,
          height: size.height,
          background:
            'linear-gradient(180deg,#f5f5f7 0%,#efeff1 60%,#e5e5e8 100%)',
        }}
      >
        <div tw="flex text-neutral-700 text-xl font-medium">
          Photo not found
        </div>
      </div>,
      size,
    );
  }

  const dataUri = await fetchInlineBest(photoName);

  // Canvas & grid
  const W = size.width;
  const H = size.height;

  const innerW = W - GRID_INSET_LEFT - GRID_INSET_RIGHT;
  const innerH = H - GRID_INSET_TOP - GRID_INSET_BOTTOM;

  // Content paddings inside inner rect
  const PAD_X = 32;
  const PAD_Y = 28;

  // Two-column metadata widths (no calc())
  const COL_GAP = 32;
  const colW = Math.floor((innerW - PAD_X * 2 - COL_GAP) / 2);

  // Meta content
  const exif = photo.exif || {};
  const loc = exif.location || null;

  const title = truncate(photoName, 60);
  const dims = `${photo.w} × ${photo.h}`;
  const desc = truncate(photo.description || '', 220);

  // --- Orientation-aware photo sizing + clipping (bottom-right peek) ---
  const ar = photo.w / photo.h;

  // Tunables per orientation
  let VISIBLE_AREA = 0.32; // ~32% of area for square-ish
  let baseHFactor = 0.62; // render height ≈ 62% of canvas height
  let baseWCap = 0.62; // cap render width ≈ 62% of canvas width

  if (ar > 1.25) {
    // Landscape: show a bit more area, slightly wider cap
    VISIBLE_AREA = 0.38;
    baseHFactor = 0.56;
    baseWCap = 0.68;
  } else if (ar < 0.8) {
    // Portrait: show a bit less area, render taller so the corner feels substantial
    VISIBLE_AREA = 0.26;
    baseHFactor = 0.74;
    baseWCap = 0.54;
  }

  // Base render size (no calc(); pure numbers)
  let renderH = Math.round(H * baseHFactor);
  let renderW = Math.round(renderH * ar);
  const maxW = Math.round(W * baseWCap);
  if (renderW > maxW) {
    renderW = maxW;
    renderH = Math.round(renderW / ar);
  }

  // Clip so only ~VISIBLE_AREA of the image area is shown
  const dimFrac = Math.sqrt(VISIBLE_AREA); // dimension fraction
  const visibleW = Math.max(80, Math.round(renderW * dimFrac));
  const visibleH = Math.max(80, Math.round(renderH * dimFrac));
  const offsetX = renderW - visibleW; // shift to reveal bottom-right
  const offsetY = renderH - visibleH;

  // Build meta rows once, then split into two arrays
  const rows: Array<{ label: string; value: string }> = [
    { label: 'Camera', value: exif.camera || 'UNKNOWN' },
    { label: 'Lens', value: exif.lens || 'UNKNOWN' },
    { label: 'Focal', value: exif.focalLength || 'UNKNOWN' },
    { label: 'Aperture', value: exif.aperture || 'UNKNOWN' },
    { label: 'Shutter', value: exif.shutterSpeed || 'UNKNOWN' },
    { label: 'ISO', value: exif.iso || 'UNKNOWN' },
  ];
  if (exif.dateTime) rows.push({ label: 'Date', value: exif.dateTime });
  if (loc) {
    const address = loc.address;
    const coords = `LAT ${loc.latitude.toFixed(6)}  LNG ${loc.longitude.toFixed(6)}${
      loc.altitude != null ? `  ALT ${loc.altitude}m` : ''
    }`;

    // Show address if available, otherwise coordinates
    const locationValue = address ? address : coords;

    rows.push({
      label: 'Location',
      value: locationValue,
    });
  }

  // Split into two columns (alternate)
  const leftRows: typeof rows = [];
  const rightRows: typeof rows = [];
  for (let i = 0; i < rows.length; i++) {
    (i % 2 === 0 ? leftRows : rightRows).push(rows[i]!);
  }

  return new ImageResponse(
    <div
      tw="flex relative"
      style={{
        width: W,
        height: H,
        background:
          'linear-gradient(180deg,#f5f5f7 0%,#efeff1 60%,#e5e5e8 100%)',
        fontFamily: 'Geist, system-ui, -apple-system, sans-serif',
      }}
    >
      {/* GRID LINES — below content */}
      <OgGridLines />

      {/* CONTENT inside inner border */}
      <div
        tw="flex absolute"
        style={{
          left: GRID_INSET_LEFT,
          top: GRID_INSET_TOP,
          width: innerW,
          height: innerH,
          paddingLeft: PAD_X,
          paddingRight: PAD_X,
          paddingTop: PAD_Y,
          paddingBottom: PAD_Y,
        }}
      >
        <div tw="flex flex-col w-full h-full">
          {/* Title + dims */}
          <div tw="flex items-baseline justify-between">
            <div tw="flex text-neutral-900 text-2xl font-semibold">{title}</div>
            <div tw="flex text-neutral-600 text-sm">{dims}</div>
          </div>

          {/* Description */}
          {desc ? (
            <div tw="flex mt-6 text-base leading-relaxed text-neutral-700">
              {desc}
            </div>
          ) : null}

          {/* Meta grid: two fixed-width columns with a fixed gap (no calc) */}
          <div tw="flex mt-8">
            {/* Left column */}
            <div
              tw="flex flex-col"
              style={{ width: colW, marginRight: COL_GAP }}
            >
              {leftRows.map((r, i) => (
                <MetaRow key={`l-${i}`} label={r.label} value={r.value} />
              ))}
            </div>
            {/* Right column */}
            <div tw="flex flex-col" style={{ width: colW }}>
              {rightRows.map((r, i) => (
                <MetaRow key={`r-${i}`} label={r.label} value={r.value} />
              ))}
            </div>
          </div>

          <div tw="flex mt-auto" />
        </div>
      </div>

      {/* PHOTO: bottom-right, only ~20% visible */}
      <div
        tw="flex absolute overflow-hidden"
        style={{
          right: 0,
          bottom: 0,
          width: visibleW,
          height: visibleH,
          background: '#000',
        }}
      >
        <div tw="flex w-full h-full" style={{ position: 'relative' }}>
          {dataUri ? (
            <img
              src={dataUri}
              alt=""
              width={renderW}
              height={renderH}
              tw="block"
              style={{
                position: 'absolute',
                left: -offsetX,
                top: -offsetY,
                width: renderW,
                height: renderH,
                objectFit: 'cover',
              }}
            />
          ) : (
            <div tw="flex w-full h-full bg-neutral-300" />
          )}
        </div>
      </div>
    </div>,
    size,
  );
}

/** Simple meta row; no calc(), safe truncation */
function MetaRow({ label, value }: { label: string; value: string }) {
  const v = value.length > 56 ? value.slice(0, 55).trimEnd() + '…' : value;
  return (
    <div tw="flex items-baseline mt-3">
      <div
        tw="flex uppercase tracking-[0.12em] text-neutral-600 text-xs font-medium"
        style={{ width: 108 }}
      >
        {label}
      </div>
      <div tw="flex text-neutral-800 text-sm">{v}</div>
    </div>
  );
}
