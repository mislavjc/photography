import { EXT_RE } from 'lib/constants';
import { R2_URL } from 'lib/r2-url';

export function r2VariantUrl(
  uuidWithExt: string,
  profile: 'grid' | 'large',
  width: number,
  format: 'jpeg' | 'webp' = 'jpeg',
) {
  const base = uuidWithExt.replace(EXT_RE, '');
  return `${R2_URL}/variants/${profile}/${format}/${width}/${base}.${format}`;
}

export function toDataUri(buf: ArrayBuffer, mime: string = 'image/jpeg') {
  const b64 = Buffer.from(buf).toString('base64');
  return `data:${mime};base64,${b64}`;
}

export const GRID_INSET_TOP = 56;
export const GRID_INSET_BOTTOM = 56;
export const GRID_INSET_LEFT = 72;
export const GRID_INSET_RIGHT = 72;
export const GRID_THICKNESS = 1;
export const GRID_COLOR = 'rgba(0,0,0,0.14)';

export function OgGridLines() {
  return (
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
  );
}
