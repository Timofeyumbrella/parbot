import { ImageResponse } from 'next/og';

export const alt = 'Parbot: an assistant for developer docs that answers with citations';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/**
 * The image renderer cannot read globals.css, so the dark scheme tokens are transcribed here
 * as sRGB. Keep them in step with the .dark block when the palette changes.
 */
const palette = {
  background: '#0a0c10',
  card: '#14161a',
  border: 'rgba(255, 255, 255, 0.1)',
  foreground: '#e9e8e4',
  mutedForeground: '#9b9fa5',
  muted: '#1f2226',
  primary: '#f9ad26',
  primaryForeground: '#260f00',
};

const Marker = ({ index }: { index: number }) => (
  <span
    style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: 30,
      height: 30,
      marginLeft: 8,
      borderRadius: 6,
      background: 'rgba(249, 173, 38, 0.18)',
      color: palette.primary,
      fontSize: 18,
      fontWeight: 600,
    }}
  >
    {index}
  </span>
);

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: 64,
          background: palette.background,
          color: palette.foreground,
          fontFamily: 'Geist, sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 30, fontWeight: 600 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 44,
              height: 44,
              borderRadius: 10,
              background: palette.primary,
              color: palette.primaryForeground,
              fontSize: 24,
              fontWeight: 700,
            }}
          >
            P
          </div>
          Parbot
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 48 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 620 }}>
            <div style={{ color: palette.primary, fontSize: 20, letterSpacing: 3, textTransform: 'uppercase' }}>
              Ask-AI for developer docs
            </div>
            <div style={{ fontSize: 56, lineHeight: 1.08, fontWeight: 600, letterSpacing: -1.5 }}>
              Give your docs an assistant that cites its sources.
            </div>
            <div style={{ color: palette.mutedForeground, fontSize: 24, lineHeight: 1.4 }}>
              One script tag. A bubble or a ⌘K palette. Every answer links to the page it came from.
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              width: 400,
              borderRadius: 16,
              background: palette.card,
              border: `1px solid ${palette.border}`,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '14px 20px',
                borderBottom: `1px solid ${palette.border}`,
                fontSize: 18,
              }}
            >
              <div style={{ width: 10, height: 10, borderRadius: 10, background: palette.primary }} />
              Acme Docs
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: 20, fontSize: 19, lineHeight: 1.4 }}>
              <div
                style={{
                  alignSelf: 'flex-end',
                  padding: '10px 14px',
                  borderRadius: 10,
                  background: palette.muted,
                }}
              >
                How do I rotate an API key?
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center' }}>
                Open Settings, then API keys, and choose Rotate next to the key.
                <Marker index={1} />
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  alignSelf: 'flex-start',
                  padding: '6px 10px',
                  borderRadius: 8,
                  border: `1px solid ${palette.border}`,
                  color: palette.mutedForeground,
                  fontSize: 16,
                }}
              >
                <span style={{ color: palette.primary, fontWeight: 600 }}>1</span>
                Authentication › API keys
              </div>
            </div>
          </div>
        </div>
      </div>
    ),
    size,
  );
}
