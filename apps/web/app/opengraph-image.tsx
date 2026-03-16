import { ImageResponse } from 'next/og';

import { R2_URL } from 'lib/env';
import { loadManifest } from 'lib/manifest-server';

export const runtime = 'nodejs';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

function r2VariantUrl(
  uuidWithExt: string,
  profile: 'grid' | 'large',
  width: number,
  format: 'jpeg' | 'webp' = 'jpeg',
) {
  const base = uuidWithExt.replace(/\.[^.]+$/, '');
  return `${R2_URL}/variants/${profile}/${format}/${width}/${base}.${format}`;
}

function toDataUri(buf: ArrayBuffer, mime = 'image/jpeg') {
  const b64 = Buffer.from(buf).toString('base64');
  return `data:${mime};base64,${b64}`;
}

type ManifestEntry = {
  width?: number;
  height?: number;
  w?: number;
  h?: number;
};

export default async function OpengraphImage() {
  const manifest = (await loadManifest()) as Record<string, ManifestEntry>;
  const all = Object.keys(manifest);

  const files = all.slice(0, Math.min(42, all.length));

  const items = files.map((id) => {
    const meta = manifest[id] || {};
    const width = (meta.width ?? meta.w) || undefined;
    const height = (meta.height ?? meta.h) || undefined;
    return {
      id,
      width,
      height,
      aspect: width && height ? width / height : 1,
      url: r2VariantUrl(id, 'grid', 800, 'jpeg'),
    };
  });

  const dataUris = await Promise.all(
    items.map(async (it) => {
      try {
        const res = await fetch(it.url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const buf = await res.arrayBuffer();
        return toDataUri(buf, 'image/jpeg');
      } catch {
        return null;
      }
    }),
  );

  const imgs = items
    .map((it, i) => ({ ...it, src: dataUris[i] }))
    .filter((it): it is typeof it & { src: string } => !!it.src);

  const W = size.width;
  const H = size.height;
  const PAD = 20;

  // ---- Grid insets & label geometry ----
  const GRID_INSET_TOP = 56;
  const GRID_INSET_BOTTOM = 56; // bottom X line is at y = H - GRID_INSET_BOTTOM
  const GRID_INSET_LEFT = 72;
  const GRID_INSET_RIGHT = 72; // right Y line is at x = W - GRID_INSET_RIGHT
  const GRID_THICKNESS = 1;
  const GRID_COLOR = 'rgba(0,0,0,0.14)';

  // Label sits in the band between bottom X line and bottom edge,
  // right-aligned, just to the left of the right Y line.
  const bandHeight = GRID_INSET_BOTTOM;
  const labelBottomOffset = bandHeight / 2; // vertically centered in the band

  // Exclusion zone to protect label:
  // horizontally: a safe width to the LEFT of the right Y line
  // vertically: the whole bottom band (from bottom line to bottom edge)
  const LABEL_SAFE_W = 360; // <- adjust width of protected zone as needed
  const SAFE_PAD = 8; // extra padding from lines
  const exRight = W - GRID_INSET_RIGHT - SAFE_PAD;
  const exLeft = exRight - LABEL_SAFE_W;
  const exTop = H - GRID_INSET_BOTTOM; // bottom X line
  const exBottom = H; // bottom edge

  // helpers
  function randBetween(min: number, max: number) {
    return min + Math.random() * (max - min);
  }
  function intersects(ax: number, ay: number, aw: number, ah: number) {
    const bx = exLeft,
      by = exTop,
      bw = exRight - exLeft,
      bh = exBottom - exTop;
    return !(ax + aw <= bx || bx + bw <= ax || ay + ah <= by || by + bh <= ay);
  }
  function placeTile(w: number, h: number) {
    // try random spots; if still colliding, clamp away from zone
    const maxLeft = W - PAD - w;
    const maxTop = H - PAD - h;
    for (let t = 0; t < 24; t++) {
      const x = Math.floor(randBetween(PAD, Math.max(PAD, maxLeft)));
      const y = Math.floor(randBetween(PAD, Math.max(PAD, maxTop)));
      if (!intersects(x, y, w, h)) return { x, y };
    }
    // final clamp: keep above band OR left of the safe area
    const x = Math.min(
      Math.max(PAD, exLeft - SAFE_PAD - w),
      Math.max(PAD, maxLeft),
    );
    const y = Math.min(
      Math.max(PAD, exTop - SAFE_PAD - h),
      Math.max(PAD, maxTop),
    );
    return { x, y };
  }

  // Per-orientation target ranges
  const LAND = { minW: 220, maxW: 320 };
  const PORT = { minH: 220, maxH: 320 };
  const SQR = { min: 220, max: 280 };

  // Build oriented tiles with exclusion-aware placement
  const photos = imgs
    .map((it) => {
      const ar = it.aspect || 1;
      let w: number, h: number;

      if (ar > 1.08) {
        const targetW = randBetween(LAND.minW, LAND.maxW);
        w = targetW;
        h = Math.max(80, Math.round(targetW / ar));
      } else if (ar < 0.92) {
        const targetH = randBetween(PORT.minH, PORT.maxH);
        h = targetH;
        w = Math.max(80, Math.round(targetH * ar));
      } else {
        const s = randBetween(SQR.min, SQR.max);
        w = s;
        h = s;
      }

      const { x, y } = placeTile(w, h);

      return {
        src: it.src,
        x,
        y,
        w,
        h,
        rotate: -10 + Math.random() * 20,
        z: Math.random(),
      };
    })
    .sort((a, b) => a.z - b.z);

  return new ImageResponse(
    <div
      tw="flex relative items-center justify-center"
      style={{
        width: W,
        height: H,
        background:
          'linear-gradient(180deg, #f5f5f7 0%, #efeff1 60%, #e5e5e8 100%)',
      }}
    >
      {/* GRID LINES (below photos) */}
      <div tw="flex absolute inset-0">
        {/* Top */}
        <div
          tw="flex"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: GRID_INSET_TOP,
            height: GRID_THICKNESS,
            background: GRID_COLOR,
          }}
        />
        {/* Bottom */}
        <div
          tw="flex"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: GRID_INSET_BOTTOM,
            height: GRID_THICKNESS,
            background: GRID_COLOR,
          }}
        />
        {/* Left */}
        <div
          tw="flex"
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: GRID_INSET_LEFT,
            width: GRID_THICKNESS,
            background: GRID_COLOR,
          }}
        />
        {/* Right */}
        <div
          tw="flex"
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            right: GRID_INSET_RIGHT,
            width: GRID_THICKNESS,
            background: GRID_COLOR,
          }}
        />
      </div>

      {/* PHOTOS */}
      <div tw="flex absolute inset-0">
        {photos.map((p, i) => (
          <div
            key={i}
            tw="flex overflow-hidden"
            style={{
              position: 'absolute',
              left: p.x,
              top: p.y,
              width: p.w,
              height: p.h,
              transform: `rotate(${p.rotate}deg)`,
              background: '#000',
            }}
          >
            <div tw="flex w-full h-full">
              <img
                src={p.src}
                alt=""
                width={p.w}
                height={p.h}
                tw="block w-full h-full object-cover"
                style={{ objectFit: 'cover' }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* LABEL — monospace; right-aligned; centered in bottom band; left of right Y line */}
      <div
        tw="flex absolute"
        style={{
          right: GRID_INSET_RIGHT + SAFE_PAD,
          bottom: labelBottomOffset,
        }}
      >
        <span
          tw="text-gray-800 text-lg"
          style={{
            fontFamily:
              'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
          }}
        >
          ~/users/mislav/photos
        </span>
      </div>
    </div>,
    { ...size },
  );
}
